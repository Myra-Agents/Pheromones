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
import { humanizeAgentError } from "./agent";

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
    case "result": {
      const failed = ev.status === "failed";
      const raw = ev.summary ?? ev.question ?? ev.error ?? "";
      return {
        kind: "result",
        // On failure the raw text is a provider error (401/429/…) — rewrite it to
        // something a user can act on; success summaries pass through unchanged.
        summary: failed ? humanizeAgentError(raw) : raw,
        tokens: ev.tokens,
        cost: ev.cost,
        isError: failed,
      };
    }
    case "todos":
      return null; // rendered by a dedicated checklist widget, not the transcript
  }
}
