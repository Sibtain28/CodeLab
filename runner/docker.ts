import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, rm, chmod, lstat, readdir } from "node:fs/promises";
import { join, resolve, normalize, dirname, sep } from "node:path";
import { tmpdir } from "node:os";
import type { WebSocket } from "ws";
import type { RunRequest, ExecutionEvent, SupportedLanguage, StopRequest, ActiveExecutionInfo } from "./types";

const execFileAsync = promisify(execFile);

const IMAGE_MAP: Record<SupportedLanguage, string> = {
  Python: "python:3.12-alpine",
  JavaScript: "node:20-alpine",
  TypeScript: "node:22-alpine",
  "C++": "frolvlad/alpine-gxx:latest",
  Go: "golang:1.24-alpine",
  Rust: "rust:1.85-alpine",
};

export const MAX_CONCURRENT_EXECUTIONS = Number(process.env.MAX_CONCURRENT_EXECUTIONS || 5);
export const DISCONNECT_GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS || 2000);

interface ActiveExecution {
  executionId: string;
  projectId?: string;
  userId?: string;
  entrypoint: string;
  language: SupportedLanguage;
  startedAt: number;
  state: "preparing" | "running" | "stopped";
  child?: ReturnType<typeof spawn>;
  containerName: string;
  tempDir: string;
  interactive?: boolean;
  sockets: Set<WebSocket>;
  ownerSocket?: WebSocket;
  historyBuffer: Array<{ stream: "stdout" | "stderr"; data: string }>;
  disconnectTimer?: NodeJS.Timeout;
}

const activeExecutions = new Map<string, ActiveExecution>();
const preCancelledExecutions = new Set<string>();

export function getActiveExecutionCount(): number {
  return activeExecutions.size;
}

export function getActiveExecution(executionId: string): ActiveExecution | undefined {
  return activeExecutions.get(executionId);
}

export function getProjectActiveExecution(projectId: string): ActiveExecutionInfo | undefined {
  for (const exec of activeExecutions.values()) {
    if (exec.projectId === projectId && exec.state !== "stopped") {
      return {
        executionId: exec.executionId,
        projectId: exec.projectId,
        userId: exec.userId,
        entrypoint: exec.entrypoint,
        language: exec.language,
        startedAt: exec.startedAt,
        state: exec.state,
        observersCount: exec.sockets.size,
      };
    }
  }
  return undefined;
}

/**
 * Checks if the local Docker daemon is responsive.
 */
export async function isDockerAvailable(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const { stdout } = await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      timeout: 3000,
    });
    return { ok: true, version: stdout.trim() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Safely resolves a relative file path inside a root directory, preventing directory traversal
 * and null-byte injection.
 */
export function safeJoin(root: string, relPath: string): string {
  if (!relPath || typeof relPath !== "string") {
    throw new Error("Invalid empty file path.");
  }
  if (relPath.includes("\0")) {
    throw new Error(`File path contains null byte: ${relPath}`);
  }

  // Reject paths containing backslashes on POSIX or absolute path escapes
  if (relPath.startsWith("/") || relPath.startsWith("\\")) {
    throw new Error(`Absolute paths not allowed: ${relPath}`);
  }

  const safeRel = normalize(relPath);
  if (safeRel === ".." || safeRel.startsWith(`..${sep}`) || safeRel.startsWith("../")) {
    throw new Error(`Path traversal detected: ${relPath}`);
  }

  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  const target = resolve(root, safeRel);

  if (!target.startsWith(rootWithSep) && target !== root) {
    throw new Error(`Invalid file path escapes root: ${relPath}`);
  }

  return target;
}

/**
 * Validates that an entrypoint is a valid safe relative file existing in the files map.
 */
export function validateEntrypoint(entrypoint: string, files: Record<string, string>): void {
  if (!entrypoint || typeof entrypoint !== "string") {
    throw new Error("Missing or invalid entrypoint.");
  }
  if (entrypoint.startsWith("-")) {
    throw new Error(`Entrypoint cannot start with option flag: ${entrypoint}`);
  }
  if (entrypoint.includes("\0") || entrypoint.includes("..") || entrypoint.startsWith("/") || entrypoint.startsWith("\\")) {
    throw new Error(`Invalid entrypoint path: ${entrypoint}`);
  }
  if (!Object.prototype.hasOwnProperty.call(files, entrypoint)) {
    throw new Error(`Entrypoint '${entrypoint}' does not exist in workspace files.`);
  }
}

/**
 * Cleans up any stale temporary runner workspace directories from previous sessions.
 */
export async function cleanStaleTempDirs(): Promise<void> {
  const runnerBase = join(tmpdir(), "codelab-runner");
  try {
    const entries = await readdir(runnerBase);
    for (const entry of entries) {
      const fullPath = join(runnerBase, entry);
      await rm(fullPath, { recursive: true, force: true }).catch(() => {});
    }
  } catch {
    // Base directory might not exist yet
  }
}

/**
 * Cleans up and stops all active executions during runner shutdown.
 */
export async function cleanupAllExecutions(): Promise<void> {
  for (const [id, record] of activeExecutions) {
    record.state = "stopped";
    if (record.disconnectTimer) {
      clearTimeout(record.disconnectTimer);
      record.disconnectTimer = undefined;
    }
    try {
      await execFileAsync("docker", ["kill", record.containerName]);
    } catch {
      // Best effort
    }
    record.child?.kill("SIGKILL");
    for (const socket of record.sockets) {
      if (socket.readyState === 1) {
        socket.close(1001, "Server shutting down");
      }
    }
    await rm(record.tempDir, { recursive: true, force: true }).catch(() => {});
    activeExecutions.delete(id);
  }
}

/**
 * Waits for an execution to finish workspace setup and start running.
 */
export async function waitForExecutionStart(executionId: string, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const active = activeExecutions.get(executionId);
    if (active && (active.state === "running" || active.state === "stopped")) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  return false;
}

/**
 * Writes standard input to the container process of an active execution.
 */
export function writeExecutionStdin(executionId: string, data: string): boolean {
  const active = activeExecutions.get(executionId);
  if (!active || !active.child || !active.child.stdin || active.child.stdin.destroyed) {
    return false;
  }
  // Convert carriage returns to newline for stdin readers
  const normalized = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  active.child.stdin.write(normalized, "utf8");
  return true;
}

/**
 * Sends a signal (e.g. SIGINT for Ctrl+C) to the running container process.
 */
export function sendExecutionSignal(executionId: string, signal: NodeJS.Signals): boolean {
  const active = activeExecutions.get(executionId);
  if (!active || !active.child) {
    return false;
  }
  active.child.kill(signal);
  return true;
}

/**
 * Attaches an authorized WebSocket connection to an active execution for real-time terminal I/O.
 */
export function attachTerminalSocket(
  executionId: string,
  ws: WebSocket,
  options?: { projectId?: string; userId?: string; isProjectOwner?: boolean },
): { ok: boolean; error?: string; mode?: "owner" | "observer" } {
  const active = activeExecutions.get(executionId);
  if (!active) {
    return { ok: false, error: "Execution not found or already completed." };
  }
  if (options?.projectId && active.projectId && active.projectId !== options.projectId) {
    return { ok: false, error: "Forbidden: Execution belongs to another project." };
  }

  // Cancel any pending all-clients disconnect cleanup timer
  if (active.disconnectTimer) {
    clearTimeout(active.disconnectTimer);
    active.disconnectTimer = undefined;
  }

  const isOwner = Boolean(options?.userId && active.userId && options.userId === active.userId);
  const mode: "owner" | "observer" = isOwner ? "owner" : "observer";

  active.sockets.add(ws);
  if (isOwner) {
    active.ownerSocket = ws;
  }

  // Send session metadata so the client knows whether they are owner or observer
  if (ws.readyState === 1) {
    ws.send(
      JSON.stringify({
        type: "session",
        mode,
        executionId,
        entrypoint: active.entrypoint,
        language: active.language,
        startedBy: active.userId,
      }),
    );
  }

  // Replay complete output history buffer to this socket so observer sees all prior output
  if (active.historyBuffer && active.historyBuffer.length > 0) {
    for (const item of active.historyBuffer) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: item.stream, data: item.data }));
      }
    }
  }

  // Handle client messages (stdin, signal, resize)
  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString("utf8"));
      if (msg.type === "stdin" && typeof msg.data === "string") {
        if (!isOwner) {
          // Reject stdin from observers
          ws.send(
            JSON.stringify({
              type: "error",
              error: "Terminal input is disabled in observer mode.",
            }),
          );
          return;
        }
        writeExecutionStdin(executionId, msg.data);
      } else if (msg.type === "signal" && msg.signal === "SIGINT") {
        if (!isOwner && !options?.isProjectOwner) {
          ws.send(
            JSON.stringify({
              type: "error",
              error: "Only the session owner or a project owner can interrupt this execution.",
            }),
          );
          return;
        }
        sendExecutionSignal(executionId, "SIGINT");
      }
    } catch {
      // Ignore malformed messages
    }
  });

  // Client disconnect handling
  ws.on("close", () => {
    active.sockets.delete(ws);
    if (active.ownerSocket === ws) {
      active.ownerSocket = undefined;
    }

    // If ALL connected clients disconnect, start grace period before stopping container
    if (active.sockets.size === 0 && active.state === "running") {
      active.disconnectTimer = setTimeout(() => {
        if (active.sockets.size === 0 && active.state === "running") {
          stopExecution({ executionId }).catch(() => {});
        }
      }, DISCONNECT_GRACE_MS);
    }
  });

  return { ok: true, mode };
}

/**
 * Executes user code inside a securely hardened, isolated Docker container.
 */
export async function executeInDocker(
  request: RunRequest,
  onEvent: (event: ExecutionEvent) => void,
): Promise<void> {
  const {
    executionId,
    projectId,
    userId,
    language,
    files,
    entrypoint,
    timeoutMs = 15000,
    interactive = false,
  } = request;

  // Check if cancelled before execution started
  if (preCancelledExecutions.has(executionId)) {
    preCancelledExecutions.delete(executionId);
    throw new Error("Execution was cancelled before startup.");
  }

  const image = IMAGE_MAP[language];
  if (!image) {
    throw new Error(`Unsupported execution language: ${language}`);
  }

  // Enforce concurrency limit
  if (activeExecutions.size >= MAX_CONCURRENT_EXECUTIONS) {
    throw new Error(
      `Execution capacity limit reached (${MAX_CONCURRENT_EXECUTIONS} max concurrent). Please retry shortly.`,
    );
  }

  // Validate entrypoint
  validateEntrypoint(entrypoint, files);

  // Validate total workspace size (max 100 files, max 5MB total)
  const fileKeys = Object.keys(files);
  if (fileKeys.length > 100) {
    throw new Error("Too many files in workspace (maximum 100 files allowed).");
  }
  let totalBytes = 0;
  for (const [, content] of Object.entries(files)) {
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > 5_000_000) {
      throw new Error("Workspace files exceed maximum allowed size (5MB).");
    }
  }

  // Sanitize execution ID for container naming
  const safeId = executionId.replace(/[^a-zA-Z0-9_-]/g, "");
  const containerName = `codelab-exec-${safeId}`;

  // Create isolated temp workspace directory
  const tempDir = join(tmpdir(), "codelab-runner", safeId);
  await mkdir(tempDir, { recursive: true, mode: 0o777 });
  await chmod(tempDir, 0o777).catch(() => {});

  // Register execution in activeExecutions immediately in 'preparing' state
  const executionRecord: ActiveExecution = {
    executionId,
    projectId,
    userId,
    entrypoint,
    language,
    startedAt: Date.now(),
    state: "preparing",
    containerName,
    tempDir,
    interactive,
    sockets: new Set(),
    historyBuffer: [],
  };
  activeExecutions.set(executionId, executionRecord);

  try {
    // Write workspace files
    for (const [relPath, content] of Object.entries(files)) {
      if (!relPath.trim()) continue;
      const fullPath = safeJoin(tempDir, relPath);

      // Verify no symlink exists along the path
      try {
        const stats = await lstat(fullPath);
        if (stats.isSymbolicLink()) {
          throw new Error(`Symlink destination not allowed: ${relPath}`);
        }
      } catch {
        // Target does not exist yet, which is expected
      }

      await mkdir(dirname(fullPath), { recursive: true, mode: 0o777 });
      await chmod(dirname(fullPath), 0o777).catch(() => {});
      await writeFile(fullPath, content, { encoding: "utf8", mode: 0o666 });
    }

    // Check if stopped while preparing
    if (executionRecord.state === "stopped") {
      throw new Error("Execution was stopped before container startup.");
    }

    // Safe command args with explicit relative path to prevent flag injection
    let commandArgs: string[];
    if (language === "Python") {
      commandArgs = ["python3", "-u", `./${entrypoint}`];
    } else if (language === "TypeScript") {
      commandArgs = ["node", "--no-warnings", "--experimental-transform-types", `./${entrypoint}`];
    } else if (language === "C++") {
      // Find helper .cpp/.cc/.cxx files in workspace that do not define a separate main()
      const helperCppFiles = Object.keys(files).filter(
        (p) =>
          p !== entrypoint &&
          (p.endsWith(".cpp") || p.endsWith(".cc") || p.endsWith(".cxx")) &&
          !/\bmain\s*\(/.test(files[p] || ""),
      );
      const compileFiles = [`./${entrypoint}`, ...helperCppFiles.map((p) => `./${p}`)];
      const shellCmd = `g++ -O2 -std=c++20 ${compileFiles.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(" ")} -o ./app && exec ./app`;
      commandArgs = ["sh", "-c", shellCmd];
    } else if (language === "Go") {
      // Find helper .go files in workspace that do not define a separate func main()
      const helperGoFiles = Object.keys(files).filter(
        (p) =>
          p !== entrypoint &&
          p.endsWith(".go") &&
          !p.endsWith("_test.go") &&
          !/\bfunc\s+main\s*\(/.test(files[p] || ""),
      );
      const compileFiles = [`./${entrypoint}`, ...helperGoFiles.map((p) => `./${p}`)];
      const shellCmd = `GOCACHE=/workspace/.gocache GOPATH=/workspace/.gopath GOTMPDIR=/tmp go build -o ./app ${compileFiles.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(" ")} && exec ./app`;
      commandArgs = ["sh", "-c", shellCmd];
    } else if (language === "Rust") {
      const shellCmd = `rustc -O ./${entrypoint} -o ./app && exec ./app`;
      commandArgs = ["sh", "-c", shellCmd];
    } else {
      commandArgs = ["node", "--", `./${entrypoint}`];
    }

    const dockerArgs = [
      "run",
      "--name",
      containerName,
      "--rm",
      "-i",
      // Network isolation
      "--network",
      "none",
      // Non-root execution (UID 1000 / GID 1000)
      "--user",
      "1000:1000",
      // Dropped Linux capabilities
      "--cap-drop",
      "ALL",
      // Prevent privilege escalation
      "--security-opt",
      "no-new-privileges:true",
      // Resource constraints
      "--memory",
      "256m",
      "--memory-swap",
      "256m",
      "--cpus",
      "1.0",
      "--pids-limit",
      "64",
      // File size write limit per file (20MB)
      "--ulimit",
      "fsize=20971520:20971520",
      // Filesystem isolation
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "-v",
      `${tempDir}:/workspace:rw`,
      "-w",
      "/workspace",
      image,
      ...commandArgs,
    ];

    const startTime = Date.now();
    const child = spawn("docker", dockerArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    executionRecord.child = child;
    executionRecord.state = "running";

    onEvent({ type: "start", executionId, containerName });

    let timedOut = false;
    const timer = setTimeout(async () => {
      timedOut = true;
      executionRecord.state = "stopped";
      try {
        await execFileAsync("docker", ["kill", containerName]);
      } catch {
        // Container might have already exited
      }
      child.kill("SIGKILL");
    }, Math.min(timeoutMs, 30000));

    // Stream stdout to SSE and all connected WebSocket clients
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      onEvent({ type: "stdout", text });

      if (executionRecord.historyBuffer.length < 2000) {
        executionRecord.historyBuffer.push({ stream: "stdout", data: text });
      }

      for (const socket of executionRecord.sockets) {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: "stdout", data: text }));
        }
      }
    });

    // Stream stderr to SSE and all connected WebSocket clients
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      onEvent({ type: "stderr", text });

      if (executionRecord.historyBuffer.length < 2000) {
        executionRecord.historyBuffer.push({ stream: "stderr", data: text });
      }

      for (const socket of executionRecord.sockets) {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: "stderr", data: text }));
        }
      }
    });

    await new Promise<void>((resolvePromise) => {
      child.on("close", (code) => {
        clearTimeout(timer);
        activeExecutions.delete(executionId);
        const durationMs = Date.now() - startTime;
        const exitCode = timedOut ? 124 : (code ?? 0);

        onEvent({
          type: "exit",
          exitCode,
          durationMs,
          timedOut,
          error: timedOut ? "Execution timed out (15s limit reached)." : undefined,
        });

        const exitMsg = JSON.stringify({
          type: "exit",
          exitCode,
          durationMs,
          timedOut,
          error: timedOut ? "Execution timed out (15s limit reached)." : undefined,
        });

        for (const socket of executionRecord.sockets) {
          if (socket.readyState === 1) {
            socket.send(exitMsg);
            socket.close(1000, "Execution finished");
          }
        }
        executionRecord.sockets.clear();

        resolvePromise();
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        activeExecutions.delete(executionId);
        onEvent({
          type: "stderr",
          text: `Container execution error: ${err.message}\n`,
        });
        onEvent({
          type: "exit",
          exitCode: 1,
          durationMs: Date.now() - startTime,
          timedOut: false,
          error: err.message,
        });

        const errExitMsg = JSON.stringify({
          type: "exit",
          exitCode: 1,
          durationMs: Date.now() - startTime,
          timedOut: false,
          error: err.message,
        });

        for (const socket of executionRecord.sockets) {
          if (socket.readyState === 1) {
            socket.send(
              JSON.stringify({
                type: "stderr",
                data: `Container execution error: ${err.message}\n`,
              }),
            );
            socket.send(errExitMsg);
            socket.close(1000, "Execution finished with error");
          }
        }
        executionRecord.sockets.clear();

        resolvePromise();
      });
    });
  } finally {
    // Ensure slot, sockets, timers, and temp files are cleaned up on every exit path
    activeExecutions.delete(executionId);
    if (executionRecord.disconnectTimer) {
      clearTimeout(executionRecord.disconnectTimer);
    }
    for (const socket of executionRecord.sockets) {
      if (socket.readyState === 1) {
        socket.close(1000, "Execution cleaned up");
      }
    }
    executionRecord.sockets.clear();

    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

/**
 * Force-stops an active execution container with ownership validation.
 */
export async function stopExecution(request: StopRequest): Promise<{ ok: boolean; error?: string }> {
  const { executionId, projectId, userId, isProjectOwner } = request;
  const active = activeExecutions.get(executionId);

  if (!active) {
    // If not yet active, mark as pre-cancelled so it aborts if it is currently queueing/preparing
    preCancelledExecutions.add(executionId);
    setTimeout(() => preCancelledExecutions.delete(executionId), 15000);
    return { ok: true };
  }

  // Cross-project protection: verify project ownership if projectId is specified
  if (projectId && active.projectId && active.projectId !== projectId) {
    return { ok: false, error: "Forbidden: Execution belongs to another project." };
  }

  // Ownership check: must be either the user who started the execution OR a project owner
  const isInitiator = !active.userId || !userId || active.userId === userId;
  if (!isInitiator && !isProjectOwner) {
    return {
      ok: false,
      error: "Forbidden: Only the session owner or a project owner can stop this execution.",
    };
  }

  active.state = "stopped";
  if (active.disconnectTimer) {
    clearTimeout(active.disconnectTimer);
  }

  // If container is already spawned, kill it
  if (active.child) {
    try {
      await execFileAsync("docker", ["kill", active.containerName]);
    } catch {
      // Process may already be exiting
    }
    active.child.kill("SIGKILL");
  }

  const stopExitMsg = JSON.stringify({
    type: "exit",
    exitCode: 130,
    durationMs: 0,
    timedOut: false,
    error: "Process stopped by user.",
  });

  for (const socket of active.sockets) {
    if (socket.readyState === 1) {
      socket.send(stopExitMsg);
      socket.close(1000, "Stopped by user");
    }
  }
  active.sockets.clear();

  activeExecutions.delete(executionId);
  try {
    await rm(active.tempDir, { recursive: true, force: true });
  } catch {
    // Best-effort
  }

  return { ok: true };
}
