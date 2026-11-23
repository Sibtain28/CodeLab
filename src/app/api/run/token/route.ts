import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireProjectAccess } from "@/server/dal";
import { signTerminalToken } from "@/server/terminal-token";

const tokenSchema = z.object({
  projectId: z.string().max(64),
  executionId: z.string().max(128),
});

const RUNNER_SECRET =
  process.env.RUNNER_SECRET || process.env.BETTER_AUTH_SECRET || "codelab-runner-dev-secret";

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = tokenSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid parameters." }, { status: 400 });
    }

    const { projectId, executionId } = parsed.data;
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

    let userId: string;
    let isProjectOwner = false;

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

    const token = signTerminalToken(
      {
        uid: userId,
        pid: projectId,
        executionId,
        isProjectOwner,
        exp: Date.now() + 5 * 60 * 1000,
      },
      RUNNER_SECRET,
    );

    return NextResponse.json({
      ok: true,
      token,
      canStop: isProjectOwner,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
