import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireProjectAccess } from "@/server/dal";

const stopSchema = z.object({
  projectId: z.string().max(64),
  executionId: z.string().max(128),
});

const RUNNER_URL = process.env.RUNNER_URL || "http://127.0.0.1:4000";
const RUNNER_SECRET =
  process.env.RUNNER_SECRET || process.env.BETTER_AUTH_SECRET || "codelab-runner-dev-secret";

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = stopSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid stop request parameters." }, { status: 400 });
    }

    const { projectId, executionId } = parsed.data;
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

    let userId: string;
    let isProjectOwner = false;

    // Verify access
    if (projectId !== "demo") {
      try {
        const access = await requireProjectAccess(projectId);
        userId = access.user.id;
        isProjectOwner = access.role === "OWNER";
      } catch {
        return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 403 });
      }
    } else {
      userId = `demo:${clientIp}`;
      isProjectOwner = true;
    }

    // Forward to runner service with identity and secret
    let runnerRes: Response;
    try {
      runnerRes = await fetch(`${RUNNER_URL}/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Runner-Secret": RUNNER_SECRET,
        },
        body: JSON.stringify({ executionId, projectId, userId, isProjectOwner }),
      });
    } catch {
      return NextResponse.json({ ok: true, stopped: true });
    }

    if (!runnerRes.ok) {
      const errData = await runnerRes.json().catch(() => ({}));
      return NextResponse.json(
        { ok: false, error: (errData as { error?: string }).error || "Failed to stop execution." },
        { status: runnerRes.status },
      );
    }

    return NextResponse.json({ ok: true, stopped: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
