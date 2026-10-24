/**
 * Two-way binding between a Y.Text and a Monaco text model.
 *
 * Written for this app instead of using `y-monaco`, which imports
 * `monaco-editor/esm/vs/editor/editor.api.js` — a path monaco-editor 0.56's
 * package exports no longer resolve — and leaks editor listeners per binding.
 *
 * - Local typing → Y.Text (transaction origin = this binding).
 * - Remote updates → Monaco via `applyEdits` (kept out of Monaco's own undo
 *   stack; undo/redo goes through a Y.UndoManager that only tracks this
 *   user's edits, so ⌘Z never reverts a collaborator's typing).
 * - The local selection is published to awareness as Yjs relative positions,
 *   so remote cursors stay attached to the right text while others type.
 */
import type { editor as MonacoEditorNS, IDisposable } from "monaco-editor";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { monaco } from "@/lib/monaco/setup";

export class MonacoYBinding {
  readonly undoManager: Y.UndoManager;
  private applyingRemote = false;
  private readonly disposables: IDisposable[] = [];
  private readonly observer: (event: Y.YTextEvent, transaction: Y.Transaction) => void;

  constructor(
    private readonly text: Y.Text,
    private readonly model: MonacoEditorNS.ITextModel,
    private readonly editor: MonacoEditorNS.IStandaloneCodeEditor,
    private readonly awareness: Awareness | null,
  ) {
    const doc = text.doc!;

    // Start from the shared text.
    const shared = text.toString();
    if (model.getValue() !== shared) this.remote(() => model.setValue(shared));

    // Remote (and undo/redo) changes → Monaco.
    this.observer = (event, transaction) => {
      if (transaction.origin === this) return;
      this.remote(() => {
        let index = 0;
        for (const op of event.delta) {
          if (op.retain !== undefined) {
            index += op.retain;
          } else if (op.insert !== undefined) {
            const insert = typeof op.insert === "string" ? op.insert : "";
            const pos = model.getPositionAt(index);
            model.applyEdits([{ range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: insert }]);
            index += insert.length;
          } else if (op.delete !== undefined) {
            const start = model.getPositionAt(index);
            const end = model.getPositionAt(index + op.delete);
            model.applyEdits([{ range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), text: "" }]);
          }
        }
      });
    };
    text.observe(this.observer);

    // Local typing → Y.Text. Apply right-to-left so offsets stay valid.
    this.disposables.push(
      model.onDidChangeContent((event) => {
        if (this.applyingRemote) return;
        doc.transact(() => {
          [...event.changes]
            .sort((a, b) => b.rangeOffset - a.rangeOffset)
            .forEach((change) => {
              if (change.rangeLength) text.delete(change.rangeOffset, change.rangeLength);
              if (change.text) text.insert(change.rangeOffset, change.text);
            });
        }, this);
      }),
    );

    this.undoManager = new Y.UndoManager(text, { trackedOrigins: new Set([this]), captureTimeout: 400 });

    if (awareness) {
      const publish = () => {
        if (editor.getModel() !== model) return;
        const selection = editor.getSelection();
        if (!selection) return;
        const anchor = model.getOffsetAt(selection.getStartPosition());
        const head = model.getOffsetAt(selection.getEndPosition());
        const rtl = selection.getDirection() === monaco.SelectionDirection.RTL;
        awareness.setLocalStateField("selection", {
          anchor: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, rtl ? head : anchor)),
          head: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, rtl ? anchor : head)),
        });
      };
      this.disposables.push(editor.onDidChangeCursorSelection(publish));
      publish();
    }
  }

  private remote(apply: () => void) {
    this.applyingRemote = true;
    try {
      apply();
    } finally {
      this.applyingRemote = false;
    }
  }

  destroy() {
    this.text.unobserve(this.observer);
    this.disposables.forEach((d) => d.dispose());
    this.undoManager.destroy();
    this.awareness?.setLocalStateField("selection", null);
  }
}
