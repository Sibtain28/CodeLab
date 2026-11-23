import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  isDockerAvailable,
  executeInDocker,
  stopExecution,
  getActiveExecutionCount,
  getProjectActiveExecution,
  attachTerminalSocket,
  waitForExecutionStart,
  MAX_CONCURRENT_EXECUTIONS,
} from "./docker";
import { verifyTerminalToken } from "./token";
import type { RunRequest, StopRequest, HealthResponse } from "./types";

const RUNNER_SECRET =
  process.env.RUNNER_SECRET || process.env.BETTER_AUTH_SECRET || "codelab-runner-dev-secret";

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(data));
}

function verifyRunnerAuth(req: IncomingMessage): boolean {
  const secretHeader = req.headers["x-runner-secret"];
  const authHeader = req.headers.authorization;
  if (secretHeader && secretHeader === RUNNER_SECRET) {
    return true;
  }
  if (authHeader && authHeader.startsWith("Bearer ") && authHeader.slice(7) === RUNNER_SECRET) {
    return true;
  }
  return false;
}

async function readBody<T>(req: IncomingMessage, maxBytes = 6_000_000): Promise<T> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        req.destroy();
        reject(new Error("Request payload too large."));
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => {
      try {
        const bodyStr = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(bodyStr || "{}") as T);
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

export function createRunnerServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);

    // Health check (reports status and concurrency)
    if (req.method === "GET" && url.pathname === "/health") {
      const dockerStatus = await isDockerAvailable();
      const response: HealthResponse = {
        ok: true,
        service: "codelab-runner",
        docker: dockerStatus.ok,
        version: dockerStatus.version,
        error: dockerStatus.error,
        concurrency: {
          active: getActiveExecutionCount(),
          max: MAX_CONCURRENT_EXECUTIONS,
        },
      };
      return sendJson(res, 200, response);
    }

    // Active project execution lookup
    if (req.method === "GET" && url.pathname.startsWith("/project/") && url.pathname.endsWith("/active")) {
      if (!verifyRunnerAuth(req)) {
        return sendJson(res, 401, { ok: false, error: "Unauthorized runner request." });
      }
      const parts = url.pathname.split("/");
      const projectId = parts[2];
      if (!projectId) {
        return sendJson(res, 400, { ok: false, error: "Missing projectId." });
      }
      const active = getProjectActiveExecution(projectId);
      return sendJson(res, 200, { ok: true, active: active ?? null });
    }

    // Stop execution (requires runner secret authentication)
    if (req.method === "POST" && url.pathname === "/stop") {
      if (!verifyRunnerAuth(req)) {
        return sendJson(res, 401, { ok: false, error: "Unauthorized runner request." });
      }
      try {
        const body = await readBody<StopRequest>(req);
        if (!body.executionId) {
          return sendJson(res, 400, { ok: false, error: "Missing executionId." });
        }
        const result = await stopExecution(body);
        if (!result.ok) {
          const status = result.error?.startsWith("Forbidden") ? 403 : 404;
          return sendJson(res, status, { ok: false, error: result.error });
        }
        return sendJson(res, 200, { ok: true, stopped: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: (err as Error).message });
      }
    }

    // Run execution (SSE stream or interactive initialization)
    if (req.method === "POST" && url.pathname === "/run") {
      if (!verifyRunnerAuth(req)) {
        return sendJson(res, 401, { ok: false, error: "Unauthorized runner request." });
      }
      try {
        const docker = await isDockerAvailable();
        if (!docker.ok) {
          return sendJson(res, 503, {
            ok: false,
            error: `Docker is not available: ${docker.error || "Daemon not running"}`,
          });
        }

        if (getActiveExecutionCount() >= MAX_CONCURRENT_EXECUTIONS) {
          return sendJson(res, 429, {
            ok: false,
            error: `Execution capacity limit reached (${MAX_CONCURRENT_EXECUTIONS} max concurrent). Please retry shortly.`,
          });
        }

        const body = await readBody<RunRequest>(req);
        if (!body.executionId || !body.language || !body.files || !body.entrypoint) {
          return sendJson(res, 400, { ok: false, error: "Invalid execution payload." });
        }

        // Interactive execution mode (WebSocket attachment)
        if (body.interactive) {
          // Launch execution in background and wait for it to transition to running
          const runPromise = executeInDocker(body, () => { }).catch(() => { });
          void runPromise;

          const started = await waitForExecutionStart(body.executionId, 8000);
          if (!started) {
            return sendJson(res, 500, {
              ok: false,
              error: "Container startup timed out or failed to initialize.",
            });
          }

          return sendJson(res, 200, {
            ok: true,
            interactive: true,
            executionId: body.executionId,
          });
        }

        // Non-interactive batch execution mode (Server-Sent Events stream)
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });

        // Handle client disconnect during SSE execution
        req.on("close", () => {
          if (!res.writableEnded) {
            stopExecution({
              executionId: body.executionId,
              projectId: body.projectId,
              userId: body.userId,
            }).catch(() => { });
          }
        });

        await executeInDocker(body, (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        });

        res.end();
      } catch (err) {
        if (!res.headersSent) {
          const msg = (err as Error).message;
          const status = msg.includes("capacity limit") ? 429 : 400;
          sendJson(res, status, { ok: false, error: msg });
        } else {
          res.write(`data: ${JSON.stringify({ type: "stderr", text: `\nError: ${(err as Error).message}\n` })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: "exit", exitCode: 1, durationMs: 0, timedOut: false })}\n\n`);
          res.end();
        }
      }
      return;
    }

    return sendJson(res, 404, { ok: false, error: "Not found." });
  });

  // WebSocket Server for interactive terminal connections
  const wss = new WebSocketServer({ server, path: "/terminal" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const token = url.searchParams.get("token");
      const executionId = url.searchParams.get("executionId");

      if (!token || !executionId) {
        ws.send(JSON.stringify({ type: "error", error: "Missing token or executionId." }));
        ws.close(4401, "Unauthorized");
        return;
      }

      // Verify HMAC token
      const claims = verifyTerminalToken(token, RUNNER_SECRET);
      if (!claims) {
        ws.send(JSON.stringify({ type: "error", error: "Invalid or expired terminal token." }));
        ws.close(4401, "Unauthorized");
        return;
      }

      if (claims.executionId !== executionId) {
        ws.send(JSON.stringify({ type: "error", error: "Token execution ID mismatch." }));
        ws.close(4403, "Forbidden");
        return;
      }

      // Attach WebSocket to active execution
      const result = attachTerminalSocket(executionId, ws, {
        projectId: claims.pid,
        userId: claims.uid,
        isProjectOwner: claims.isProjectOwner,
      });

      if (!result.ok) {
        const code = result.error?.startsWith("Forbidden") ? 4403 : 4404;
        ws.send(JSON.stringify({ type: "error", error: result.error }));
        ws.close(code, result.error);
        return;
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", error: (err as Error).message }));
      ws.close(4500, "Internal Server Error");
    }
  });

  return server;
}
