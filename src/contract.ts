/**
 * The command + event surface shared by every backend (browser offline,
 * Node server) and the client transport. Single source of truth for what
 * `invoke(cmd, args)` and `listen(event)` may carry.
 */
import type { KanbanCard } from "./types/kanban";

/** Pure data CRUD commands — implemented by every backend. */
export const DATA_COMMANDS = [
  "get_cards",
  "add_card",
  "update_card",
  "move_card",
  "reorder_card",
  "delete_card",
  "trash_card",
  "restore_card",
  "add_revision_note",
  "answer_feedback",
  "import_cards",
  "get_settings",
  "save_settings",
  "list_plugins",
  "list_schedules",
  "create_schedule",
  "update_schedule",
  "delete_schedule",
  "toggle_schedule_enabled",
  "purge_schedule_history",
  "clear_logs",
] as const;

/** Commands that require a host with a shell + filesystem (desktop/server). */
export const AGENT_COMMANDS = [
  "launch_agent",
  "cancel_agent",
  "get_run_log",
  "list_run_artifacts",
  "trigger_schedule_now",
  "plan_day",
] as const;

/** OS actions that live in the Tauri shell regardless of data backend. */
export const OS_COMMANDS = ["open_path", "open_card_working_dir"] as const;

/**
 * Control commands: stateful hints to a host that carry no capability and touch
 * no data. `set_log_watch` tells the host which cards have a live viewer so it
 * can throttle live log frames for headless/scheduled runs (adaptive cadence).
 */
export const CONTROL_COMMANDS = ["set_log_watch"] as const;

export type DataCommand = (typeof DATA_COMMANDS)[number];
export type AgentCommand = (typeof AGENT_COMMANDS)[number];
export type OsCommand = (typeof OS_COMMANDS)[number];
export type ControlCommand = (typeof CONTROL_COMMANDS)[number];
export type Command = DataCommand | AgentCommand | OsCommand | ControlCommand;

/** Push events emitted by a backend over the live channel. */
export const EVENTS = {
  agentLogAppended: "agent-log-appended",
  agentResultChanged: "agent-result-changed",
  schedulesUpdated: "schedules-updated",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export interface AgentLogPayload {
  cardId: string;
  runId: string;
  line: string;
}

export interface AgentResultPayload {
  card: KanbanCard;
}
