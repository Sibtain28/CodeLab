/**
 * Turns collaborators' awareness selections into line/column positions for
 * the editor's existing name-label carets.
 */
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import type { PeerColor } from "@/lib/mock/people";

export interface CollabUser {
  id: string;
  name: string;
  color: PeerColor;
}

export interface RemoteCursor {
  /** Awareness client id (one per browser tab). */
  id: string;
  name: string;
  color: PeerColor;
  line: number;
  /** 0-based column. */
  col: number;
}

export function remoteCursors(awareness: Awareness, text: Y.Text): RemoteCursor[] {
  const doc = text.doc;
  if (!doc) return [];
  const content = text.toString();
  const cursors: RemoteCursor[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return;
    const user = state.user as CollabUser | undefined;
    const head = (state.selection as { head?: unknown } | null | undefined)?.head;
    if (!user || !head) return;
    try {
      const abs = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(head), doc);
      if (!abs || abs.type !== text) return;
      const before = content.slice(0, abs.index);
      const line = before.split("\n").length;
      const col = abs.index - (before.lastIndexOf("\n") + 1);
      cursors.push({ id: String(clientId), name: user.name.split(" ")[0] || "Guest", color: user.color, line, col });
    } catch {
      // Ignore malformed states from other clients.
    }
  });
  return cursors;
}
