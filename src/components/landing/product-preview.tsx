"use client";

import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  FileCode2,
  Folder,
  GitBranch,
  Mic,
  MicOff,
  MonitorUp,
  MousePointer2,
  PhoneOff,
  Video,
} from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { TokenLine } from "@/components/code/highlighted-lines";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { tokenize } from "@/lib/highlight";
import { people, type PeerColor } from "@/lib/mock/people";

/*
 * Hero product visualization — real HTML/CSS, no WebGL.
 *
 * Four layers share one preserve-3d stage and separate in depth on entry
 * (see .scene-* in globals.css). Pointer movement nudges the stage's tilt
 * through CSS variables, eased with requestAnimationFrame — no React
 * re-renders. The whole scene is laid out at a fixed design size and scaled
 * to its container so proportions hold from phone to desktop.
 */

const DESIGN_W = 1120;
const DESIGN_H = 640;
const MIN_SCALE = 0.52;

const before = `import { formatDelta, formatNumber } from "@/lib/format";

export function MetricCard({ label, value, delta }: Props) {
  const trend = (delta ?? 0) >= 0 ? "up" : "down";

  return (
    <article className="rounded-xl border p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">
        {formatNumber(value)}
      </p>
      <p data-trend={trend} className="mt-1 text-xs">`;

const after = `      </p>
    </article>
  );
}`;

const beforeLines = tokenize(before, "tsx");
const afterLines = tokenize(after, "tsx");

const cursorFlag: Record<PeerColor, string> = {
  accent: "bg-accent text-white",
  violet: "bg-peer-violet text-white",
  sky: "bg-peer-sky text-white",
  amber: "bg-peer-amber text-white",
  rose: "bg-peer-rose text-white",
};
const caret: Record<PeerColor, string> = {
  accent: "bg-accent",
  violet: "bg-peer-violet",
  sky: "bg-peer-sky",
  amber: "bg-peer-amber",
  rose: "bg-peer-rose",
};

function Caret({ name, color, blink }: { name: string; color: PeerColor; blink?: boolean }) {
  return (
    <span className="relative inline-block h-[18px] w-0 align-[-4px]">
      <span className={cn("absolute left-0 top-0 h-[18px] w-[2px] rounded-full", caret[color], blink && "animate-blink")} />
      <span
        className={cn(
          "absolute -top-[15px] left-0 whitespace-nowrap rounded-[4px] rounded-bl-none px-1.5 font-sans text-[9.5px] font-semibold leading-[14px]",
          cursorFlag[color],
        )}
      >
        {name}
      </span>
    </span>
  );
}

function Layer({
  z,
  style,
  className,
  children,
}: {
  z: number;
  style: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("scene-layer absolute", className)}
      style={{ ...style, "--z": `${z}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}

function EditorWindow() {
  const files = [
    { d: 0, n: "src", folder: true, open: true },
    { d: 1, n: "app", folder: true },
    { d: 1, n: "components", folder: true, open: true },
    { d: 2, n: "MetricCard.tsx", active: true },
    { d: 2, n: "Sidebar.tsx" },
    { d: 1, n: "lib", folder: true, open: true },
    { d: 2, n: "format.ts" },
    { d: 2, n: "presence.ts", dot: "bg-peer-sky" },
    { d: 0, n: "package.json" },
    { d: 0, n: "README.md" },
  ];
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[14px] bg-panel shadow-scene ring-1 ring-black/[0.06]">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-canvas/70 px-4">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e2e2dc]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e2e2dc]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e2e2dc]" />
        </div>
        <span className="text-[12px] font-medium text-fg">orbit-dashboard</span>
        <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-fg-subtle">
          <GitBranch className="h-3 w-3" /> main
        </span>
        <span className="ml-auto">
          <AvatarStack people={[people.priya, people.leo, people.mei]} size="xs" />
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[176px] shrink-0 border-r border-line bg-sunken/70 py-3 text-[11.5px]">
          {files.map((f) => (
            <div
              key={f.n}
              className={cn(
                "flex h-[26px] items-center gap-1.5 pr-3 text-fg-muted",
                f.active && "bg-accent-soft text-fg shadow-[inset_2px_0_0_var(--color-accent)]",
              )}
              style={{ paddingLeft: 12 + f.d * 12 }}
            >
              {f.folder ? (
                <>
                  {f.open ? (
                    <ChevronDown className="h-3 w-3 text-fg-faint" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-fg-faint" />
                  )}
                  <Folder className="h-3.5 w-3.5 text-fg-subtle" />
                </>
              ) : (
                <FileCode2 className="ml-[18px] h-3.5 w-3.5 text-[#3d78c2]" />
              )}
              <span className="truncate">{f.n}</span>
              {f.dot && <span className={cn("ml-auto h-1.5 w-1.5 rounded-full", f.dot)} />}
              {f.active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-peer-violet" />}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex h-9 items-end border-b border-line bg-canvas/50 px-2 text-[11.5px]">
            <span className="relative flex h-9 items-center gap-1.5 border-x border-line bg-panel px-3 text-fg">
              <span className="absolute inset-x-0 top-0 h-[2px] bg-accent" />
              <FileCode2 className="h-3.5 w-3.5 text-[#3d78c2]" /> MetricCard.tsx
            </span>
            <span className="flex h-9 items-center px-3 text-fg-subtle">format.ts</span>
            <span className="flex h-9 items-center px-3 text-fg-subtle">presence.ts</span>
          </div>
          <div className="py-3 font-mono text-[12.5px] leading-[22px]">
            {beforeLines.map((tokens, i) => (
              <div key={i} className={cn("flex whitespace-pre", i === 3 && "bg-[#f4f1fd]")}>
                <span className="w-11 shrink-0 select-none pr-4 text-right text-fg-faint">{i + 1}</span>
                <span>
                  <TokenLine tokens={tokens} />
                  {i === 3 && (
                    <span className="relative">
                      {" "}
                      <Caret name="Leo" color="sky" />
                    </span>
                  )}
                </span>
              </div>
            ))}
            {/* The line Priya is fixing, typed live */}
            <div className="flex whitespace-pre bg-accent-soft/70">
              <span className="w-11 shrink-0 select-none pr-4 text-right text-fg-muted">
                {beforeLines.length + 1}
              </span>
              <span>
                <span className="text-syn-plain">{"        {"}</span>
                <span className="text-syn-function">formatDelta</span>
                <span className="text-syn-punct">(</span>
                <span className="typing text-syn-plain">delta ?? 0</span>
                <Caret name="Priya" color="violet" />
                <span className="text-syn-punct">{")}"}</span>
              </span>
            </div>
            {afterLines.map((tokens, i) => (
              <div key={i} className="flex whitespace-pre">
                <span className="w-11 shrink-0 select-none pr-4 text-right text-fg-faint">
                  {beforeLines.length + 2 + i}
                </span>
                <TokenLine tokens={tokens} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CallPanel() {
  const tiles: { p: { name: string; color: PeerColor }; speaking?: boolean; muted?: boolean }[] = [
    { p: people.priya, speaking: true },
    { p: people.leo, muted: true },
    { p: people.mei },
    { p: { name: "Darain Qamar", color: "accent" } },
  ];
  const tileBg: Record<PeerColor, string> = {
    accent: "bg-[#eef5f0]",
    violet: "bg-[#f1eefb]",
    sky: "bg-[#ecf3f9]",
    amber: "bg-[#f8f1e5]",
    rose: "bg-[#f9edf1]",
  };
  return (
    <div className="rounded-[14px] bg-panel p-3 shadow-scene ring-1 ring-black/[0.06]">
      <div className="mb-2.5 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-fg">
          <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Pairing call
        </span>
        <span className="font-mono text-[10.5px] text-fg-subtle">24:18</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {tiles.map(({ p, speaking, muted }) => (
          <div
            key={p.name}
            className={cn(
              "relative flex aspect-[4/3] items-center justify-center rounded-lg",
              tileBg[p.color],
              speaking && "speak-ring",
            )}
          >
            <Avatar name={p.name} color={p.color} size="lg" />
            <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded-[4px] bg-white/85 px-1 text-[9.5px] leading-4 text-fg-muted">
              {muted ? <MicOff className="h-2.5 w-2.5 text-danger" /> : <Mic className="h-2.5 w-2.5" />}
              {p.name === "Darain Qamar" ? "You" : p.name.split(" ")[0]}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {[Mic, Video, MonitorUp].map((Icon, i) => (
          <span
            key={i}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-raised text-fg-muted ring-1 ring-inset ring-line"
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ))}
        <span className="inline-flex h-7 w-9 items-center justify-center rounded-full bg-danger text-white">
          <PhoneOff className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

function TerminalPanel() {
  return (
    <div className="h-full rounded-[14px] bg-[#fbfbf9] p-4 font-mono text-[11.5px] leading-[20px] shadow-scene ring-1 ring-black/[0.06]">
      <p className="mb-2 font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-fg-faint">Terminal</p>
      <p className="text-fg-subtle">
        <span className="text-accent">❯</span> npm run dev
      </p>
      <p className="text-fg-subtle">  ▲ Next.js 16.4 — ready on :3000</p>
      <p className="text-fg-subtle">  ○ Compiling / …</p>
      <p className="text-success">  ✓ Compiled in 1.2s</p>
    </div>
  );
}

export function ProductPreview() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Fit the fixed-size scene to its container.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      // Below ~560px the scene would become illegible, so it keeps a minimum
      // scale and is centre-cropped instead (the section clips the overflow).
      const scale = Math.min(1, Math.max(MIN_SCALE, width / DESIGN_W));
      const cropped = DESIGN_W * scale > width;
      // When cropping, centre on the editor (x≈495) rather than the whole scene.
      const offset = cropped ? width / 2 - 495 * scale : (width - DESIGN_W * scale) / 2;
      wrap.style.setProperty("--scale", scale.toFixed(4));
      wrap.style.setProperty("--offset", `${offset.toFixed(1)}px`);
    });
    ro.observe(wrap);

    // Pause the ambient loops (typing, cursor, speaker ring) while off screen.
    const scene = wrap.querySelector<HTMLElement>(".scene");
    const io = new IntersectionObserver(([entry]) => {
      scene?.toggleAttribute("data-paused", !entry.isIntersecting);
    });
    io.observe(wrap);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  // Gentle pointer parallax (fine pointers only, never with reduced motion).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    const region = stage.closest("section") ?? document.body;
    let rect = region.getBoundingClientRect();
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let frame = 0;

    const tick = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      // Write one transform on one element: compositor-only, no style recalc
      // of the scene's descendants.
      stage.style.transform = `rotateX(${(16 - y * 3).toFixed(3)}deg) rotateY(${(-11 + x * 5).toFixed(3)}deg) rotateZ(1.5deg)`;
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onEnter = () => {
      rect = region.getBoundingClientRect();
    };
    const onMove = (e: PointerEvent) => {
      tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      kick();
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      kick();
    };
    region.addEventListener("pointerenter", onEnter);
    region.addEventListener("pointermove", onMove as EventListener);
    region.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onEnter, { passive: true });
    return () => {
      region.removeEventListener("pointerenter", onEnter);
      window.removeEventListener("scroll", onEnter);
      region.removeEventListener("pointermove", onMove as EventListener);
      region.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label="CodeLab workspace: a code editor where Priya is typing a fix, a live pairing call with three teammates, and a terminal showing a successful build."
      className="relative mx-auto w-full max-w-[1120px] [--offset:-62px] [--scale:0.52] sm:[--offset:0px] sm:[--scale:0.6] md:[--scale:0.68] lg:[--scale:0.88] xl:[--scale:1]"
      style={{ height: `calc(${DESIGN_H}px * var(--scale))` }}
    >
      {/* Soft contact shadow on the "floor" */}
      <div
        aria-hidden="true"
        className="absolute inset-x-[8%] bottom-[2%] h-[18%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(32_33_31/0.16),transparent)] blur-xl"
      />
      <div
        className="scene absolute left-0 top-0 origin-top-left"
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: "translateX(var(--offset, 0px)) scale(var(--scale))",
        }}
      >
        <div ref={stageRef} className="scene-stage relative h-full w-full">
          <Layer z={-90} style={{ left: 10, top: 400, width: 440, height: 190 }}>
            <TerminalPanel />
          </Layer>
          <Layer z={0} style={{ left: 110, top: 24, width: 770, height: 520 }}>
            <EditorWindow />
          </Layer>
          <Layer z={100} style={{ left: 812, top: 120, width: 268 }}>
            <CallPanel />
          </Layer>
          {/* Floating details */}
          <Layer z={170} style={{ left: 24, top: -6 }}>
            <div className="flex items-center gap-2 rounded-full bg-panel py-1 pl-1 pr-3 text-[11.5px] text-fg-muted shadow-lift">
              <AvatarStack people={[people.priya, people.leo, people.mei]} size="xs" />
              3 editing now
            </div>
          </Layer>
          <Layer z={150} style={{ left: 600, top: 520 }}>
            <div className="flex items-center gap-2 rounded-full bg-panel px-3 py-1.5 text-[11.5px] text-fg-muted shadow-lift">
              <CircleCheck className="h-3.5 w-3.5 text-accent" />
              <span className="font-mono">Compiled / in 1.2s</span>
            </div>
          </Layer>
          <Layer z={130} style={{ left: 470, top: 250 }}>
            <div className="cursor-path flex items-start">
              <MousePointer2 className="h-4 w-4 fill-peer-amber text-white drop-shadow-sm" />
              <span className="ml-0.5 mt-3 rounded-[4px] bg-peer-amber px-1.5 text-[9.5px] font-semibold leading-[15px] text-white">
                Mei
              </span>
            </div>
          </Layer>
        </div>
      </div>
    </div>
  );
}
