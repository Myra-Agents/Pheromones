export type KanbanStatus =
  | "draft"
  | "todo"
  | "in_progress"
  | "waiting_feedback"
  | "awaiting_review"
  | "done"
  | "trashed";

/** Single agent execution attempt */
export interface AgentRun {
  id: string;
  startedAt: string;
  endedAt?: string;
  prompt: string;
  result?: string;
  status:
    | "running"
    | "needs_feedback"
    | "awaiting_review"
    | "failed"
    | "completed";
  exitCode?: number;
  /** Tokens used, if the agent reported it via the result protocol. */
  tokens?: number;
  /** Cost in USD, if the agent reported it via the result protocol. */
  cost?: number;
}

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
  status: KanbanStatus;
  createdAt: string;
  updatedAt: string;
  agentPrompt?: string;
  linkedTaskId?: string;
  tags: string[];

  /** Ordering within the column. Lower = higher. */
  position?: number;

  /** Which agent preset to use (falls back to app default) */
  agentPresetId?: string;
  /** Per-card working directory for the agent run (overrides the preset's). */
  workingDir?: string;
  /** Per-card CLI flag overrides (replaces the preset's `flags` when set). */
  agentFlags?: string[];
  /** Per-card worktree override (falls back to the preset's `useWorktree`). */
  useWorktree?: boolean;
  /** Per-card launch-mode override (falls back to the preset's `launchVia`). */
  launchVia?: "direct" | "ollama";
  /** Per-card local Ollama model (used when `launchVia === "ollama"`). */
  ollamaModel?: string;

  // Agent runtime state
  agentRunId?: string;
  /** True while the card waits in the run queue (concurrency limit hit). */
  agentQueued?: boolean;
  agentResult?: string;
  agentQuestion?: string;
  agentRunStartedAt?: string;
  agentRunEndedAt?: string;
  revisionNotes?: string[];
  runHistory?: AgentRun[];

  // Trash (soft-delete) state
  deletedAt?: string;
  previousStatus?: KanbanStatus;
  /**
   * Set when the nightly auto-archive moved this Done card to Trash (at local
   * midnight) instead of a manual delete. Drives the archive icon and lets
   * History/UIs distinguish an archived card from a deleted one. Absent →
   * manually trashed or still live.
   */
  archivedAt?: string;
}

export interface CreateCardInput {
  title: string;
  description?: string;
  status: KanbanStatus;
  agentPrompt?: string;
  linkedTaskId?: string;
  tags: string[];
  agentPresetId?: string;
  workingDir?: string;
  agentFlags?: string[];
  useWorktree?: boolean;
  launchVia?: "direct" | "ollama";
  ollamaModel?: string;
}

export interface UpdateCardInput {
  id: string;
  title: string;
  description?: string;
  agentPrompt?: string;
  tags: string[];
  agentPresetId?: string;
  workingDir?: string;
  agentFlags?: string[];
  useWorktree?: boolean;
  launchVia?: "direct" | "ollama";
  ollamaModel?: string;
}

export interface CardFormData {
  title: string;
  description: string;
  agentPrompt: string;
  tags: string; // comma-separated
  agentPresetId?: string;
  workingDir?: string;
  agentFlags?: string[];
  useWorktree?: boolean;
  launchVia?: "direct" | "ollama";
  ollamaModel?: string;
}

/** Result of a launch_agent invocation. */
export interface LaunchResult {
  runId?: string;
  queued: boolean;
}

export interface CardTemplate {
  id: string;
  name: string;
  description: string;
  agentPrompt: string;
  tags: string[];
  agentPresetId?: string;
  createdAt: string;
}

/** Per-column visual config */
export interface ColumnConfig {
  label: string;
  accentBar: string; // Tailwind bg class for the dot/bar
}

export const COLUMN_CONFIG: Record<KanbanStatus, ColumnConfig> = {
  draft: { label: "Draft", accentBar: "bg-slate-400" },
  todo: { label: "To Do", accentBar: "bg-blue-500" },
  in_progress: { label: "In Progress", accentBar: "bg-orange-500" },
  waiting_feedback: { label: "Feedback", accentBar: "bg-purple-500" },
  awaiting_review: { label: "Review", accentBar: "bg-amber-500" },
  done: { label: "Done", accentBar: "bg-green-500" },
  trashed: { label: "Trash", accentBar: "bg-red-500" },
};

/** Statuses shown as actual board columns (top, in order) */
export const COLUMN_STATUSES: KanbanStatus[] = [
  "draft",
  "todo",
  "in_progress",
  "waiting_feedback",
  "awaiting_review",
  "done",
];

/** All statuses (including trashed, which lives in the bottom strip) */
export const STATUSES: KanbanStatus[] = [...COLUMN_STATUSES, "trashed"];

/** Statuses selectable when creating a new task via the modal */
export const CREATABLE_STATUSES: KanbanStatus[] = ["draft", "todo"];

/**
 * Lifecycle rules. Returns true if the transition is allowed via drag-and-drop.
 */
export function isTransitionAllowed(
  from: KanbanStatus,
  to: KanbanStatus,
): boolean {
  if (from === to) return false;
  if (to === "trashed") return true;
  if (from === "trashed") return true;

  switch (from) {
    case "draft":
      return to === "todo";
    case "todo":
      return to === "draft";
    case "in_progress":
      return to === "todo" || to === "draft";
    case "waiting_feedback":
      return to === "todo" || to === "draft";
    case "awaiting_review":
      return to === "done" || to === "todo";
    case "done":
      return to === "todo" || to === "awaiting_review" || to === "draft";
    default:
      return false;
  }
}
