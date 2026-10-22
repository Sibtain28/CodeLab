/**
 * MOCK DATA — the demo workspace shown at /workspace/demo.
 * File contents live in browser memory only. Real file storage arrives
 * with Prisma, and live collaboration with Yjs.
 */
import { people, type Person } from "./people";

export interface WorkspacePeer extends Person {
  activity: string;
  file: string | null;
  cursor: { line: number; col: number } | null;
  inCall: boolean;
  micOn: boolean;
  cameraOn: boolean;
  status: "online" | "away";
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  branch: string;
  description: string;
}

export const demoWorkspace: WorkspaceMeta = {
  id: "demo",
  name: "orbit-dashboard",
  branch: "main",
  description: "Realtime metrics dashboard",
};

export const peers: WorkspacePeer[] = [
  {
    ...people.priya,
    activity: "Editing",
    file: "src/components/MetricCard.tsx",
    cursor: { line: 26, col: 21 },
    inCall: true,
    micOn: true,
    cameraOn: true,
    status: "online",
  },
  {
    ...people.leo,
    activity: "Viewing",
    file: "src/lib/presence.ts",
    cursor: { line: 7, col: 12 },
    inCall: true,
    micOn: false,
    cameraOn: true,
    status: "online",
  },
  {
    ...people.mei,
    activity: "Editing",
    file: "src/app/page.tsx",
    cursor: { line: 12, col: 31 },
    inCall: true,
    micOn: true,
    cameraOn: false,
    status: "online",
  },
  {
    ...people.sam,
    activity: "Idle",
    file: null,
    cursor: null,
    inCall: false,
    micOn: false,
    cameraOn: false,
    status: "away",
  },
];

export const initialFiles: Record<string, string> = {
  "src/app/page.tsx": `import { MetricCard } from "@/components/MetricCard";
import { Sidebar } from "@/components/Sidebar";
import { getMetrics } from "@/lib/metrics";

export default async function DashboardPage() {
  const metrics = await getMetrics({ range: "24h" });

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar active="overview" />
      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <section className="mt-6 grid grid-cols-3 gap-4">
          {metrics.map((metric) => (
            <MetricCard key={metric.id} {...metric} />
          ))}
        </section>
      </main>
    </div>
  );
}
`,
  "src/app/layout.tsx": `import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Orbit",
  description: "Realtime metrics for small teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
  "src/components/MetricCard.tsx": `import { formatDelta, formatNumber } from "@/lib/format";

export interface MetricCardProps {
  id: string;
  label: string;
  value: number;
  delta?: number;
  unit?: "ms" | "%" | "req/s";
}

/**
 * A single KPI tile. Positive deltas render green,
 * regressions render red.
 */
export function MetricCard({ label, value, delta, unit }: MetricCardProps) {
  const trend = delta && delta >= 0 ? "up" : "down";

  return (
    <article className="rounded-xl border border-zinc-800 p-5">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">
        {formatNumber(value)}
        {unit && <span className="ml-1 text-base text-zinc-500">{unit}</span>}
      </p>
      <p data-trend={trend} className="mt-1 text-xs">
        {formatDelta(delta)}
      </p>
    </article>
  );
}
`,
  "src/components/Sidebar.tsx": `import Link from "next/link";

const items = [
  { id: "overview", label: "Overview", href: "/" },
  { id: "latency", label: "Latency", href: "/latency" },
  { id: "errors", label: "Errors", href: "/errors" },
] as const;

export function Sidebar({ active }: { active: (typeof items)[number]["id"] }) {
  return (
    <nav className="w-56 border-r border-zinc-900 p-4">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={item.id === active ? "page" : undefined}
          className="block rounded-md px-3 py-2 text-sm"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
`,
  "src/lib/presence.ts": `type Peer = { id: string; name: string; color: string };

const peers = new Map<string, Peer>();
const listeners = new Set<(peers: Peer[]) => void>();

export function join(peer: Peer) {
  peers.set(peer.id, peer);
  emit();
}

export function leave(id: string) {
  peers.delete(id);
  emit();
}

export function subscribe(listener: (peers: Peer[]) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  const snapshot = [...peers.values()];
  listeners.forEach((listener) => listener(snapshot));
}
`,
  "src/lib/format.ts": `const compact = new Intl.NumberFormat("en", { notation: "compact" });

export function formatNumber(value: number): string {
  return compact.format(value);
}

export function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return \`\${sign}\${(delta * 100).toFixed(1)}%\`;
}
`,
  "src/lib/metrics.ts": `export interface Metric {
  id: string;
  label: string;
  value: number;
  delta?: number;
  unit?: "ms" | "%" | "req/s";
}

export async function getMetrics({ range }: { range: "1h" | "24h" | "7d" }) {
  const res = await fetch(\`\${process.env.API_URL}/metrics?range=\${range}\`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error("Failed to load metrics");
  return (await res.json()) as Metric[];
}
`,
  "src/styles/globals.css": `@import "tailwindcss";

:root {
  --radius: 12px;
  --surface: #0b0b0f;
}

body {
  background: var(--surface);
  color: #f4f4f5;
  font-feature-settings: "tnum";
}

[data-trend="up"] {
  color: #4ade80;
}

[data-trend="down"] {
  color: #f87171;
}
`,
  "public/offline.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Orbit is offline</title>
    <link rel="stylesheet" href="/offline.css" />
  </head>
  <body>
    <main class="offline">
      <h1>You're offline</h1>
      <p>Metrics will refresh when your connection returns.</p>
      <button type="button" onclick="location.reload()">Try again</button>
    </main>
  </body>
</html>
`,
  "scripts/seed-metrics.js": `// Seeds the local API with sample metrics for development.
const metrics = [
  { id: "p95", label: "p95 latency", value: 182, delta: -0.04, unit: "ms" },
  { id: "rps", label: "Throughput", value: 1240, delta: 0.12, unit: "req/s" },
  { id: "err", label: "Error rate", value: 0.6, delta: 0, unit: "%" },
];

async function seed() {
  const res = await fetch("http://localhost:4000/metrics", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(metrics),
  });
  console.log(res.ok ? "Seeded metrics" : \`Seed failed: \${res.status}\`);
}

seed();
`,
  "package.json": `{
  "name": "orbit-dashboard",
  "version": "0.4.2",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint ."
  },
  "dependencies": {
    "next": "16.4.2",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  }
}
`,
  "README.md": `# Orbit Dashboard

Realtime metrics for small teams.

## Getting started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Roadmap

- **Live presence** in shared views
- Alert rules with Slack delivery
- Per-team dashboards
`,
  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "paths": { "@/*": ["./src/*"] }
  }
}
`,
};

export const initialOpenTabs = [
  "src/components/MetricCard.tsx",
  "src/app/page.tsx",
  "src/lib/format.ts",
];

export interface Problem {
  file: string;
  line: number;
  col: number;
  severity: "error" | "warning";
  message: string;
  code: string;
}

export const problems: Problem[] = [
  {
    file: "src/components/MetricCard.tsx",
    line: 26,
    col: 22,
    severity: "error",
    message:
      "Argument of type 'number | undefined' is not assignable to parameter of type 'number'.",
    code: "ts(2345)",
  },
  {
    file: "src/components/MetricCard.tsx",
    line: 16,
    col: 17,
    severity: "warning",
    message: "A delta of exactly 0 is treated as falsy and renders as \"down\".",
    code: "logic",
  },
];
