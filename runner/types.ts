export type SupportedLanguage = "Python" | "JavaScript" | "TypeScript" | "C++" | "Go";

export interface ExecutionFileMap {
  [path: string]: string;
}

export interface RunRequest {
  executionId: string;
  projectId?: string;
  userId?: string;
  language: SupportedLanguage;
  files: ExecutionFileMap;
  entrypoint: string;
  timeoutMs?: number;
  interactive?: boolean;
}

export interface StopRequest {
  executionId: string;
  projectId?: string;
  userId?: string;
  isProjectOwner?: boolean;
}

export type ExecutionEvent =
  | { type: "start"; executionId: string; containerName: string }
  | { type: "stdout"; text: string }
  | { type: "stderr"; text: string }
  | { type: "exit"; exitCode: number; durationMs: number; timedOut: boolean; error?: string };

export type TerminalClientMessage =
  | { type: "stdin"; data: string }
  | { type: "signal"; signal: "SIGINT" | "SIGTERM" }
  | { type: "resize"; cols: number; rows: number };

export type TerminalServerMessage =
  | { type: "session"; mode: "owner" | "observer"; executionId: string; entrypoint?: string; language?: string; startedBy?: string }
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "exit"; exitCode: number; durationMs: number; timedOut: boolean; error?: string }
  | { type: "error"; error: string };

export interface ActiveExecutionInfo {
  executionId: string;
  projectId?: string;
  userId?: string;
  entrypoint: string;
  language: SupportedLanguage;
  startedAt: number;
  state: "preparing" | "running";
  observersCount: number;
}

export interface HealthResponse {
  ok: boolean;
  service: "codelab-runner";
  docker: boolean;
  version?: string;
  error?: string;
  concurrency?: {
    active: number;
    max: number;
  };
}
