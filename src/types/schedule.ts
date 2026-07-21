/**
 * Schedule types — mirror of Rust backend models.
 */

export type ScheduleKindType = "once" | "daily" | "weekly" | "interval" | "cron";

export type ScheduleKind =
  | { type: "once"; at: string }
  | { type: "daily"; time: string }
  | { type: "weekly"; days: number[]; time: string }
  | { type: "interval"; start: string; minutes: number }
  | { type: "cron"; expr: string };

/**
 * A connector-event trigger, alternative to the time-based {@link ScheduleKind}.
 * When set, the task ignores `schedule`/`nextRunAt` and instead fires when the
 * named connector (a plugin under `~/.myra-agents/plugins/<connector>/`) reports
 * an event whose fields match one of `rules`. First matching rule wins.
 */
export interface EventTrigger {
  connector: string;
  rules: ConnectorRule[];
  /**
   * Connector-specific trigger settings (e.g. the GitLab project + event kinds
   * to poll) — shape declared by the plugin's `catalog.trigger.config`. The
   * server's `connector_watch` rpc aggregates these across enabled patrols so
   * the connector knows what to poll.
   */
  config?: Record<string, unknown>;
}

/**
 * Same shape every connector's rule matching already uses (see
 * `plugins/connectors/_sdk/rules.mjs`) — from/subjectContains/bodyContains/regex
 * matched against the connector's normalized event fields.
 */
export interface ConnectorRule {
  name?: string;
  from?: string;
  subjectContains?: string;
  bodyContains?: string;
  regex?: string;
  regexField?: string;
  agentId?: string;
  prompt?: string;
  requireReview?: boolean;
}

/**
 * A post-run side effect dispatched to a connector once this task's card
 * finishes (status → done). `config` values may template the run output:
 * `{{result}}`, `{{title}}`, `{{status}}`, `{{card.*}}`.
 */
export interface Action {
  connector: string;
  type: string;
  config: Record<string, unknown>;
}

export interface ScheduledTask {
  id: string;
  name: string;
  cardTitle: string;
  cardDescription: string;
  agentPrompt: string;
  tags: string[];
  /**
   * Time-based trigger. Optional and **independent** of {@link eventTriggers}: a
   * patrol may run on a schedule, on connector events, or both. Absent = no
   * time-based trigger (`nextRunAt` stays unset).
   */
  schedule?: ScheduleKind;
  /**
   * Connector-event triggers. A patrol fires on **any** of these (e.g. a GitLab
   * merge request on project A *and* an issue on project B), independently of
   * {@link schedule} — both can be set at once.
   */
  eventTriggers?: EventTrigger[];
  /** Post-run side effects dispatched to connectors when this task's card finishes. */
  actions?: Action[];
  enabled: boolean;

  // Agent run config inherited by every card this schedule materializes. When
  // unset, the materialized card falls back to the board's default agent.
  /** Agent preset to launch the materialized card with. */
  agentPresetId?: string;
  /** Per-run CLI flag overrides (same encoding as {@link AgentPreset.flags}). */
  agentFlags?: string[];
  /** Run the agent inside a fresh git worktree of the working dir. */
  useWorktree?: boolean;
  /** Working directory the agent runs in (overrides the preset's). */
  workingDir?: string;
  /** Launch-mode override for the run (overrides the preset's `launchVia`). */
  launchVia?: "direct" | "ollama";
  /** Local Ollama model for the run (used when `launchVia === "ollama"`). */
  ollamaModel?: string;

  createdAt: string;
  lastTriggeredAt?: string;
  nextRunAt?: string;
}

export interface CreateScheduleInput {
  name: string;
  cardTitle: string;
  cardDescription: string;
  agentPrompt: string;
  tags: string[];
  /** Optional time-based trigger — independent of {@link CreateScheduleInput.eventTriggers}. */
  schedule?: ScheduleKind;
  eventTriggers?: EventTrigger[];
  actions?: Action[];
  enabled: boolean;
  agentPresetId?: string;
  agentFlags?: string[];
  useWorktree?: boolean;
  workingDir?: string;
  launchVia?: "direct" | "ollama";
  ollamaModel?: string;
}

export interface UpdateScheduleInput extends CreateScheduleInput {
  id: string;
}

// ─────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────

const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function describeSchedule(kind: ScheduleKind | undefined): string {
  if (!kind) return "";
  switch (kind.type) {
    case "once": {
      try {
        const d = new Date(kind.at);
        return `Once — ${d.toLocaleString(undefined, {
          dateStyle: "short",
          timeStyle: "short",
        })}`;
      } catch {
        return `Once — ${kind.at}`;
      }
    }
    case "daily":
      return `Daily at ${kind.time}`;
    case "weekly":
      return `${kind.days.map((d) => WEEKDAYS[d] ?? "?").join(" / ")} at ${kind.time}`;
    case "interval":
      return `Every ${kind.minutes} min from ${kind.start}`;
    case "cron":
      return `Cron: ${kind.expr}`;
  }
}

/** Returns true if `iso` falls on the same calendar day as `now` (local). */
export function isToday(iso: string | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Format an ISO datetime as a short HH:MM in local timezone. */
export function formatHm(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Default factory for the schedule editor form. */
export function defaultScheduleKind(type: ScheduleKindType): ScheduleKind {
  switch (type) {
    case "once": {
      const d = new Date(Date.now() + 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      return {
        type: "once",
        at: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
      };
    }
    case "daily":
      return { type: "daily", time: "09:00" };
    case "weekly":
      return { type: "weekly", days: [1, 2, 3, 4, 5], time: "09:00" };
    case "interval":
      return { type: "interval", start: "09:00", minutes: 60 };
    case "cron":
      return { type: "cron", expr: "0 9 * * 1-5" };
  }
}
