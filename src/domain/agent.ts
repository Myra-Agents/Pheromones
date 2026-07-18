/**
 * Pure agent-run domain logic shared by the Node server runner and (later) the
 * cloud sandbox executor. Ports the prompt construction, result-protocol
 * transitions, and schedule→card materialization that previously lived in the
 * Rust backend (`agent.rs::build_prompt`, `watcher.rs::handle_result_file`,
 * `schedule.rs::materialize_card_for_schedule`). No I/O here — callers own the
 * filesystem and the Store.
 */
import type { AgentRun, KanbanCard } from "../types/kanban";
import type { ScheduledTask } from "../types/schedule";
import { newId } from "./ids";

/**
 * Build the agent prompt: revision notes prepended (most recent first), the
 * original task, then the JSON result-protocol footer that tells the agent
 * where to write its result file. Mirrors `agent.rs::build_prompt`.
 */
export function buildPrompt(base: string, revisionNotes: string[], cardId: string, resultPath: string): string {
  const parts: string[] = [];

  if (revisionNotes.length > 0) {
    parts.push("## Revision instructions (most recent first)\n");
    const reversed = [...revisionNotes].reverse();
    reversed.forEach((note, i) => {
      parts.push(`${i + 1}. ${note}`);
    });
    parts.push("");
    parts.push("## Original task\n");
  }

  parts.push(base.trim());

  parts.push("");
  parts.push("---");
  parts.push(
    `## Myra Agents agent protocol
When you have completed the task, write a JSON file to:
  ${resultPath}

The file must contain one of these shapes:

  {"cardId": "${cardId}", "status": "awaiting_review", "result": "<summary>"}
  {"cardId": "${cardId}", "status": "waiting_feedback", "question": "<your question>"}
  {"cardId": "${cardId}", "status": "failed", "error": "<reason>"}

You may also include optional "tokens" (integer) and "cost" (USD number) fields
to report usage, e.g. {..., "tokens": 12345, "cost": 0.12}.

After writing the file, you may exit. Myra Agents is watching this path.`,
  );

  return parts.join("\n");
}

/**
 * Rewrite a raw agent/harness failure into a message a non-technical user can
 * act on. The embedded harness surfaces provider errors verbatim (LangChain
 * `MODEL_AUTHENTICATION`, raw HTTP 401/402/429, model 404) which mean nothing to
 * someone staring at a failed card. Map the common ones to plain, actionable
 * text; pass anything unrecognized through unchanged. The raw string is still in
 * `agent-runs/{runId}.log` for debugging. Kept in sync with the Rust twin
 * `runner.rs::humanize_agent_error`.
 */
export function humanizeAgentError(raw: string): string {
  const low = raw.toLowerCase();

  // Rate limit / free-tier saturation.
  if (
    low.includes("429") ||
    low.includes("rate limit") ||
    low.includes("rate-limit") ||
    low.includes("too many requests")
  ) {
    return "The AI model is busy right now (rate-limited — common on free tiers). Wait a moment and rerun, or pick another model / add your own API key in Settings → Agents.";
  }

  // Out of credit / quota.
  if (
    low.includes("402") ||
    low.includes("payment required") ||
    low.includes("insufficient") ||
    low.includes("quota") ||
    low.includes("out of credit") ||
    low.includes("credits")
  ) {
    return "Your AI provider account has run out of credit or quota. Top it up, or switch model / provider in Settings → Agents.";
  }

  // Invalid / missing credential.
  if (
    low.includes("user not found") ||
    low.includes("model_authentication") ||
    low.includes("no auth credentials") ||
    low.includes("invalid api key") ||
    low.includes("invalid_api_key") ||
    low.includes("unauthorized") ||
    low.includes("401")
  ) {
    return "Myra's AI credential is invalid or expired. Open Settings → Agents and re-enter a valid API key (or connect a hub).";
  }

  // Selected model unavailable.
  if (low.includes("model") && (low.includes("404") || low.includes("not found") || low.includes("does not exist"))) {
    return "The selected AI model isn't available. Choose a different model in Settings → Agents.";
  }

  return raw;
}

/** Shape of the JSON file an agent writes to `agent-results/{cardId}.json`. */
export interface AgentResultFile {
  cardId: string;
  status: string;
  result?: string;
  question?: string;
  error?: string;
  tokens?: number;
  cost?: number;
}

/**
 * Apply a parsed agent result to a card, returning the updated card. Mirrors
 * the transitions in `watcher.rs::handle_result_file`: updates the matching
 * run-history entry and moves the card to its new column. `now` is an ISO
 * timestamp. The input card is not mutated.
 */
export function applyResult(card: KanbanCard, parsed: AgentResultFile, now: string): KanbanCard {
  const runStatus: AgentRun["status"] =
    parsed.status === "awaiting_review"
      ? "awaiting_review"
      : parsed.status === "waiting_feedback"
        ? "needs_feedback"
        : parsed.status === "failed"
          ? "failed"
          : "completed";

  const runHistory = (card.runHistory ?? []).map((run) =>
    run.id === card.agentRunId
      ? {
          ...run,
          endedAt: now,
          result: parsed.result ?? parsed.question ?? run.result,
          tokens: parsed.tokens ?? run.tokens,
          cost: parsed.cost ?? run.cost,
          status: runStatus,
        }
      : run,
  );

  const next: KanbanCard = {
    ...card,
    runHistory,
    agentRunEndedAt: now,
    agentRunId: undefined,
    updatedAt: now,
  };

  switch (parsed.status) {
    case "awaiting_review":
      next.status = "awaiting_review";
      next.agentResult = parsed.result;
      next.agentQuestion = undefined;
      break;
    case "waiting_feedback":
      next.status = "waiting_feedback";
      next.agentQuestion = parsed.question;
      next.agentResult = parsed.result;
      break;
    case "failed": {
      // Park back in Todo with the error surfaced as the result.
      next.status = "todo";
      const rawError = parsed.error ?? parsed.result;
      next.agentResult = rawError ? humanizeAgentError(rawError) : rawError;
      next.agentQuestion = undefined;
      break;
    }
    default:
      next.status = "awaiting_review";
      next.agentResult = parsed.result;
      break;
  }

  return next;
}

/**
 * Build a fresh `KanbanCard` from a schedule. Status is `todo` so the launch
 * logic flips it to `in_progress`. `position` defaults to 0 — the caller
 * assigns an end-of-column position. Mirrors
 * `schedule.rs::materialize_card_for_schedule`.
 */
export function materializeCardForSchedule(task: ScheduledTask, now: string, position = 0): KanbanCard {
  const tags = [...task.tags];

  return {
    id: newId(),
    title: task.cardTitle,
    description: task.cardDescription,
    status: "todo",
    createdAt: now,
    updatedAt: now,
    agentPrompt: task.agentPrompt,
    // Inherit the schedule's agent run config so the launched card runs with the
    // chosen preset/flags/worktree/dir instead of the board default.
    agentPresetId: task.agentPresetId,
    agentFlags: task.agentFlags,
    useWorktree: task.useWorktree,
    workingDir: task.workingDir,
    launchVia: task.launchVia,
    ollamaModel: task.ollamaModel,
    linkedTaskId: task.id,
    tags,
    position,
    revisionNotes: [],
    runHistory: [],
  };
}
