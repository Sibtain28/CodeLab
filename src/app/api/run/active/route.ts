import { type NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/server/dal";
import { signTerminalToken } from "@/server/terminal-token";
import type { ActiveExecutionInfo } from "../../../../../runner/types";

const RUNNER_URL = process.env.RUNNER_URL || "http://127.0.0.1:4000";
const RUNNER_SECRET =
  process.env.RUNNER_SECRET || process.env.BETTER_AUTH_SECRET || "codelab-runner-dev-secret";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });
    }

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

    // Query runner service for active execution in this project
    let runnerRes: Response;
    try {
      runnerRes = await fetch(`${RUNNER_URL}/project/${encodeURIComponent(projectId)}/active`, {
        method: "GET",
        headers: {
          "X-Runner-Secret": RUNNER_SECRET,
        },
      });
    } catch {
      return NextResponse.json({ ok: true, active: null });
    }

    if (!runnerRes.ok) {
      return NextResponse.json({ ok: true, active: null });
    }

    const data = (await runnerRes.json()) as { ok: boolean; active?: ActiveExecutionInfo | null };
    const active = data.active;
    if (!active) {
      return NextResponse.json({ ok: true, active: null });
    }

    // Sign terminal token for this user to connect as observer or owner
    const token = signTerminalToken(
      {
        uid: userId,
        pid: projectId,
        executionId: active.executionId,
        isProjectOwner,
        exp: Date.now() + 5 * 60 * 1000,
      },
      RUNNER_SECRET,
    );

    const isOwner = Boolean(active.userId && active.userId === userId);
    const canStop = isOwner || isProjectOwner;

    return NextResponse.json({
      ok: true,
      active: {
        ...active,
        token,
        isOwner,
        canStop,
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
