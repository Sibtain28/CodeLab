import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireProjectAccess } from "@/server/dal";
import { rateLimit } from "@/server/rate-limit";
import { signTerminalToken } from "@/server/terminal-token";

const runSchema = z.object({
  projectId: z.string().max(64),
  executionId: z.string().max(128).optional(),
  language: z.enum(["Python", "JavaScript", "TypeScript", "C++", "Go"]),
  files: z.record(z.string(), z.string()),
  entrypoint: z.string().max(256),
  timeoutMs: z.number().int().positive().max(30000).optional(),
  interactive: z.boolean().optional(),
});

const RUNNER_URL = process.env.RUNNER_URL || "http://127.0.0.1:4000";
const RUNNER_SECRET =
  process.env.RUNNER_SECRET || process.env.BETTER_AUTH_SECRET || "codelab-runner-dev-secret";

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = runSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid execution request parameters." }, { status: 400 });
    }

    const { projectId, language, files, entrypoint, timeoutMs, interactive } = parsed.data;

    // Validate entrypoint
    if (
      entrypoint.startsWith("-") ||
      entrypoint.includes("..") ||
      entrypoint.includes("\0") ||
      !Object.prototype.hasOwnProperty.call(files, entrypoint)
    ) {
      return NextResponse.json(
        { ok: false, error: `Invalid entrypoint '${entrypoint}': must be a valid file in workspace.` },
        { status: 400 },
      );
    }

    // Validate workspace files size
    const fileEntries = Object.entries(files);
    if (fileEntries.length > 100) {
      return NextResponse.json({ ok: false, error: "Too many files (max 100 allowed)." }, { status: 400 });
    }
    let totalChars = 0;
    for (const [, content] of fileEntries) {
      totalChars += content.length;
      if (totalChars > 5_000_000) {
        return NextResponse.json({ ok: false, error: "Workspace files exceed 5MB limit." }, { status: 400 });
      }
    }

    // Client IP for demo abuse protection
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

    let userId: string;
    let isProjectOwner = false;

    // Verify access: allow demo workspace or verify member authorization
    if (projectId !== "demo") {
      try {
        const access = await requireProjectAccess(projectId);
        userId = access.user.id;
        isProjectOwner = access.role === "OWNER";
      } catch {
        return NextResponse.json(
          { ok: false, error: "You are not authorized to run code in this workspace." },
          { status: 403 },
        );
      }
    } else {
      userId = `demo:${clientIp}`;
      isProjectOwner = true;
      // Enforce rate limiting on demo workspace (6 executions per minute)
      const limit = rateLimit(`run:demo:${clientIp}`, 6, 60_000);
      if (!limit.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: "Rate limit reached for demo workspace. Please wait a moment or sign in.",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(limit.retryAfterSec),
            },
          },
        );
      }
    }

    // Server generates cryptographically secure, unique execution ID
    const serverExecutionId = `exec_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

    // Connect to runner service with internal secret authentication
    let runnerResponse: Response;
    try {
      runnerResponse = await fetch(`${RUNNER_URL}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Runner-Secret": RUNNER_SECRET,
        },
        body: JSON.stringify({
          executionId: serverExecutionId,
          projectId,
          userId,
          language,
          files,
          entrypoint,
          timeoutMs,
          interactive: !!interactive,
        }),
        signal: request.signal,
      });
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Execution runner is offline. Please start it with 'npm run runner' (and ensure Docker is running).",
        },
        { status: 503 },
      );
    }

    if (!runnerResponse.ok) {
      const errorData = await runnerResponse.json().catch(() => ({}));
      return NextResponse.json(
        {
          ok: false,
          error: (errorData as { error?: string }).error || `Runner returned status ${runnerResponse.status}`,
        },
        { status: runnerResponse.status },
      );
    }

    // Interactive mode: issue terminal token and return connection metadata
    if (interactive) {
      const token = signTerminalToken(
        {
          uid: userId,
          pid: projectId,
          executionId: serverExecutionId,
          isProjectOwner,
          exp: Date.now() + 5 * 60 * 1000,
        },
        RUNNER_SECRET,
      );

      return NextResponse.json({
        ok: true,
        interactive: true,
        executionId: serverExecutionId,
        entrypoint,
        language,
        isOwner: true,
        canStop: true,
        token,
      });
    }

    // Non-interactive batch mode: stream Server-Sent Events from runner to client
    return new Response(runnerResponse.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Execution-Id": serverExecutionId,
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
