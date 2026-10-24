/**
 * Human-readable messages for call problems. Kept separate so the call UI
 * stays readable and the wording is consistent.
 */
import {
  ConnectionError,
  ConnectionErrorReason,
  DisconnectReason,
  MediaDeviceFailure,
} from "livekit-client";
import type { CallTokenResult } from "@/server/actions/calls";

export type DeviceKind = "microphone" | "camera";

export function describeMediaError(error: unknown, kind: DeviceKind): string {
  const Kind = kind === "camera" ? "Camera" : "Microphone";
  if (typeof window !== "undefined" && (!window.isSecureContext || !navigator.mediaDevices)) {
    return "Camera and microphone only work on a secure page (HTTPS or localhost).";
  }
  switch (MediaDeviceFailure.getFailure(error)) {
    case MediaDeviceFailure.PermissionDenied:
      return `${Kind} access is blocked. Allow it in your browser's site settings, then try again.`;
    case MediaDeviceFailure.NotFound:
      return `No ${kind} was found. Connect one and try again.`;
    case MediaDeviceFailure.DeviceInUse:
      return `Your ${kind} is being used by another app. Close it and try again.`;
    default:
      return `Couldn't start your ${kind}. Try again.`;
  }
}

export function describeTokenError(result: Extract<CallTokenResult, { ok: false }>): string {
  switch (result.reason) {
    case "not_configured":
      return "Calls aren't set up on this server yet.";
    case "unauthenticated":
      return "Your session has ended. Sign in again to join the call.";
    case "not_found":
      return "You no longer have access to this project.";
    default:
      return result.error;
  }
}

export function describeConnectError(error: unknown): string {
  if (error instanceof ConnectionError) {
    switch (error.reason) {
      case ConnectionErrorReason.NotAllowed:
        return "The call server refused this session. Try rejoining.";
      case ConnectionErrorReason.ServerUnreachable:
      case ConnectionErrorReason.WebSocket:
      case ConnectionErrorReason.ServiceNotFound:
        return "Couldn't reach the call server. Check your connection and try again.";
      case ConnectionErrorReason.Timeout:
        return "Connecting to the call timed out. Check your connection and try again.";
      case ConnectionErrorReason.Cancelled:
        return "Joining was cancelled.";
    }
  }
  return "Couldn't connect to the call. Try again.";
}

/** null = an expected, user-initiated disconnect. */
export function describeDisconnect(reason: DisconnectReason | undefined): string | null {
  switch (reason) {
    case DisconnectReason.CLIENT_INITIATED:
      return null;
    case DisconnectReason.DUPLICATE_IDENTITY:
      return "You joined this call from another tab or device, so this one left.";
    case DisconnectReason.PARTICIPANT_REMOVED:
      return "You were removed from the call.";
    case DisconnectReason.ROOM_DELETED:
      return "The call was ended.";
    case DisconnectReason.SERVER_SHUTDOWN:
      return "The call server restarted. Rejoin to continue.";
    default:
      return "The call connection was lost. Rejoin to continue.";
  }
}
