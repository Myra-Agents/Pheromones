// Pure mapping from a harness wire event to a rendered transcript entry.
//
// Used on BOTH sides of the persistence boundary:
//   - live: the app's use-agent-events appends `harnessEventToEntry(ev)` as each
//     `agent-transcript-event` frame arrives (O(1), no terminal parsing).
//   - replay: reconstructing a run from agent-runs/{runId}.log NDJSON on app
//     (re)launch maps each line the same way.
// Keeping it here (not in app) guarantees the two paths can never diverge.

import type { HarnessEvent } from "../harness";
import type { TranscriptEntry } from "../types/conversation";

/**
 * Map one HarnessEvent to a TranscriptEntry, or `null` when the event has no
 * transcript representation (e.g. `todos`, which renders in a dedicated widget).
 */
export function harnessEventToEntry(ev: HarnessEvent): TranscriptEntry | null {
  switch (ev.type) {
    case "text":
      return { kind: "text", text: ev.text };
    case "thinking":
      return { kind: "thinking", text: ev.text };
    case "tool_use":
      return { kind: "tool_use", id: ev.id, name: ev.name, input: ev.input };
    case "tool_result":
      return {
        kind: "tool_result",
        toolUseId: ev.toolUseId,
        content: ev.content,
        isError: ev.isError,
      };
    case "result":
      return {
        kind: "result",
        summary: ev.summary ?? ev.question ?? ev.error ?? "",
        tokens: ev.tokens,
        cost: ev.cost,
        isError: ev.status === "failed",
      };
    case "todos":
      return null; // rendered by a dedicated checklist widget, not the transcript
  }
}
