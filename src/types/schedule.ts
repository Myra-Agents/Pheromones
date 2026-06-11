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

export interface ScheduledTask {
  id: string;
  name: string;
  cardTitle: string;
  cardDescription: string;
  agentPrompt: string;
  tags: string[];
  schedule: ScheduleKind;
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
  schedule: ScheduleKind;
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

export function describeSchedule(kind: ScheduleKind): string {
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
