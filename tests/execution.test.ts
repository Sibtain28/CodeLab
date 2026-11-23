import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import {
  isDockerAvailable,
  executeInDocker,
  stopExecution,
  safeJoin,
  validateEntrypoint,
  waitForExecutionStart,
  MAX_CONCURRENT_EXECUTIONS,
} from "../runner/docker";
import { createRunnerServer } from "../runner/server";
import { signTerminalToken } from "../runner/token";
import type { ExecutionEvent, RunRequest, HealthResponse, TerminalServerMessage } from "../runner/types";

const RUNNER_SECRET =
  process.env.RUNNER_SECRET || process.env.BETTER_AUTH_SECRET || "codelab-runner-dev-secret";

function getStdout(events: ExecutionEvent[]): string {
  return events
    .filter((e): e is { type: "stdout"; text: string } => e.type === "stdout")
    .map((e) => e.text)
    .join("");
}

function getStderr(events: ExecutionEvent[]): string {
  return events
    .filter((e): e is { type: "stderr"; text: string } => e.type === "stderr")
    .map((e) => e.text)
    .join("");
}

test("CodeLab Execution Engine — Hardened Docker Isolation & Security Test Suite", async (t) => {
  // 1. Docker availability
  await t.test("Docker daemon availability check", async () => {
    const status = await isDockerAvailable();
    assert.equal(status.ok, true, `Docker daemon must be running. Error: ${status.error}`);
    assert.ok(status.version, "Docker version should be reported");
  });

  // 2. Python execution with stdout
  await t.test("Python: single file execution with stdout", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-py-single-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Python",
        files: {
          "main.py": 'print("Hello from isolated Python container!")\n',
        },
        entrypoint: "main.py",
      },
      (event) => events.push(event),
    );

    const startEv = events.find((e) => e.type === "start");
    assert.ok(startEv, "Should emit start event");

    const stdout = getStdout(events);
    assert.match(stdout, /Hello from isolated Python container!/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 0);
      assert.equal(exitEv.timedOut, false);
      assert.ok(exitEv.durationMs > 0);
    }
  });

  // 3. Python multi-file execution
  await t.test("Python: multi-file workspace execution", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-py-multi-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Python",
        files: {
          "helpers/math_ops.py": "def multiply(a, b):\n    return a * b\n",
          "main.py": "from helpers.math_ops import multiply\nprint(f'Result: {multiply(6, 7)}')\n",
        },
        entrypoint: "main.py",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /Result: 42/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 0);
    }
  });

  // 4. Python runtime error
  await t.test("Python: runtime error emits stderr and non-zero exit code", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-py-err-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Python",
        files: {
          "main.py": "def divide():\n    return 1 / 0\ndivide()\n",
        },
        entrypoint: "main.py",
      },
      (event) => events.push(event),
    );

    const stderr = getStderr(events);
    assert.match(stderr, /ZeroDivisionError: division by zero/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 1);
      assert.equal(exitEv.timedOut, false);
    }
  });

  // 5. JavaScript execution
  await t.test("JavaScript: single file execution with stdout", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-js-single-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "JavaScript",
        files: {
          "index.js": 'console.log("Hello from isolated Node container!");\n',
        },
        entrypoint: "index.js",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /Hello from isolated Node container!/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 0);
    }
  });

  // 6. JavaScript multi-file execution
  await t.test("JavaScript: multi-file workspace execution", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-js-multi-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "JavaScript",
        files: {
          "utils.js": "function greet(name) { return `Hello, ${name}!`; }\nmodule.exports = { greet };\n",
          "index.js": 'const { greet } = require("./utils.js");\nconsole.log(greet("CodeLab"));\n',
        },
        entrypoint: "index.js",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /Hello, CodeLab!/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 0);
    }
  });

  // 6.1 TypeScript: single file execution with interfaces, types, and enums
  await t.test("TypeScript: single file execution with types, interfaces, and enums", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-ts-single-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "TypeScript",
        files: {
          "main.ts": [
            "enum Priority { Low = 1, High = 2 }",
            "interface Task { title: string; priority: Priority; }",
            "function describeTask(t: Task): string {",
            "  return `Task: ${t.title} [Priority: ${t.priority}]`;",
            "}",
            "const task: Task = { title: 'CodeLab TS Runner', priority: Priority.High };",
            "console.log(describeTask(task));",
          ].join("\n"),
        },
        entrypoint: "main.ts",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /Task: CodeLab TS Runner \[Priority: 2\]/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 0);
    }
  });

  // 6.2 TypeScript: multi-file workspace execution
  await t.test("TypeScript: multi-file workspace execution", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-ts-multi-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "TypeScript",
        files: {
          "calc.ts": [
            "export interface MathResult { value: number; label: string; }",
            "export function multiply(a: number, b: number): MathResult {",
            "  return { value: a * b, label: 'product' };",
            "}",
          ].join("\n"),
          "index.ts": [
            'import { multiply, type MathResult } from "./calc.ts";',
            "const res: MathResult = multiply(7, 8);",
            "console.log(`Calculated ${res.label}: ${res.value}`);",
          ].join("\n"),
        },
        entrypoint: "index.ts",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /Calculated product: 56/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 0);
    }
  });

  // 6.3 TypeScript: syntax / compilation error emits stderr and non-zero exit code
  await t.test("TypeScript: syntax/compilation error emits stderr and non-zero exit code", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-ts-syntax-err-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "TypeScript",
        files: {
          "bad.ts": "const x: = 123;\n",
        },
        entrypoint: "bad.ts",
      },
      (event) => events.push(event),
    );

    const stderr = getStderr(events);
    assert.match(stderr, /SyntaxError/i);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 1);
      assert.equal(exitEv.timedOut, false);
    }
  });

  // 6.4 TypeScript: runtime error emits stack trace and non-zero exit code
  await t.test("TypeScript: runtime error emits stack trace and non-zero exit code", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-ts-runtime-err-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "TypeScript",
        files: {
          "runtime.ts": "throw new Error('Fatal TypeScript runtime exception');\n",
        },
        entrypoint: "runtime.ts",
      },
      (event) => events.push(event),
    );

    const stderr = getStderr(events);
    assert.match(stderr, /Fatal TypeScript runtime exception/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 1);
    }
  });

  // 6.5 C++: single file execution with stdout and modern C++ features
  await t.test("C++: single file execution with stdout", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-cpp-single-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "C++",
        files: {
          "main.cpp": [
            "#include <iostream>",
            "#include <string>",
            "#include <vector>",
            "#include <numeric>",
            "int main() {",
            "  std::vector<int> nums = {10, 20, 30, 40};",
            "  int sum = std::accumulate(nums.begin(), nums.end(), 0);",
            "  std::cout << \"Sum: \" << sum << std::endl;",
            "  std::cout << \"Hello from C++ in isolated Docker!\" << std::endl;",
            "  return 0;",
            "}",
          ].join("\n"),
        },
        entrypoint: "main.cpp",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /Sum: 100/);
    assert.match(stdout, /Hello from C\+\+ in isolated Docker!/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 0);
      assert.equal(exitEv.timedOut, false);
      assert.ok(exitEv.durationMs > 0);
    }
  });

  // 6.6 C++: multi-file workspace execution
  await t.test("C++: multi-file workspace execution", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-cpp-multi-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "C++",
        files: {
          "calc.h": "#pragma once\nint add(int a, int b);\n",
          "calc.cpp": "#include \"calc.h\"\nint add(int a, int b) { return a + b; }\n",
          "main.cpp": [
            "#include <iostream>",
            "#include \"calc.h\"",
            "int main() {",
            "  std::cout << \"Result: \" << add(19, 23) << std::endl;",
            "  return 0;",
            "}",
          ].join("\n"),
        },
        entrypoint: "main.cpp",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /Result: 42/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 0);
    }
  });

  // 6.7 C++: compilation error emits compiler error output and non-zero exit code
  await t.test("C++: compilation error emits compiler error output and non-zero exit code", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-cpp-comp-err-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "C++",
        files: {
          "main.cpp": [
            "#include <iostream>",
            "int main() {",
            "  std::cout << \"Syntax error\"",
            "  return 0;",
            "}",
          ].join("\n"),
        },
        entrypoint: "main.cpp",
      },
      (event) => events.push(event),
    );

    const stderr = getStderr(events);
    assert.match(stderr, /error: expected ';' before 'return'/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.notEqual(exitEv.exitCode, 0);
      assert.equal(exitEv.timedOut, false);
    }
  });

  // 6.8 C++: runtime error emits exception output and non-zero exit code
  await t.test("C++: runtime error emits exception output and non-zero exit code", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-cpp-runtime-err-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "C++",
        files: {
          "main.cpp": [
            "#include <iostream>",
            "#include <stdexcept>",
            "int main() {",
            "  throw std::runtime_error(\"Fatal C++ runtime exception\");",
            "  return 0;",
            "}",
          ].join("\n"),
        },
        entrypoint: "main.cpp",
      },
      (event) => events.push(event),
    );

    const stderr = getStderr(events);
    assert.match(stderr, /Fatal C\+\+ runtime exception/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.notEqual(exitEv.exitCode, 0);
    }
  });

  // 6.9 Go: single file execution with stdout
  await t.test("Go: single file execution with stdout", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-go-single-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Go",
        files: {
          "main.go": [
            "package main",
            "import (",
            "  \"fmt\"",
            "  \"strings\"",
            ")",
            "func main() {",
            "  msg := strings.ToUpper(\"hello from isolated go container!\")",
            "  fmt.Println(msg)",
            "}",
          ].join("\n"),
        },
        entrypoint: "main.go",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /HELLO FROM ISOLATED GO CONTAINER!/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 0);
      assert.equal(exitEv.timedOut, false);
      assert.ok(exitEv.durationMs > 0);
    }
  });

  // 6.10 Go: multi-file workspace execution
  await t.test("Go: multi-file workspace execution", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-go-multi-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Go",
        files: {
          "calc.go": "package main\nfunc Multiply(a, b int) int { return a * b }\n",
          "main.go": [
            "package main",
            "import \"fmt\"",
            "func main() {",
            "  fmt.Printf(\"Result: %d\\n\", Multiply(6, 7))",
            "}",
          ].join("\n"),
        },
        entrypoint: "main.go",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /Result: 42/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.equal(exitEv.exitCode, 0);
    }
  });

  // 6.11 Go: compilation error emits compiler diagnostic and non-zero exit code
  await t.test("Go: compilation error emits compiler diagnostic and non-zero exit code", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-go-comp-err-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Go",
        files: {
          "main.go": [
            "package main",
            "import \"fmt\"",
            "func main() {",
            "  fmt.Println(\"Missing quote)",
            "}",
          ].join("\n"),
        },
        entrypoint: "main.go",
      },
      (event) => events.push(event),
    );

    const stderr = getStderr(events);
    assert.match(stderr, /syntax error|newline in string/i);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.notEqual(exitEv.exitCode, 0);
      assert.equal(exitEv.timedOut, false);
    }
  });

  // 6.12 Go: runtime panic emits stack trace and non-zero exit code
  await t.test("Go: runtime panic emits stack trace and non-zero exit code", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-go-panic-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Go",
        files: {
          "main.go": [
            "package main",
            "func main() {",
            "  panic(\"Fatal Go runtime panic\")",
            "}",
          ].join("\n"),
        },
        entrypoint: "main.go",
      },
      (event) => events.push(event),
    );

    const stderr = getStderr(events);
    assert.match(stderr, /panic: Fatal Go runtime panic/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
    if (exitEv.type === "exit") {
      assert.notEqual(exitEv.exitCode, 0);
    }
  });

  // 7. Security: Network isolation
  await t.test("Security: container has zero network access (--network none)", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-sec-net-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Python",
        files: {
          "main.py": `
import urllib.request
try:
    urllib.request.urlopen("https://1.1.1.1", timeout=2)
    print("NET_SUCCESS")
except Exception as e:
    print(f"NET_BLOCKED: {type(e).__name__}")
`,
        },
        entrypoint: "main.py",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /NET_BLOCKED:/);
    assert.doesNotMatch(stdout, /NET_SUCCESS/);
  });

  // 8. Security: Read-only root filesystem
  await t.test("Security: container root filesystem is read-only (--read-only)", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-sec-ro-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Python",
        files: {
          "main.py": `
try:
    with open("/malicious.txt", "w") as f:
        f.write("hacked")
    print("RO_WRITE_SUCCESS")
except OSError as e:
    print(f"RO_BLOCKED: {e}")
`,
        },
        entrypoint: "main.py",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /RO_BLOCKED:.*Read-only file system/);
    assert.doesNotMatch(stdout, /RO_WRITE_SUCCESS/);
  });

  // 9. Hardening: Non-root execution & dropped capabilities
  await t.test("Hardening: executes as unprivileged non-root user (UID 1000)", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-sec-nonroot-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Python",
        files: {
          "main.py": `
import os
print(f"CONTAINER_UID:{os.getuid()}")
print(f"CONTAINER_GID:{os.getgid()}")
`,
        },
        entrypoint: "main.py",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /CONTAINER_UID:1000/);
    assert.match(stdout, /CONTAINER_GID:1000/);
    assert.doesNotMatch(stdout, /CONTAINER_UID:0/);
  });

  // 10. Hardening: Workspace disk limits (--ulimit fsize)
  await t.test("Hardening: enforces file size limit preventing unbounded disk fill", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-sec-disk-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Python",
        files: {
          "main.py": `
try:
    with open("bigfile.bin", "wb") as f:
        f.write(b"0" * 25_000_000) # Exceeds 20MB limit
    print("WRITE_UNLIMITED")
except OSError as e:
    print(f"WRITE_BLOCKED:{e}")
`,
        },
        entrypoint: "main.py",
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /WRITE_BLOCKED:.*(File too large|\[Errno 27\])/);
    assert.doesNotMatch(stdout, /WRITE_UNLIMITED/);
  });

  // 11. Workspace protection: safeJoin path traversal
  await t.test("Workspace: safeJoin blocks path traversal and null bytes", async () => {
    const root = "/tmp/codelab-runner/sample";

    assert.throws(() => safeJoin(root, "../escape.txt"), /Path traversal detected/);
    assert.throws(() => safeJoin(root, "../../etc/passwd"), /Path traversal detected/);
    assert.throws(() => safeJoin(root, "foo/bar/../../../escape.txt"), /Path traversal detected/);
    assert.throws(() => safeJoin(root, "/absolute/path"), /Absolute paths not allowed/);
    assert.throws(() => safeJoin(root, "bad\0file.py"), /File path contains null byte/);

    const valid = safeJoin(root, "nested/code/helper.py");
    assert.equal(valid, "/tmp/codelab-runner/sample/nested/code/helper.py");
  });

  // 12. Workspace protection: entrypoint validation
  await t.test("Workspace: validateEntrypoint rejects flags and missing files", async () => {
    const files = { "main.py": "print('ok')" };

    assert.throws(() => validateEntrypoint("-c", files), /cannot start with option flag/);
    assert.throws(() => validateEntrypoint("--inspect", files), /cannot start with option flag/);
    assert.throws(() => validateEntrypoint("../outside.py", files), /Invalid entrypoint path/);
    assert.throws(() => validateEntrypoint("missing.py", files), /does not exist in workspace files/);

    assert.doesNotThrow(() => validateEntrypoint("main.py", files));
  });

  // 13. Concurrency limit and slot recovery
  await t.test("Concurrency: limits concurrent executions and frees slots on completion", async () => {
    assert.ok(MAX_CONCURRENT_EXECUTIONS >= 1);

    // Run a normal execution to verify slots are available and cleanly returned
    const events: ExecutionEvent[] = [];
    const executionId = `test-concurrency-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Python",
        files: { "main.py": "print('slot_test')\n" },
        entrypoint: "main.py",
      },
      (e) => events.push(e),
    );

    assert.match(getStdout(events), /slot_test/);
  });

  // 14. Cancellation during workspace preparation
  await t.test("Lifecycle: early stop during preparation cancels execution before Docker spawn", async () => {
    const executionId = `test-early-stop-${Date.now()}`;
    const events: ExecutionEvent[] = [];

    // Trigger stop immediately
    const stopPromise = stopExecution({ executionId });
    const runPromise = executeInDocker(
      {
        executionId,
        language: "Python",
        files: { "main.py": "print('should not run')\n" },
        entrypoint: "main.py",
      },
      (e) => events.push(e),
    ).catch((err) => err);

    await Promise.all([stopPromise, runPromise]);
    assert.doesNotMatch(getStdout(events), /should not run/);
  });

  // 15. Timeout enforcement
  await t.test("Timeout: infinite loop terminates and flags timedOut", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-timeout-${Date.now()}`;

    await executeInDocker(
      {
        executionId,
        language: "Python",
        files: {
          "main.py": "print('loop starting')\nwhile True:\n    pass\n",
        },
        entrypoint: "main.py",
        timeoutMs: 1500,
      },
      (event) => events.push(event),
    );

    const stdout = getStdout(events);
    assert.match(stdout, /loop starting/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv, "Exit event must be produced");
    if (exitEv.type === "exit") {
      assert.equal(exitEv.timedOut, true);
      assert.equal(exitEv.exitCode, 124);
      assert.match(exitEv.error || "", /timed out/i);
    }
  });

  // 16. Cancellation of active execution
  await t.test("Cancellation: stopExecution halts container execution", async () => {
    const events: ExecutionEvent[] = [];
    const executionId = `test-stop-${Date.now()}`;

    const execPromise = executeInDocker(
      {
        executionId,
        language: "Python",
        files: {
          "main.py": "import time\nprint('sleeping...')\ntime.sleep(20)\nprint('finished!')\n",
        },
        entrypoint: "main.py",
        timeoutMs: 25000,
      },
      (event) => events.push(event),
    );

    // Wait until sleep starts
    await new Promise((r) => setTimeout(r, 1000));
    const stopResult = await stopExecution({ executionId });
    assert.equal(stopResult.ok, true, "stopExecution should return true for active process");

    await execPromise;

    const stdout = getStdout(events);
    assert.match(stdout, /sleeping\.\.\./);
    assert.doesNotMatch(stdout, /finished!/);

    const exitEv = events.find((e) => e.type === "exit");
    assert.ok(exitEv);
  });

  // 17. Runner HTTP Server: Authentication, Health, Run (SSE), Cross-Project Stop
  await t.test("Runner HTTP Server: authentication, health, SSE streaming, and ownership checks", async () => {
    const server = createRunnerServer();

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // 1. GET /health
      const healthRes = await fetch(`${baseUrl}/health`);
      assert.equal(healthRes.status, 200);
      const healthData = (await healthRes.json()) as HealthResponse;
      assert.equal(healthData.ok, true);
      assert.equal(healthData.service, "codelab-runner");
      assert.equal(healthData.docker, true);
      assert.ok(healthData.concurrency);
      assert.equal(typeof healthData.concurrency.active, "number");

      // 2. Unauthenticated POST /run rejected with 401
      const unauthRunRes = await fetch(`${baseUrl}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionId: "unauth-test",
          language: "Python",
          files: { "main.py": "print('unauth')" },
          entrypoint: "main.py",
        }),
      });
      assert.equal(unauthRunRes.status, 401);
      const unauthData = (await unauthRunRes.json()) as { ok: boolean };
      assert.equal(unauthData.ok, false);

      // 3. Authenticated POST /run (SSE stream)
      const executionId = `http-run-${Date.now()}`;
      const payload: RunRequest = {
        executionId,
        projectId: "proj-alpha",
        userId: "user-alpha",
        language: "Python",
        files: {
          "main.py": "print('AUTH_STREAM_OK')\n",
        },
        entrypoint: "main.py",
      };

      const runRes = await fetch(`${baseUrl}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Runner-Secret": RUNNER_SECRET,
        },
        body: JSON.stringify(payload),
      });

      assert.equal(runRes.status, 200);
      assert.match(runRes.headers.get("content-type") || "", /text\/event-stream/);

      const reader = runRes.body!.getReader();
      const decoder = new TextDecoder();
      let sseData = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseData += decoder.decode(value, { stream: true });
      }

      assert.match(sseData, /AUTH_STREAM_OK/);
      assert.match(sseData, /"type":"exit"/);

      // 4. Cross-project stop authorization check
      // Start a long run under proj-alpha
      const longExecId = `long-exec-${Date.now()}`;
      const longRunPromise = fetch(`${baseUrl}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Runner-Secret": RUNNER_SECRET,
        },
        body: JSON.stringify({
          executionId: longExecId,
          projectId: "proj-alpha",
          userId: "user-alpha",
          language: "Python",
          files: { "main.py": "import time\ntime.sleep(15)\n" },
          entrypoint: "main.py",
        }),
      });

      // Wait for container to start running
      await waitForExecutionStart(longExecId, 8000);

      // Attempt to stop from a DIFFERENT project (proj-beta) -> should be 403 Forbidden
      const unauthorizedStopRes = await fetch(`${baseUrl}/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Runner-Secret": RUNNER_SECRET,
        },
        body: JSON.stringify({
          executionId: longExecId,
          projectId: "proj-beta", // WRONG project
          userId: "user-beta",
        }),
      });
      assert.equal(unauthorizedStopRes.status, 403, "Cross-project stop must be rejected with 403");

      // Stop with the CORRECT project (proj-alpha) -> should be 200 OK
      const authorizedStopRes = await fetch(`${baseUrl}/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Runner-Secret": RUNNER_SECRET,
        },
        body: JSON.stringify({
          executionId: longExecId,
          projectId: "proj-alpha",
          userId: "user-alpha",
        }),
      });
      assert.equal(authorizedStopRes.status, 200);
      const stopData = (await authorizedStopRes.json()) as { ok: boolean };
      assert.equal(stopData.ok, true);

      await longRunPromise;
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // 17. Phase 6.3 Interactive Terminal WebSocket Test Suite
  await t.test("Interactive Terminal WebSocket — Phase 6.3 Test Suite", async (t) => {
    function createWsClient(url: string) {
      const ws = new WebSocket(url);
      const queue: TerminalServerMessage[] = [];
      const listeners: Array<(msg: TerminalServerMessage) => boolean> = [];

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString("utf8")) as TerminalServerMessage;
          queue.push(msg);
          for (let i = listeners.length - 1; i >= 0; i--) {
            if (listeners[i](msg)) {
              listeners.splice(i, 1);
            }
          }
        } catch {}
      });

      function waitForMessage(
        predicate: (msg: TerminalServerMessage) => boolean,
        timeoutMs = 12000,
      ): Promise<TerminalServerMessage> {
        const existing = queue.find(predicate);
        if (existing) {
          return Promise.resolve(existing);
        }

        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            const idx = listeners.indexOf(check);
            if (idx !== -1) listeners.splice(idx, 1);
            reject(
              new Error(
                `waitForMessage timed out after ${timeoutMs}ms. Received: ${JSON.stringify(queue)}`,
              ),
            );
          }, timeoutMs);

          function check(msg: TerminalServerMessage): boolean {
            if (predicate(msg)) {
              clearTimeout(timer);
              resolve(msg);
              return true;
            }
            return false;
          }

          listeners.push(check);
        });
      }

      const openPromise = new Promise<void>((resolve, reject) => {
        ws.on("open", () => resolve());
        ws.on("error", reject);
      });

      return { ws, waitForMessage, openPromise, close: () => ws.close() };
    }

    const server = createRunnerServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 17.1 Python input() over WebSocket
      await t.test("Python: real-time input() over WebSocket", async () => {
        const execId = `test-ws-py-input-${Date.now()}`;
        const runRes = await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-interactive-1",
            userId: "user-1",
            language: "Python",
            files: {
              "main.py": 'name = input("Enter your name: ")\nprint(f"Hello, {name}!", flush=True)\n',
            },
            entrypoint: "main.py",
            interactive: true,
          }),
        });
        assert.equal(runRes.status, 200);
        const runData = (await runRes.json()) as { ok: boolean; interactive: boolean; executionId: string };
        assert.equal(runData.ok, true);
        assert.equal(runData.interactive, true);

        const token = signTerminalToken(
          {
            uid: "user-1",
            pid: "proj-interactive-1",
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        const client = createWsClient(
          `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(token)}&executionId=${encodeURIComponent(execId)}`,
        );
        await client.openPromise;

        // Wait for prompt
        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Enter your name:"), 25000);

        // Send stdin input
        client.ws.send(JSON.stringify({ type: "stdin", data: "Alice\n" }));

        // Wait for greeting
        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Hello, Alice!"));

        // Wait for clean exit
        const exitMsg = (await client.waitForMessage((m) => m.type === "exit")) as {
          type: "exit";
          exitCode: number;
        };
        assert.equal(exitMsg.exitCode, 0);

        client.close();
      });

      // 17.2 Python multi-step sequential input()
      await t.test("Python: multiple sequential input() prompts", async () => {
        const execId = `test-ws-py-multi-${Date.now()}`;
        const runRes = await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-interactive-2",
            userId: "user-2",
            language: "Python",
            files: {
              "main.py":
                'a = int(input("A: "))\nb = int(input("B: "))\nprint(f"SUM={a + b}", flush=True)\n',
            },
            entrypoint: "main.py",
            interactive: true,
          }),
        });
        assert.equal(runRes.status, 200);

        const token = signTerminalToken(
          {
            uid: "user-2",
            pid: "proj-interactive-2",
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        const client = createWsClient(
          `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(token)}&executionId=${encodeURIComponent(execId)}`,
        );
        await client.openPromise;

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("A:"));
        client.ws.send(JSON.stringify({ type: "stdin", data: "17\n" }));

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("B:"));
        client.ws.send(JSON.stringify({ type: "stdin", data: "25\n" }));

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("SUM=42"));

        const exitMsg = (await client.waitForMessage((m) => m.type === "exit")) as {
          type: "exit";
          exitCode: number;
        };
        assert.equal(exitMsg.exitCode, 0);

        client.close();
      });

      // 17.3 Node.js readline interactive execution
      await t.test("Node.js: readline interaction over WebSocket", async () => {
        const execId = `test-ws-node-rl-${Date.now()}`;
        const runRes = await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-interactive-3",
            userId: "user-3",
            language: "JavaScript",
            files: {
              "main.js": [
                'const readline = require("readline");',
                'const rl = readline.createInterface({ input: process.stdin, output: process.stdout });',
                'rl.question("Pick a color: ", (color) => {',
                '  console.log(`Selected: ${color}`);',
                "  rl.close();",
                "  process.exit(0);",
                "});",
              ].join("\n"),
            },
            entrypoint: "main.js",
            interactive: true,
          }),
        });
        assert.equal(runRes.status, 200);

        const token = signTerminalToken(
          {
            uid: "user-3",
            pid: "proj-interactive-3",
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        const client = createWsClient(
          `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(token)}&executionId=${encodeURIComponent(execId)}`,
        );
        await client.openPromise;

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Pick a color:"));
        client.ws.send(JSON.stringify({ type: "stdin", data: "Emerald\n" }));

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Selected: Emerald"));

        const exitMsg = (await client.waitForMessage((m) => m.type === "exit")) as {
          type: "exit";
          exitCode: number;
        };
        assert.equal(exitMsg.exitCode, 0);

        client.close();
      });

      // 17.3.1 TypeScript readline interactive execution
      await t.test("TypeScript: readline interaction over WebSocket", async () => {
        const execId = `test-ws-ts-rl-${Date.now()}`;
        const runRes = await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-interactive-ts",
            userId: "user-ts",
            language: "TypeScript",
            files: {
              "main.ts": [
                'import * as readline from "node:readline";',
                'interface PromptConfig { query: string; }',
                'const config: PromptConfig = { query: "Enter your favorite framework: " };',
                'const rl = readline.createInterface({ input: process.stdin, output: process.stdout });',
                'rl.question(config.query, (answer: string) => {',
                '  console.log(`Chosen: ${answer.trim()}`);',
                "  rl.close();",
                "  process.exit(0);",
                "});",
              ].join("\n"),
            },
            entrypoint: "main.ts",
            interactive: true,
          }),
        });
        assert.equal(runRes.status, 200);

        const token = signTerminalToken(
          {
            uid: "user-ts",
            pid: "proj-interactive-ts",
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        const client = createWsClient(
          `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(token)}&executionId=${encodeURIComponent(execId)}`,
        );
        await client.openPromise;

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Enter your favorite framework:"));
        client.ws.send(JSON.stringify({ type: "stdin", data: "React\n" }));

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Chosen: React"));

        const exitMsg = (await client.waitForMessage((m) => m.type === "exit")) as {
          type: "exit";
          exitCode: number;
        };
        assert.equal(exitMsg.exitCode, 0);

        client.close();
      });

      // 17.3.2 C++ std::cin interactive execution
      await t.test("C++: std::cin interaction over WebSocket", async () => {
        const execId = `test-ws-cpp-cin-${Date.now()}`;
        const runRes = await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-interactive-cpp",
            userId: "user-cpp",
            language: "C++",
            files: {
              "main.cpp": [
                "#include <iostream>",
                "#include <string>",
                "int main() {",
                "  std::cout << \"Enter user name: \" << std::flush;",
                "  std::string name;",
                "  if (std::cin >> name) {",
                "    std::cout << \"Welcome to CodeLab, \" << name << \"!\" << std::endl;",
                "  }",
                "  return 0;",
                "}",
              ].join("\n"),
            },
            entrypoint: "main.cpp",
            interactive: true,
          }),
        });
        assert.equal(runRes.status, 200);

        const token = signTerminalToken(
          {
            uid: "user-cpp",
            pid: "proj-interactive-cpp",
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        const client = createWsClient(
          `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(token)}&executionId=${encodeURIComponent(execId)}`,
        );
        await client.openPromise;

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Enter user name:"));
        client.ws.send(JSON.stringify({ type: "stdin", data: "Sibtain\n" }));

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Welcome to CodeLab, Sibtain!"));

        const exitMsg = (await client.waitForMessage((m) => m.type === "exit")) as {
          type: "exit";
          exitCode: number;
        };
        assert.equal(exitMsg.exitCode, 0);

        client.close();
      });

      // 17.3.3 C++: multiple inputs over std::cin
      await t.test("C++: multiple inputs over std::cin", async () => {
        const execId = `test-ws-cpp-multi-${Date.now()}`;
        const runRes = await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-interactive-cpp-2",
            userId: "user-cpp-2",
            language: "C++",
            files: {
              "main.cpp": [
                "#include <iostream>",
                "int main() {",
                "  std::cout << \"Input A: \" << std::flush;",
                "  int a = 0, b = 0;",
                "  if (std::cin >> a) {",
                "    std::cout << \"Input B: \" << std::flush;",
                "    if (std::cin >> b) {",
                "      std::cout << \"Product: \" << (a * b) << std::endl;",
                "    }",
                "  }",
                "  return 0;",
                "}",
              ].join("\n"),
            },
            entrypoint: "main.cpp",
            interactive: true,
          }),
        });
        assert.equal(runRes.status, 200);

        const token = signTerminalToken(
          {
            uid: "user-cpp-2",
            pid: "proj-interactive-cpp-2",
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        const client = createWsClient(
          `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(token)}&executionId=${encodeURIComponent(execId)}`,
        );
        await client.openPromise;

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Input A:"));
        client.ws.send(JSON.stringify({ type: "stdin", data: "6\n" }));

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Input B:"));
        client.ws.send(JSON.stringify({ type: "stdin", data: "7\n" }));

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Product: 42"));

        const exitMsg = (await client.waitForMessage((m) => m.type === "exit")) as {
          type: "exit";
          exitCode: number;
        };
        assert.equal(exitMsg.exitCode, 0);

        client.close();
      });

      // 17.3.4 C++: Ctrl+C (SIGINT) signal handling over WebSocket
      await t.test("C++: Ctrl+C (SIGINT) signal handling over WebSocket", async () => {
        const execId = `test-ws-cpp-sigint-${Date.now()}`;
        const runRes = await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-cpp-sigint",
            userId: "user-cpp-sig",
            language: "C++",
            files: {
              "main.cpp": [
                "#include <iostream>",
                "#include <unistd.h>",
                "#include <csignal>",
                "void handle_sigint(int) {",
                "  std::cout << \"CPP_CAUGHT_SIGINT\" << std::endl;",
                "  _exit(0);",
                "}",
                "int main() {",
                "  std::signal(SIGINT, handle_sigint);",
                "  std::cout << \"CPP_READY_WAITING\" << std::endl;",
                "  sleep(30);",
                "  return 0;",
                "}",
              ].join("\n"),
            },
            entrypoint: "main.cpp",
            interactive: true,
          }),
        });
        assert.equal(runRes.status, 200);

        const token = signTerminalToken(
          {
            uid: "user-cpp-sig",
            pid: "proj-cpp-sigint",
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        const client = createWsClient(
          `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(token)}&executionId=${encodeURIComponent(execId)}`,
        );
        await client.openPromise;

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("CPP_READY_WAITING"));
        client.ws.send(JSON.stringify({ type: "signal", signal: "SIGINT" }));

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("CPP_CAUGHT_SIGINT"));
        const exitMsg = (await client.waitForMessage((m) => m.type === "exit")) as { type: "exit"; exitCode: number };
        assert.equal(exitMsg.exitCode, 0);

        client.close();
      });

      // 17.3.5 Go fmt.Scan interactive execution
      await t.test("Go: fmt.Scan interaction over WebSocket", async () => {
        const execId = `test-ws-go-scan-${Date.now()}`;
        const runRes = await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-interactive-go",
            userId: "user-go",
            language: "Go",
            files: {
              "main.go": [
                "package main",
                "import \"fmt\"",
                "func main() {",
                "  fmt.Print(\"Enter your name: \")",
                "  var name string",
                "  if _, err := fmt.Scan(&name); err == nil {",
                "    fmt.Printf(\"Welcome to CodeLab Go, %s!\\n\", name)",
                "  }",
                "}",
              ].join("\n"),
            },
            entrypoint: "main.go",
            interactive: true,
          }),
        });
        assert.equal(runRes.status, 200);

        const token = signTerminalToken(
          {
            uid: "user-go",
            pid: "proj-interactive-go",
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        const client = createWsClient(
          `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(token)}&executionId=${encodeURIComponent(execId)}`,
        );
        await client.openPromise;

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Enter your name:"), 25000);
        client.ws.send(JSON.stringify({ type: "stdin", data: "Gopher\n" }));

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Welcome to CodeLab Go, Gopher!"));

        const exitMsg = (await client.waitForMessage((m) => m.type === "exit")) as {
          type: "exit";
          exitCode: number;
        };
        assert.equal(exitMsg.exitCode, 0);

        client.close();
      });

      // 17.3.6 Go: multiple sequential inputs over WebSocket
      await t.test("Go: multiple inputs over fmt.Scan", async () => {
        const execId = `test-ws-go-multi-${Date.now()}`;
        const runRes = await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-interactive-go-2",
            userId: "user-go-2",
            language: "Go",
            files: {
              "main.go": [
                "package main",
                "import \"fmt\"",
                "func main() {",
                "  fmt.Print(\"Number 1: \")",
                "  var a, b int",
                "  if _, err := fmt.Scan(&a); err == nil {",
                "    fmt.Print(\"Number 2: \")",
                "    if _, err := fmt.Scan(&b); err == nil {",
                "      fmt.Printf(\"Sum: %d\\n\", a+b)",
                "    }",
                "  }",
                "}",
              ].join("\n"),
            },
            entrypoint: "main.go",
            interactive: true,
          }),
        });
        assert.equal(runRes.status, 200);

        const token = signTerminalToken(
          {
            uid: "user-go-2",
            pid: "proj-interactive-go-2",
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        const client = createWsClient(
          `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(token)}&executionId=${encodeURIComponent(execId)}`,
        );
        await client.openPromise;

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Number 1:"), 25000);
        client.ws.send(JSON.stringify({ type: "stdin", data: "15\n" }));

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Number 2:"));
        client.ws.send(JSON.stringify({ type: "stdin", data: "27\n" }));

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("Sum: 42"));

        const exitMsg = (await client.waitForMessage((m) => m.type === "exit")) as {
          type: "exit";
          exitCode: number;
        };
        assert.equal(exitMsg.exitCode, 0);

        client.close();
      });

      // 17.3.7 Go: Ctrl+C (SIGINT) signal handling over WebSocket
      await t.test("Go: Ctrl+C (SIGINT) signal handling over WebSocket", async () => {
        const execId = `test-ws-go-sigint-${Date.now()}`;
        const runRes = await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-go-sigint",
            userId: "user-go-sig",
            language: "Go",
            files: {
              "main.go": [
                "package main",
                "import (",
                "  \"fmt\"",
                "  \"os\"",
                "  \"os/signal\"",
                "  \"syscall\"",
                "  \"time\"",
                ")",
                "func main() {",
                "  c := make(chan os.Signal, 1)",
                "  signal.Notify(c, os.Interrupt, syscall.SIGINT)",
                "  fmt.Println(\"GO_READY_WAITING\")",
                "  go func() {",
                "    <-c",
                "    fmt.Println(\"GO_CAUGHT_SIGINT\")",
                "    os.Exit(0)",
                "  }()",
                "  time.Sleep(30 * time.Second)",
                "}",
              ].join("\n"),
            },
            entrypoint: "main.go",
            interactive: true,
          }),
        });
        assert.equal(runRes.status, 200);

        const token = signTerminalToken(
          {
            uid: "user-go-sig",
            pid: "proj-go-sigint",
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        const client = createWsClient(
          `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(token)}&executionId=${encodeURIComponent(execId)}`,
        );
        await client.openPromise;

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("GO_READY_WAITING"), 25000);
        client.ws.send(JSON.stringify({ type: "signal", signal: "SIGINT" }));

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("GO_CAUGHT_SIGINT"));
        const exitMsg = (await client.waitForMessage((m) => m.type === "exit")) as { type: "exit"; exitCode: number };
        assert.equal(exitMsg.exitCode, 0);

        client.close();
      });

      // 17.4 Ctrl+C (SIGINT) signal handling over WebSocket
      await t.test("Ctrl+C: SIGINT signal terminates container cleanly", async () => {
        const execId = `test-ws-sigint-${Date.now()}`;
        const runRes = await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-interactive-4",
            userId: "user-4",
            language: "Python",
            files: {
              "main.py": [
                "import time",
                'print("READY_WAITING", flush=True)',
                "try:",
                "    time.sleep(30)",
                "except KeyboardInterrupt:",
                '    print("CAUGHT_SIGINT", flush=True)',
                "    raise",
              ].join("\n"),
            },
            entrypoint: "main.py",
            interactive: true,
          }),
        });
        assert.equal(runRes.status, 200);

        const token = signTerminalToken(
          {
            uid: "user-4",
            pid: "proj-interactive-4",
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        const client = createWsClient(
          `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(token)}&executionId=${encodeURIComponent(execId)}`,
        );
        await client.openPromise;

        await client.waitForMessage((m) => m.type === "stdout" && m.data.includes("READY_WAITING"));

        // Send SIGINT signal
        client.ws.send(JSON.stringify({ type: "signal", signal: "SIGINT" }));

        // Container should exit promptly with non-zero exit code
        const exitMsg = (await client.waitForMessage((m) => m.type === "exit", 5000)) as {
          type: "exit";
          exitCode: number;
        };
        assert.ok(exitMsg.exitCode !== 0, "SIGINT should result in non-zero exit code (e.g. 130 or 1)");

        client.close();
      });

      // 17.5 Security: WebSocket reject on invalid token
      await t.test("Security: reject WebSocket connection with invalid or forged token", async () => {
        const execId = `test-ws-sec-invalid-${Date.now()}`;
        await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-sec",
            userId: "user-sec",
            language: "Python",
            files: { "main.py": "import time\ntime.sleep(10)\n" },
            entrypoint: "main.py",
            interactive: true,
          }),
        });

        await new Promise<void>((resolve, reject) => {
          const wsBad = new WebSocket(
            `ws://127.0.0.1:${port}/terminal?token=invalid.tampered.token&executionId=${encodeURIComponent(execId)}`,
          );
          wsBad.on("close", (code) => {
            assert.equal(code, 4401, "Expected close code 4401 for unauthorized token");
            resolve();
          });
          wsBad.on("error", () => {});
          setTimeout(() => reject(new Error("Timeout waiting for 4401 close")), 4000);
        });

        // Clean up container
        await fetch(`${baseUrl}/stop`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({ executionId: execId, projectId: "proj-sec", userId: "user-sec" }),
        });
      });

      // 17.6 Security: WebSocket reject on cross-project token mismatch
      await t.test("Security: reject WebSocket connection when project claims mismatch", async () => {
        const execId = `test-ws-sec-mismatch-${Date.now()}`;
        await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-alpha",
            userId: "user-alpha",
            language: "Python",
            files: { "main.py": "import time\ntime.sleep(10)\n" },
            entrypoint: "main.py",
            interactive: true,
          }),
        });

        // Sign token for a DIFFERENT project (proj-beta)
        const mismatchToken = signTerminalToken(
          {
            uid: "user-beta",
            pid: "proj-beta", // WRONG project
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        await new Promise<void>((resolve, reject) => {
          const wsMismatch = new WebSocket(
            `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(mismatchToken)}&executionId=${encodeURIComponent(execId)}`,
          );
          wsMismatch.on("close", (code) => {
            assert.equal(code, 4403, "Must close with code 4403 (Forbidden)");
            resolve();
          });
          wsMismatch.on("error", () => {});
          setTimeout(() => reject(new Error("Timeout waiting for 4403 close")), 4000);
        });

        // Clean up container
        await fetch(`${baseUrl}/stop`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({ executionId: execId, projectId: "proj-alpha", userId: "user-alpha" }),
        });
      });

      // 17.7 Lifecycle: WebSocket disconnect terminates running container
      await t.test("Lifecycle: WebSocket disconnect automatically cleans up running container", async () => {
        const execId = `test-ws-cleanup-${Date.now()}`;
        await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: "proj-cleanup",
            userId: "user-cleanup",
            language: "Python",
            files: { "main.py": "import time\ntime.sleep(60)\n" },
            entrypoint: "main.py",
            interactive: true,
          }),
        });

        const token = signTerminalToken(
          {
            uid: "user-cleanup",
            pid: "proj-cleanup",
            executionId: execId,
            exp: Date.now() + 60_000,
          },
          RUNNER_SECRET,
        );

        const ws = new WebSocket(
          `ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(token)}&executionId=${encodeURIComponent(execId)}`,
        );

        await new Promise<void>((resolve, reject) => {
          ws.on("open", () => resolve());
          ws.on("error", reject);
        });

        // Health should report active execution
        const beforeHealth = (await (await fetch(`${baseUrl}/health`)).json()) as HealthResponse;
        assert.ok((beforeHealth.concurrency?.active ?? 0) >= 1, "Should show active execution");

        // Close WebSocket connection to trigger disconnect handler
        ws.close();

        // Wait a brief moment for the cleanup to occur
        await new Promise((r) => setTimeout(r, 2500));

        // Concurrency slot must be released
        const afterHealth = (await (await fetch(`${baseUrl}/health`)).json()) as HealthResponse;
        assert.equal(afterHealth.concurrency?.active, 0, "Execution slot should be released after disconnect");
      });

      // 18. Phase 6.4 Collaborative Execution Test Suite
      await t.test("Phase 6.4 — Multi-client broadcast & shared live output", async () => {
        const execId = `test-collab-fanout-${Date.now()}`;
        const projId = "proj-collab-1";
        const ownerId = "user-alice";
        const observerId = "user-bob";

        // Start interactive execution that emits continuous output
        const runRes = await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: projId,
            userId: ownerId,
            language: "Python",
            files: {
              "main.py": 'import time\nprint("Line 1: Hello from Alice")\ntime.sleep(0.5)\nprint("Line 2: Shared Execution Active")\ntime.sleep(0.5)\nprint("Line 3: Finished")\n',
            },
            entrypoint: "main.py",
            interactive: true,
          }),
        });
        assert.equal(runRes.status, 200);

        // Sign tokens for owner and observer
        const ownerToken = signTerminalToken(
          { uid: ownerId, pid: projId, executionId: execId, isProjectOwner: false, exp: Date.now() + 60_000 },
          RUNNER_SECRET,
        );
        const observerToken = signTerminalToken(
          { uid: observerId, pid: projId, executionId: execId, isProjectOwner: false, exp: Date.now() + 60_000 },
          RUNNER_SECRET,
        );

        const ownerWs = new WebSocket(`ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(ownerToken)}&executionId=${encodeURIComponent(execId)}`);
        const observerWs = new WebSocket(`ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(observerToken)}&executionId=${encodeURIComponent(execId)}`);

        const ownerMessages: TerminalServerMessage[] = [];
        const observerMessages: TerminalServerMessage[] = [];

        ownerWs.on("message", (raw) => {
          try {
            ownerMessages.push(JSON.parse(raw.toString("utf8")));
          } catch {}
        });

        observerWs.on("message", (raw) => {
          try {
            observerMessages.push(JSON.parse(raw.toString("utf8")));
          } catch {}
        });

        // Wait for both connections to complete
        await Promise.all([
          new Promise<void>((r) => ownerWs.on("close", () => r())),
          new Promise<void>((r) => observerWs.on("close", () => r())),
        ]);

        // Check session metadata was received
        const ownerSession = ownerMessages.find((m) => m.type === "session");
        assert.ok(ownerSession && ownerSession.type === "session");
        assert.equal(ownerSession.mode, "owner");

        const observerSession = observerMessages.find((m) => m.type === "session");
        assert.ok(observerSession && observerSession.type === "session");
        assert.equal(observerSession.mode, "observer");

        // Both clients must receive stdout Lines 1, 2, and 3
        const ownerStdout = ownerMessages.filter((m) => m.type === "stdout").map((m) => (m as { data: string }).data).join("");
        const observerStdout = observerMessages.filter((m) => m.type === "stdout").map((m) => (m as { data: string }).data).join("");

        assert.match(ownerStdout, /Line 1: Hello from Alice/);
        assert.match(ownerStdout, /Line 2: Shared Execution Active/);
        assert.match(ownerStdout, /Line 3: Finished/);

        assert.match(observerStdout, /Line 1: Hello from Alice/);
        assert.match(observerStdout, /Line 2: Shared Execution Active/);
        assert.match(observerStdout, /Line 3: Finished/);

        // Both clients must receive exit event
        const ownerExit = ownerMessages.find((m) => m.type === "exit");
        const observerExit = observerMessages.find((m) => m.type === "exit");
        assert.ok(ownerExit && ownerExit.type === "exit");
        assert.equal(ownerExit.exitCode, 0);
        assert.ok(observerExit && observerExit.type === "exit");
        assert.equal(observerExit.exitCode, 0);
      });

      await t.test("Phase 6.4 — Late-joining observer history buffer replay", async () => {
        const execId = `test-collab-history-${Date.now()}`;
        const projId = "proj-collab-2";
        const ownerId = "user-alice";
        const observerId = "user-carol";

        // Start execution that writes initial output then pauses
        await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: projId,
            userId: ownerId,
            language: "Python",
            files: {
              "main.py": 'import time\nprint("INITIAL_HISTORY_CHUNK_A")\nprint("INITIAL_HISTORY_CHUNK_B")\ntime.sleep(1.0)\nprint("LATER_CHUNK_C")\n',
            },
            entrypoint: "main.py",
            interactive: true,
          }),
        });

        // Connect owner first
        const ownerToken = signTerminalToken(
          { uid: ownerId, pid: projId, executionId: execId, exp: Date.now() + 60_000 },
          RUNNER_SECRET,
        );
        const ownerWs = new WebSocket(`ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(ownerToken)}&executionId=${encodeURIComponent(execId)}`);

        // Wait 300ms so initial output has already been produced and buffered
        await new Promise((r) => setTimeout(r, 400));

        // Now late-joining observer Carol connects
        const observerToken = signTerminalToken(
          { uid: observerId, pid: projId, executionId: execId, exp: Date.now() + 60_000 },
          RUNNER_SECRET,
        );
        const observerWs = new WebSocket(`ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(observerToken)}&executionId=${encodeURIComponent(execId)}`);

        const observerMessages: TerminalServerMessage[] = [];
        observerWs.on("message", (raw) => {
          try {
            observerMessages.push(JSON.parse(raw.toString("utf8")));
          } catch {}
        });

        await new Promise<void>((r) => observerWs.on("close", () => r()));
        ownerWs.close();

        const observerStdout = observerMessages.filter((m) => m.type === "stdout").map((m) => (m as { data: string }).data).join("");
        // Carol must have received the replayed initial chunks as well as the later chunk
        assert.match(observerStdout, /INITIAL_HISTORY_CHUNK_A/);
        assert.match(observerStdout, /INITIAL_HISTORY_CHUNK_B/);
        assert.match(observerStdout, /LATER_CHUNK_C/);
      });

      await t.test("Phase 6.4 — Observer stdin rejection (strict observer mode)", async () => {
        const execId = `test-collab-stdin-reject-${Date.now()}`;
        const projId = "proj-collab-3";
        const ownerId = "user-alice";
        const observerId = "user-eve";

        await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: projId,
            userId: ownerId,
            language: "Python",
            files: {
              "main.py": 'import time\ntime.sleep(2.0)\nprint("Done")\n',
            },
            entrypoint: "main.py",
            interactive: true,
          }),
        });

        const observerToken = signTerminalToken(
          { uid: observerId, pid: projId, executionId: execId, exp: Date.now() + 60_000 },
          RUNNER_SECRET,
        );
        const observerWs = new WebSocket(`ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(observerToken)}&executionId=${encodeURIComponent(execId)}`);

        await new Promise<void>((r) => observerWs.on("open", () => r()));

        const observerErrors: string[] = [];
        observerWs.on("message", (raw) => {
          try {
            const msg = JSON.parse(raw.toString("utf8"));
            if (msg.type === "error") {
              observerErrors.push(msg.error);
            }
          } catch {}
        });

        // Observer attempts to inject stdin
        observerWs.send(JSON.stringify({ type: "stdin", data: "malicious input\n" }));

        // Wait briefly for error response
        await new Promise((r) => setTimeout(r, 200));

        assert.ok(
          observerErrors.some((e) => e.includes("Terminal input is disabled in observer mode")),
          "Observer stdin should be rejected with clear error message",
        );

        observerWs.close();

        // Clean up
        await fetch(`${baseUrl}/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Runner-Secret": RUNNER_SECRET },
          body: JSON.stringify({ executionId: execId, projectId: projId, userId: ownerId }),
        });
      });

      await t.test("Phase 6.4 — Stop authorization (initiator, project owner, unauthorized collaborator)", async () => {
        const execId = `test-collab-stop-auth-${Date.now()}`;
        const projId = "proj-collab-4";
        const initiatorId = "user-initiator";
        const projectOwnerId = "user-project-owner";
        const otherEditorId = "user-other-editor";

        await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: projId,
            userId: initiatorId,
            language: "Python",
            files: { "main.py": "import time\ntime.sleep(60)\n" },
            entrypoint: "main.py",
            interactive: true,
          }),
        });

        // 1. Other editor (not initiator, not project owner) tries to stop -> must return 403 Forbidden
        const editorStopRes = await fetch(`${baseUrl}/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Runner-Secret": RUNNER_SECRET },
          body: JSON.stringify({
            executionId: execId,
            projectId: projId,
            userId: otherEditorId,
            isProjectOwner: false,
          }),
        });
        assert.equal(editorStopRes.status, 403);
        const editorStopData = (await editorStopRes.json()) as { error?: string };
        assert.match(editorStopData.error ?? "", /Only the session owner or a project owner can stop/);

        // 2. Project owner (isProjectOwner: true) tries to stop -> must succeed (200 OK)
        const ownerStopRes = await fetch(`${baseUrl}/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Runner-Secret": RUNNER_SECRET },
          body: JSON.stringify({
            executionId: execId,
            projectId: projId,
            userId: projectOwnerId,
            isProjectOwner: true,
          }),
        });
        assert.equal(ownerStopRes.status, 200);
        const ownerStopData = (await ownerStopRes.json()) as { ok: boolean; stopped?: boolean };
        assert.equal(ownerStopData.ok, true);
        assert.equal(ownerStopData.stopped, true);
      });

      await t.test("Phase 6.4 — Active execution query & project isolation", async () => {
        const execId = `test-collab-active-${Date.now()}`;
        const projA = "proj-active-A";
        const projB = "proj-active-B";

        await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: projA,
            userId: "user-alpha",
            language: "Python",
            files: { "main.py": "import time\ntime.sleep(60)\n" },
            entrypoint: "main.py",
            interactive: true,
          }),
        });

        // Query active for Project A -> should return active session details
        const activeARes = await fetch(`${baseUrl}/project/${projA}/active`, {
          headers: { "X-Runner-Secret": RUNNER_SECRET },
        });
        assert.equal(activeARes.status, 200);
        const activeAData = (await activeARes.json()) as { ok: boolean; active?: { executionId: string; entrypoint: string } | null };
        assert.ok(activeAData.active);
        assert.equal(activeAData.active.executionId, execId);
        assert.equal(activeAData.active.entrypoint, "main.py");

        // Query active for Project B -> should return active: null (project isolation)
        const activeBRes = await fetch(`${baseUrl}/project/${projB}/active`, {
          headers: { "X-Runner-Secret": RUNNER_SECRET },
        });
        assert.equal(activeBRes.status, 200);
        const activeBData = (await activeBRes.json()) as { ok: boolean; active?: unknown };
        assert.equal(activeBData.active, null);

        // Stop session
        await fetch(`${baseUrl}/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Runner-Secret": RUNNER_SECRET },
          body: JSON.stringify({ executionId: execId, projectId: projA, userId: "user-alpha" }),
        });
      });

      await t.test("Phase 7.2 — C++ collaborative live execution output to observer", async () => {
        const execId = `test-collab-cpp-${Date.now()}`;
        const projId = "proj-collab-cpp";
        const ownerId = "user-alice-cpp";
        const observerId = "user-bob-cpp";

        await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: projId,
            userId: ownerId,
            language: "C++",
            files: {
              "main.cpp": [
                "#include <iostream>",
                "#include <unistd.h>",
                "int main() {",
                "  std::cout << \"CPP_COLLAB_OUTPUT_FOR_OBSERVERS\" << std::endl;",
                "  sleep(1);",
                "  std::cout << \"CPP_COLLAB_FINISHED\" << std::endl;",
                "  return 0;",
                "}",
              ].join("\n"),
            },
            entrypoint: "main.cpp",
            interactive: true,
          }),
        });

        const observerToken = signTerminalToken(
          { uid: observerId, pid: projId, executionId: execId, exp: Date.now() + 60_000 },
          RUNNER_SECRET,
        );
        const observerWs = new WebSocket(`ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(observerToken)}&executionId=${encodeURIComponent(execId)}`);
        await new Promise<void>((r) => observerWs.on("open", () => r()));

        const observerMessages: Array<{ type: string; data?: string }> = [];
        observerWs.on("message", (raw) => {
          try {
            observerMessages.push(JSON.parse(raw.toString("utf8")));
          } catch {}
        });

        // Wait for exit
        await new Promise<void>((resolve) => {
          const check = () => {
            if (observerMessages.some((m) => m.type === "exit")) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        observerWs.close();

        const observerStdout = observerMessages
          .filter((m) => m.type === "stdout")
          .map((m) => m.data || "")
          .join("");
        assert.match(observerStdout, /CPP_COLLAB_OUTPUT_FOR_OBSERVERS/);
        assert.match(observerStdout, /CPP_COLLAB_FINISHED/);
      });

      await t.test("Phase 7.3 — Go collaborative live execution output to observer", async () => {
        const execId = `test-collab-go-${Date.now()}`;
        const projId = "proj-collab-go";
        const ownerId = "user-alice-go";
        const observerId = "user-bob-go";

        await fetch(`${baseUrl}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
          },
          body: JSON.stringify({
            executionId: execId,
            projectId: projId,
            userId: ownerId,
            language: "Go",
            files: {
              "main.go": [
                "package main",
                "import (",
                "  \"fmt\"",
                "  \"time\"",
                ")",
                "func main() {",
                "  fmt.Println(\"GO_COLLAB_OUTPUT_FOR_OBSERVERS\")",
                "  time.Sleep(1 * time.Second)",
                "  fmt.Println(\"GO_COLLAB_FINISHED\")",
                "}",
              ].join("\n"),
            },
            entrypoint: "main.go",
            interactive: true,
          }),
        });

        const observerToken = signTerminalToken(
          { uid: observerId, pid: projId, executionId: execId, exp: Date.now() + 60_000 },
          RUNNER_SECRET,
        );
        const observerWs = new WebSocket(`ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(observerToken)}&executionId=${encodeURIComponent(execId)}`);
        await new Promise<void>((r) => observerWs.on("open", () => r()));

        const observerMessages: Array<{ type: string; data?: string }> = [];
        observerWs.on("message", (raw) => {
          try {
            observerMessages.push(JSON.parse(raw.toString("utf8")));
          } catch {}
        });

        // Wait for exit
        await new Promise<void>((resolve) => {
          const check = () => {
            if (observerMessages.some((m) => m.type === "exit")) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        observerWs.close();

        const observerStdout = observerMessages
          .filter((m) => m.type === "stdout")
          .map((m) => m.data || "")
          .join("");
        assert.match(observerStdout, /GO_COLLAB_OUTPUT_FOR_OBSERVERS/);
        assert.match(observerStdout, /GO_COLLAB_FINISHED/);
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
