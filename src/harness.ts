// Wire contract between the embedded Myra harness (Antenna, deepagents) and the
// Rust worker, carried over a loopback WebSocket (worker route GET
// /agent-events). This REPLACES the stdout JSON-lines protocol of the POC.
//
// Direction:
//   harness → worker : HarnessEvent   (transcript stream + terminal result)
//   worker  → harness : HarnessControl (cancel / resume / approve)
//
// The worker persists every HarnessEvent to disk on receipt
// (agent-runs/{runId}.log, NDJSON) BEFORE re-emitting it on its /events bus —
// so history never depends on a connected front-end. The `seq` field on the
// envelope gives a total order per run, used to catch up a live run on
// front-end (re)connect (read log to seq=N, then apply buffered events seq>N).

/** Correlation + ordering envelope carried by every harness → worker event. */
export interface HarnessEnvelope {
  runId: string;
  cardId: string;
  /** Monotonic, per-run sequence number (0-based), assigned by the harness. */
  seq: number;
}

/** A todo item in the harness planning tool (deepagents `write_todos`). */
export interface HarnessTodo {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

/** Terminal status the harness reports on its `result` event. Drives the card
 * transition the worker applies (mirrors AgentResultFile.status). */
export type HarnessResultStatus = "awaiting_review" | "waiting_feedback" | "failed";

/**
 * harness → worker. A structured transcript event. Tool names are already
 * renamed to Myra's icon keys by the harness adapter (read_file → Read,
 * execute → Bash, write_todos → TodoWrite, …) so the app renderer needs no
 * per-agent knowledge.
 */
export type HarnessEvent = HarnessEnvelope &
  (
    | { type: "text"; text: string }
    | { type: "thinking"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "tool_result"; toolUseId: string; content: string; isError: boolean }
    | { type: "todos"; todos: HarnessTodo[] }
    | {
        type: "result";
        status: HarnessResultStatus;
        summary?: string;
        question?: string;
        error?: string;
        tokens?: number;
        cost?: number;
      }
  );

/** Narrow a HarnessEvent to a specific `type` discriminant. */
export type HarnessEventOf<T extends HarnessEvent["type"]> = Extract<HarnessEvent, { type: T }>;

/**
 * worker → harness. Control frames over the same socket. `cancel` is wired in
 * the MVP; `resume` / `approve` land with the async-feedback and safety-gate
 * work (a run parked in `waiting_feedback` resumes on `resume`; a tool held by
 * the safety evaluator is released by `approve`).
 */
export type HarnessControl =
  | { type: "cancel" }
  | { type: "resume"; input: string }
  | { type: "approve"; toolUseId: string; approved: boolean };
