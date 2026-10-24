import "server-only";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Local development helper: when COLLAB_URL points at this machine, check
 * that something is actually listening before the browser tries (and waits).
 * Returns a human-readable problem, or null if it's reachable or can't be
 * judged from here (remote collab servers are left to the browser).
 */
export async function checkLocalCollabServer(collabUrl: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(collabUrl);
  } catch {
    return `COLLAB_URL isn't a valid URL (${collabUrl}).`;
  }
  if (!LOOPBACK.has(url.hostname)) return null;
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    return null;
  } catch {
    const problem = `the live collaboration server isn't running at ${collabUrl}. Start it with "npm run collab" (or use "npm run dev:all").`;
    console.warn(`[collab] Live editing is off: ${problem}`);
    return problem;
  }
}
