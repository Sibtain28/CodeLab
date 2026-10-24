"use client";

/**
 * Real workspace call (LiveKit). Loaded only for saved projects (see
 * workspace-ide.tsx), so the demo never downloads the LiveKit client.
 *
 * The Room lives here, above the collaboration panel: closing the panel or
 * switching between desktop and mobile layouts doesn't drop the call. The
 * call UI is rendered into the panel through a portal (`slot`).
 */
import {
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  isTrackReference,
  useAudioPlayback,
  useConnectionState,
  useIsMuted,
  useIsSpeaking,
  useLocalParticipant,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type DisconnectReason,
  type Participant,
} from "livekit-client";
import { Eye, LoaderCircle, Mic, MicOff, PhoneOff, RotateCw, TriangleAlert, Video, VideoOff, Volume2, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { colorFor } from "@/lib/projects";
import type { PeerColor } from "@/lib/mock/people";
import { getCallToken } from "@/server/actions/calls";
import { describeConnectError, describeDisconnect, describeMediaError, describeTokenError, type DeviceKind } from "./messages";

export interface LiveCallState {
  joined: boolean;
  participants: number;
}

export interface LiveCallProps {
  projectId: string;
  me: { name: string };
  /** False when the server has no LiveKit settings; the panel explains instead of trying. */
  configured: boolean;
  /** From the workspace role (Owner/Editor: true, Viewer: false). The server enforces it too. */
  canPublish: boolean;
  /** Where to render the call UI (inside the collaboration panel); null when the panel is closed. */
  slot: HTMLElement | null;
  onStateChange: (state: LiveCallState) => void;
}

type Phase = "idle" | "joining" | "in-call";

export default function LiveCall({ projectId, me, configured, canPublish, slot, onStateChange }: LiveCallProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [prefs, setPrefs] = useState({ mic: true, camera: false });
  const [publishAllowed, setPublishAllowed] = useState(canPublish);
  const roomRef = useRef<Room | null>(null);
  const leaving = useRef(false);
  const stateCallback = useRef(onStateChange);
  useEffect(() => {
    stateCallback.current = onStateChange;
  });

  // Report joined/participant count to the status bar.
  useEffect(() => {
    if (!room) {
      stateCallback.current({ joined: false, participants: 0 });
      return;
    }
    const report = () => stateCallback.current({ joined: true, participants: room.remoteParticipants.size + 1 });
    report();
    room.on(RoomEvent.ParticipantConnected, report).on(RoomEvent.ParticipantDisconnected, report);
    return () => {
      room.off(RoomEvent.ParticipantConnected, report).off(RoomEvent.ParticipantDisconnected, report);
    };
  }, [room]);

  // Leave the call if the workspace view goes away.
  useEffect(
    () => () => {
      leaving.current = true;
      void roomRef.current?.disconnect();
      roomRef.current = null;
    },
    [],
  );

  const enableDevice = useCallback(async (target: Room, kind: DeviceKind, on: boolean) => {
    try {
      if (kind === "microphone") await target.localParticipant.setMicrophoneEnabled(on);
      else await target.localParticipant.setCameraEnabled(on);
      setNotice(null);
      return true;
    } catch (err) {
      setNotice(describeMediaError(err, kind));
      return false;
    }
  }, []);

  const join = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("joining");
    setError(null);
    setNotice(null);
    leaving.current = false;

    const result = await getCallToken(projectId).catch(() => null);
    if (!result || !result.ok) {
      setError(result ? describeTokenError(result) : "Couldn't reach the server. Check your connection and try again.");
      setPhase("idle");
      return;
    }

    const next = new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
    next.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      if (roomRef.current !== next) return;
      roomRef.current = null;
      setRoom(null);
      setPhase("idle");
      const message = leaving.current ? null : describeDisconnect(reason);
      if (message) setError(message);
    });
    next.on(RoomEvent.MediaDevicesError, (err: Error, kind?: MediaDeviceKind) =>
      setNotice(describeMediaError(err, kind === "videoinput" ? "camera" : "microphone")),
    );

    try {
      await next.connect(result.serverUrl, result.token);
    } catch (err) {
      console.warn("[calls] connect failed", err instanceof Error ? err.name : "");
      setError(describeConnectError(err));
      setPhase("idle");
      void next.disconnect();
      return;
    }
    roomRef.current = next;
    setRoom(next);
    setPublishAllowed(result.canPublish);
    setPhase("in-call");

    if (result.canPublish) {
      if (prefs.mic) await enableDevice(next, "microphone", true);
      if (prefs.camera) await enableDevice(next, "camera", true);
    }
  }, [phase, projectId, prefs, enableDevice]);

  const leave = useCallback(async () => {
    leaving.current = true;
    const current = roomRef.current;
    roomRef.current = null;
    setRoom(null);
    setPhase("idle");
    setNotice(null);
    await current?.disconnect();
  }, []);

  const toggle = useCallback(
    async (kind: DeviceKind) => {
      const current = roomRef.current;
      if (!current) {
        setPrefs((p) => (kind === "microphone" ? { ...p, mic: !p.mic } : { ...p, camera: !p.camera }));
        return;
      }
      const enabled = kind === "microphone" ? current.localParticipant.isMicrophoneEnabled : current.localParticipant.isCameraEnabled;
      if (await enableDevice(current, kind, !enabled)) {
        setPrefs((p) => (kind === "microphone" ? { ...p, mic: !enabled } : { ...p, camera: !enabled }));
      }
    },
    [enableDevice],
  );

  const ui = !configured ? (
    <NotConfigured />
  ) : room && phase === "in-call" ? (
    <RoomContext.Provider value={room}>
      <InCall canPublish={publishAllowed} notice={notice} onDismissNotice={() => setNotice(null)} onToggle={toggle} onLeave={leave} />
    </RoomContext.Provider>
  ) : (
    <PreJoin
      name={me.name}
      canPublish={canPublish}
      prefs={prefs}
      joining={phase === "joining"}
      error={error}
      onToggle={toggle}
      onJoin={join}
    />
  );

  return (
    <>
      {/* Remote audio keeps playing even while the panel is closed. */}
      {room && (
        <RoomContext.Provider value={room}>
          <RoomAudioRenderer />
        </RoomContext.Provider>
      )}
      {slot && createPortal(ui, slot)}
    </>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Card({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in rounded-[12px] bg-panel p-3 shadow-card">{children}</div>;
}

function NotConfigured() {
  return (
    <Card>
      <p className="text-[13px] font-medium text-fg">Workspace call</p>
      <p className="mt-1 text-[12px] leading-[18px] text-fg-subtle">
        Calls aren&apos;t set up on this server yet. An admin needs to add the LiveKit settings
        (<code className="font-mono text-[11px]">LIVEKIT_URL</code>, API key and secret) — see SETUP.md.
      </p>
    </Card>
  );
}

function ToggleButton({
  kind,
  on,
  disabled,
  disabledReason,
  onClick,
}: {
  kind: DeviceKind;
  on: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
}) {
  const label = disabled
    ? (disabledReason ?? "Unavailable")
    : kind === "microphone"
      ? on
        ? "Mute microphone"
        : "Unmute microphone"
      : on
        ? "Turn camera off"
        : "Turn camera on";
  const Icon = kind === "microphone" ? (on ? Mic : MicOff) : on ? Video : VideoOff;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={disabled ? undefined : on}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4",
        on && !disabled
          ? "bg-panel text-fg shadow-card hover:shadow-lift"
          : "bg-[#fbecea] text-danger shadow-[inset_0_0_0_1px_rgb(192_61_55/0.2)] hover:bg-[#f7e0dd]",
      )}
    >
      <Icon />
    </button>
  );
}

function Alert({ tone, children, action }: { tone: "error" | "warning"; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      role="alert"
      className={cn(
        "mt-2.5 flex items-start gap-2 rounded-[8px] px-2.5 py-2 text-[11.5px] leading-4",
        tone === "error" ? "bg-danger/[0.06] text-danger ring-1 ring-inset ring-danger/20" : "bg-[#fbf2e3] text-fg-muted ring-1 ring-inset ring-warning/25",
      )}
    >
      <TriangleAlert className={cn("mt-px h-3.5 w-3.5 shrink-0", tone === "warning" && "text-warning")} />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

const VIEWER_NOTE = "Viewers can watch and listen";

function PreJoin({
  name,
  canPublish,
  prefs,
  joining,
  error,
  onToggle,
  onJoin,
}: {
  name: string;
  canPublish: boolean;
  prefs: { mic: boolean; camera: boolean };
  joining: boolean;
  error: string | null;
  onToggle: (kind: DeviceKind) => void;
  onJoin: () => void;
}) {
  return (
    <Card>
      <p className="text-[13px] font-medium text-fg">Workspace call</p>
      <p className="mt-0.5 text-[11.5px] text-fg-subtle">
        {canPublish ? "Talk with everyone in this workspace." : `${VIEWER_NOTE} — your mic and camera stay off.`}
      </p>
      <div className="mt-3 flex aspect-video items-center justify-center rounded-[10px] bg-raised shadow-[inset_0_0_0_1px_rgb(32_33_31/0.05)]">
        <Avatar name={name} color="accent" size="lg" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <ToggleButton kind="microphone" on={canPublish && prefs.mic} disabled={!canPublish} disabledReason={VIEWER_NOTE} onClick={() => onToggle("microphone")} />
        <ToggleButton kind="camera" on={canPublish && prefs.camera} disabled={!canPublish} disabledReason={VIEWER_NOTE} onClick={() => onToggle("camera")} />
        <Button variant="primary" size="sm" className="ml-auto" onClick={onJoin} disabled={joining}>
          {joining && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          {joining ? "Joining…" : "Join call"}
        </Button>
      </div>
      {error && (
        <Alert
          tone="error"
          action={
            !joining && (
              <button type="button" onClick={onJoin} className="inline-flex shrink-0 items-center gap-1 font-medium underline-offset-2 hover:underline">
                <RotateCw className="h-3 w-3" /> Retry
              </button>
            )
          }
        >
          {error}
        </Alert>
      )}
    </Card>
  );
}

function useElapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function InCall({
  canPublish,
  notice,
  onDismissNotice,
  onToggle,
  onLeave,
}: {
  canPublish: boolean;
  notice: string | null;
  onDismissNotice: () => void;
  onToggle: (kind: DeviceKind) => void;
  onLeave: () => void;
}) {
  const state = useConnectionState();
  const elapsed = useElapsed();
  const { isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const { canPlayAudio, startAudio } = useAudioPlayback();
  // One tile per participant: their camera, or a placeholder when it's off.
  const tiles = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });
  const reconnecting = state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting;

  return (
    <div className="animate-fade-in">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <p className="flex items-center gap-2 text-[12.5px] font-medium text-fg">
          <span className={cn("h-1.5 w-1.5 rounded-full", reconnecting ? "bg-warning" : "animate-pulse bg-danger")} />
          Workspace call
        </p>
        <span className="flex items-center gap-2 font-mono text-[11px] text-fg-subtle" role="status">
          {reconnecting ? (
            <span className="flex items-center gap-1 text-warning">
              <WifiOff className="h-3 w-3" /> Reconnecting…
            </span>
          ) : (
            <>
              {tiles.length} · {elapsed}
            </>
          )}
        </span>
      </div>

      <div className={cn("grid gap-2", tiles.length > 1 && "grid-cols-2")} aria-label="Participants in the call">
        {tiles.map((t) => (
          <ParticipantTile key={`${t.participant.identity}:${t.source}`} trackRef={t} compact={tiles.length > 1} />
        ))}
      </div>

      {!canPlayAudio && (
        <button
          type="button"
          onClick={() => void startAudio()}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-[8px] bg-accent-soft px-3 py-2 text-[12px] font-medium text-accent ring-1 ring-inset ring-accent/25"
        >
          <Volume2 className="h-3.5 w-3.5" /> Tap to hear the call
        </button>
      )}
      {notice && (
        <Alert
          tone="warning"
          action={
            <button type="button" onClick={onDismissNotice} className="shrink-0 font-medium hover:underline">
              Dismiss
            </button>
          }
        >
          {notice}
        </Alert>
      )}

      <div className="mt-3 flex items-center justify-center gap-2">
        <ToggleButton kind="microphone" on={isMicrophoneEnabled} disabled={!canPublish} disabledReason={VIEWER_NOTE} onClick={() => onToggle("microphone")} />
        <ToggleButton kind="camera" on={isCameraEnabled} disabled={!canPublish} disabledReason={VIEWER_NOTE} onClick={() => onToggle("camera")} />
        <button
          type="button"
          onClick={onLeave}
          aria-label="Leave call"
          title="Leave call"
          className="inline-flex h-9 w-12 items-center justify-center rounded-full bg-danger text-white transition-[background-color,transform] duration-150 hover:bg-[#a8332e] active:scale-95"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
      {!canPublish && (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-fg-subtle">
          <Eye className="h-3 w-3" /> {VIEWER_NOTE}
        </p>
      )}
    </div>
  );
}

function roleOf(participant: Participant) {
  try {
    const role = (JSON.parse(participant.metadata || "{}") as { role?: unknown }).role;
    return role === "viewer" ? "Viewer" : null;
  } catch {
    return null;
  }
}

function ParticipantTile({ trackRef, compact }: { trackRef: TrackReferenceOrPlaceholder; compact: boolean }) {
  const { participant } = trackRef;
  const speaking = useIsSpeaking(participant);
  const micMuted = useIsMuted({ participant, source: Track.Source.Microphone });
  const cameraMuted = useIsMuted(trackRef);
  const showVideo = isTrackReference(trackRef) && !cameraMuted;
  const name = participant.name || "Guest";
  const color: PeerColor = participant.isLocal ? "accent" : colorFor(participant.identity);
  const viewer = roleOf(participant);

  return (
    <div
      className={cn(
        "relative flex aspect-video items-center justify-center overflow-hidden rounded-[10px] bg-raised transition-[box-shadow] duration-300",
        speaking ? "speak-ring" : "shadow-[inset_0_0_0_1px_rgb(32_33_31/0.05)]",
      )}
      data-participant={participant.isLocal ? "local" : "remote"}
    >
      {showVideo ? (
        <VideoTrack
          trackRef={trackRef}
          className={cn("h-full w-full object-cover", participant.isLocal && "-scale-x-100")}
        />
      ) : (
        <Avatar name={name} color={color} size={compact ? "md" : "lg"} />
      )}
      <span className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-12px)] items-center gap-1 rounded-[5px] bg-white/90 px-1.5 text-[10.5px] leading-[18px] text-fg-muted shadow-hairline">
        {micMuted ? <MicOff className="h-3 w-3 shrink-0 text-danger" aria-label="Muted" /> : <Mic className="h-3 w-3 shrink-0" />}
        <span className="truncate">{participant.isLocal ? "You" : name}</span>
        {viewer && <span className="text-fg-faint">· {viewer}</span>}
      </span>
      {!showVideo && <VideoOff className="absolute right-2 top-2 h-3.5 w-3.5 text-fg-faint" aria-label="Camera off" />}
    </div>
  );
}
