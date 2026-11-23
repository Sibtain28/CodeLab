import "dotenv/config";
import { createRunnerServer } from "./server";
import { isDockerAvailable, cleanStaleTempDirs, cleanupAllExecutions } from "./docker";

const PORT = Number(process.env.RUNNER_PORT || 4000);
const HOST = process.env.RUNNER_HOST || "127.0.0.1";

async function main() {
  // Clean up any stale temp directories left from previous aborted runs
  await cleanStaleTempDirs();

  const server = createRunnerServer();

  server.listen(PORT, HOST, async () => {
    console.log(`[runner] CodeLab execution runner listening on http://${HOST}:${PORT}`);
    const docker = await isDockerAvailable();
    if (docker.ok) {
      console.log(`[runner] Docker daemon connected (v${docker.version}). Hardened execution ready.`);
    } else {
      console.warn(`[runner] Docker is NOT available: ${docker.error}`);
      console.warn(`[runner] Start Docker Desktop or the docker daemon to enable execution.`);
    }
  });

  const stop = async () => {
    console.log("\n[runner] Shutting down execution runner and cleaning up containers...");
    await cleanupAllExecutions();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error("[runner] Fatal startup error:", err);
  process.exit(1);
});
