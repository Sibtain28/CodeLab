"use client";

import {
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  UserPlus,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, MockBadge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { currentUser, peerText, type PeerColor } from "@/lib/mock/people";
import type { WorkspacePeer } from "@/lib/mock/workspace";

export interface CallState {
  joined: boolean;
  mic: boolean;
  camera: boolean;
  screen: boolean;
}

/* Camera-on tiles get a soft tint of the person's presence colour; camera-off
   tiles are neutral. No video is ever captured in this phase. */
const tileTint: Record<PeerColor, string> = {
  accent: "bg-[#eaf3ed]",
  violet: "bg-[#efecfa]",
  sky: "bg-[#e9f2f8]",
  amber: "bg-[#f7efe1]",
  rose: "bg-[#f8ebef]",
};

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface Tile {
  id: string;
  name: string;
  color: PeerColor;
  mic: boolean;
  camera: boolean;
  isYou?: boolean;
}

function VideoTile({ tile, speaking, compact }: { tile: Tile; speaking: boolean; compact?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex aspect-video animate-fade-in items-center justify-center overflow-hidden rounded-[10px] transition-[box-shadow,background-color] duration-300",
        tile.camera ? tileTint[tile.color] : "bg-raised",
        speaking ? "speak-ring" : "shadow-[inset_0_0_0_1px_rgb(32_33_31/0.05)]",
      )}
    >
      <Avatar name={tile.name} color={tile.color} size={compact ? "md" : tile.camera ? "xl" : "lg"} />
      <span className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-12px)] items-center gap-1 rounded-[5px] bg-white/90 px-1.5 text-[10.5px] leading-[18px] text-fg-muted shadow-hairline">
        {tile.mic ? <Mic className="h-3 w-3 shrink-0" /> : <MicOff className="h-3 w-3 shrink-0 text-danger" />}
        <span className="truncate">{tile.isYou ? "You" : tile.name.split(" ")[0]}</span>
      </span>
      {!tile.camera && (
        <VideoOff className="absolute right-2 top-2 h-3.5 w-3.5 text-fg-faint" aria-label="Camera off" />
      )}
    </div>
  );
}

function CallButton({
  label,
  on,
  onClick,
  iconOn,
  iconOff,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  iconOn: ReactNode;
  iconOff: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-95 [&_svg]:h-4 [&_svg]:w-4",
        on
          ? "bg-panel text-fg shadow-card hover:shadow-lift"
          : "bg-[#fbecea] text-danger shadow-[inset_0_0_0_1px_rgb(192_61_55/0.2)] hover:bg-[#f7e0dd]",
      )}
    >
      {on ? iconOn : iconOff}
    </button>
  );
}

export function CollaborationPanel({
  peers,
  call,
  onCallChange,
  onInvite,
  onFollow,
  onClose,
}: {
  peers: WorkspacePeer[];
  call: CallState;
  onCallChange: (next: Partial<CallState>) => void;
  onInvite: () => void;
  onFollow: (peer: WorkspacePeer) => void;
  onClose?: () => void;
}) {
  const inCall = peers.filter((p) => p.inCall);
  const [speakerIndex, setSpeakerIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Mock "active speaker" rotation and call timer while joined.
  useEffect(() => {
    if (!call.joined) return;
    const speaker = window.setInterval(() => setSpeakerIndex((i) => i + 1), 2600);
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      window.clearInterval(speaker);
      window.clearInterval(timer);
    };
  }, [call.joined]);

  const tiles: Tile[] = [
    {
      id: "me",
      name: currentUser.name,
      color: currentUser.color,
      mic: call.mic,
      camera: call.camera,
      isYou: true,
    },
    ...inCall.map((p) => ({ id: p.id, name: p.name, color: p.color, mic: p.micOn, camera: p.cameraOn })),
  ];
  const speakers = tiles.filter((t) => t.mic);
  const activeSpeaker = speakers.length ? speakers[speakerIndex % speakers.length].id : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between pl-4 pr-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-subtle">
          Collaboration
        </span>
        <div className="flex items-center gap-1.5">
          <MockBadge />
          {onClose && (
            <IconButton label="Close panel" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Call */}
        <section aria-label="Video call" className="px-3 pb-3">
          {call.joined ? (
            <>
              <div className="mb-2.5 flex items-center justify-between px-1">
                <p className="flex items-center gap-2 text-[12.5px] font-medium text-fg">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" /> Workspace call
                </p>
                <span className="font-mono text-[11px] text-fg-subtle">{formatDuration(elapsed)}</span>
              </div>
              {call.screen && (
                <div className="mb-2 flex aspect-video animate-rise flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-accent/40 bg-accent-soft text-center">
                  <MonitorUp className="h-5 w-5 text-accent" />
                  <p className="text-[12px] text-fg-muted">You are presenting</p>
                  <p className="text-[10.5px] text-fg-subtle">Screen sharing is simulated</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {tiles.map((t) => (
                  <VideoTile key={t.id} tile={t} speaking={t.id === activeSpeaker} compact />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-center gap-2">
                <CallButton
                  label={call.mic ? "Mute microphone" : "Unmute microphone"}
                  on={call.mic}
                  onClick={() => onCallChange({ mic: !call.mic })}
                  iconOn={<Mic />}
                  iconOff={<MicOff />}
                />
                <CallButton
                  label={call.camera ? "Turn camera off" : "Turn camera on"}
                  on={call.camera}
                  onClick={() => onCallChange({ camera: !call.camera })}
                  iconOn={<Video />}
                  iconOff={<VideoOff />}
                />
                <button
                  type="button"
                  onClick={() => onCallChange({ screen: !call.screen })}
                  aria-pressed={call.screen}
                  aria-label={call.screen ? "Stop sharing screen" : "Share screen"}
                  title={call.screen ? "Stop sharing screen" : "Share screen"}
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-95",
                    call.screen
                      ? "bg-accent text-white shadow-card"
                      : "bg-panel text-fg shadow-card hover:shadow-lift",
                  )}
                >
                  <MonitorUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCallChange({ joined: false, screen: false });
                    setElapsed(0);
                  }}
                  aria-label="Leave call"
                  title="Leave call"
                  className="inline-flex h-9 w-12 items-center justify-center rounded-full bg-danger text-white transition-[background-color,transform] duration-150 hover:bg-[#a8332e] active:scale-95"
                >
                  <PhoneOff className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="animate-fade-in rounded-[12px] bg-panel p-3 shadow-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-fg">Workspace call</p>
                  <p className="mt-0.5 text-[11.5px] text-fg-subtle">
                    {inCall.length} {inCall.length === 1 ? "person" : "people"} in the call
                  </p>
                </div>
                <AvatarStack people={inCall} size="xs" />
              </div>
              <div className="mt-3">
                <VideoTile
                  tile={{
                    id: "me",
                    name: currentUser.name,
                    color: currentUser.color,
                    mic: call.mic,
                    camera: call.camera,
                    isYou: true,
                  }}
                  speaking={false}
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <CallButton
                  label={call.mic ? "Mute microphone" : "Unmute microphone"}
                  on={call.mic}
                  onClick={() => onCallChange({ mic: !call.mic })}
                  iconOn={<Mic />}
                  iconOff={<MicOff />}
                />
                <CallButton
                  label={call.camera ? "Turn camera off" : "Turn camera on"}
                  on={call.camera}
                  onClick={() => onCallChange({ camera: !call.camera })}
                  iconOn={<Video />}
                  iconOff={<VideoOff />}
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    setElapsed(0);
                    onCallChange({ joined: true });
                  }}
                >
                  Join call
                </Button>
              </div>
              <p className="mt-3 text-[11px] leading-4 text-fg-subtle">
                Simulated call — no camera or microphone is accessed. Real audio and video arrive
                with LiveKit.
              </p>
            </div>
          )}
        </section>

        {/* Participants */}
        <section aria-label="Participants" className="border-t border-line p-3">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-subtle">
              In this workspace · {peers.length + 1}
            </p>
          </div>
          <ul className="space-y-0.5">
            <li className="flex items-center gap-2.5 rounded-[8px] px-2 py-1.5">
              <Avatar name={currentUser.name} color={currentUser.color} size="md" status="online" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] text-fg">
                  {currentUser.name} <span className="text-fg-subtle">(you)</span>
                </p>
                <p className="text-[11.5px] text-fg-subtle">Owner</p>
              </div>
              {call.joined &&
                (call.mic ? (
                  <Mic className="h-3.5 w-3.5 text-fg-subtle" />
                ) : (
                  <MicOff className="h-3.5 w-3.5 text-danger" />
                ))}
            </li>
            {peers.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onFollow(p)}
                  disabled={!p.file}
                  className="group flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left transition-colors duration-100 enabled:hover:bg-hover"
                  aria-label={p.file ? `Go to ${p.name}'s file` : `${p.name} is ${p.activity.toLowerCase()}`}
                >
                  <Avatar name={p.name} color={p.color} size="md" status={p.status} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[13px] text-fg">
                      <span className="truncate">{p.name}</span>
                      {p.role === "Viewer" && <Badge>Viewer</Badge>}
                    </p>
                    <p className="truncate text-[11.5px] text-fg-subtle">
                      {p.file ? (
                        <>
                          {p.activity}{" "}
                          <span className={cn("font-mono", peerText[p.color])}>
                            {p.file.split("/").pop()}
                          </span>
                        </>
                      ) : (
                        "Away"
                      )}
                    </p>
                  </div>
                  {p.inCall &&
                    (p.micOn ? (
                      <Mic className="h-3.5 w-3.5 text-fg-subtle" />
                    ) : (
                      <MicOff className="h-3.5 w-3.5 text-danger/80" />
                    ))}
                  {p.file && (
                    <span className="hidden text-[11px] text-fg-subtle group-hover:inline">Go to</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onInvite}>
            <UserPlus className="h-3.5 w-3.5" /> Invite collaborators
          </Button>
        </section>
      </div>
    </div>
  );
}
