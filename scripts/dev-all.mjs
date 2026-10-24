// Runs the Next.js dev server and the live collaboration server together:
//   npm run dev:all
// Output is prefixed with [web] / [collab]. Ctrl+C stops both.
import { spawn } from "node:child_process";

const procs = [
  { name: "web", cmd: "npx", args: ["next", "dev"] },
  { name: "collab", cmd: "npx", args: ["tsx", "collab/index.ts"] },
].map(({ name, cmd, args }) => {
  const child = spawn(cmd, args, { stdio: ["inherit", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "1" } });
  const prefix = (stream, out) =>
    stream.on("data", (chunk) =>
      chunk
        .toString()
        .split("\n")
        .filter((line) => line.length)
        .forEach((line) => out.write(`[${name}] ${line}\n`)),
    );
  prefix(child.stdout, process.stdout);
  prefix(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`[${name}] exited${code ? ` with code ${code}` : ""}`);
    if (name === "collab" && code) console.log("[collab] Live editing will be off until the collab server runs. See the error above.");
  });
  return child;
});

const stop = () => {
  procs.forEach((p) => p.kill("SIGINT"));
  setTimeout(() => process.exit(0), 1500);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
