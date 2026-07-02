import {
  addCard,
  addRevisionNote,
  answerFeedback,
  clearRunHistory,
  deleteCard,
  getCards,
  importCards,
  moveCard,
  purgeScheduleHistory,
  reorderCard,
  restoreCard,
  trashCard,
  updateCard,
} from "./domain/cards";
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  toggleScheduleEnabled,
  updateSchedule,
} from "./domain/schedules";
import { getSettings, saveSettings } from "./domain/settings";
import type { Store } from "./store";
import type { CreateCardInput, KanbanCard, KanbanStatus, UpdateCardInput } from "./types/kanban";
import type { CreateScheduleInput, UpdateScheduleInput } from "./types/schedule";
import type { AppSettings } from "./types/settings";

/**
 * Thrown when a command isn't a data command handled here (e.g. an agent/OS
 * command, or a typo). Callers map it to their own surface: the browser
 * transport rethrows it as the `[Dev Mode]` sentinel; the Node server returns
 * HTTP 400 (until the agent runner claims those commands in Phase 3c).
 */
export class UnknownCommandError extends Error {
  constructor(public readonly cmd: string) {
    super(`Unknown or unsupported command "${cmd}"`);
    this.name = "UnknownCommandError";
  }
}

type CommandArgs = Record<string, unknown> | undefined;
type RevisionInput = { id: string; note: string };
type FeedbackInput = { id: string; answer: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function commandError(cmd: string, message: string): Error {
  return new Error(`[dispatch] ${cmd}: ${message}`);
}

function requireObject<T extends object>(cmd: string, args: CommandArgs, key: string): T {
  const value = args?.[key];
  if (!isRecord(value)) throw commandError(cmd, `missing object argument "${key}"`);
  return value as T;
}

function requireString(cmd: string, args: CommandArgs, key: string): string {
  const value = args?.[key];
  if (typeof value !== "string") throw commandError(cmd, `missing string argument "${key}"`);
  return value;
}

function optionalString(args: CommandArgs, key: string): string | undefined {
  const value = args?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * Run a data command against a Store. The single code path shared by the
 * browser offline transport and the Node server's `/rpc/:cmd` route — same
 * domain logic, different storage backend (localStorage vs fs vs sqlite).
 *
 * Throws {@link UnknownCommandError} for anything that isn't a data command.
 */
export async function dispatchData<T>(store: Store, cmd: string, args?: Record<string, unknown>): Promise<T> {
  const result: unknown = await (async () => {
    switch (cmd) {
      case "get_cards":
        return getCards(store);
      case "add_card":
        return addCard(store, requireObject<CreateCardInput>("add_card", args, "input"));
      case "update_card":
        return updateCard(store, requireObject<UpdateCardInput>("update_card", args, "input"));
      case "move_card":
        return moveCard(
          store,
          requireString("move_card", args, "id"),
          requireString("move_card", args, "status") as KanbanStatus,
        );
      case "reorder_card": {
        const newPosition = args?.newPosition;
        if (typeof newPosition !== "number") {
          throw commandError("reorder_card", 'missing number argument "newPosition"');
        }
        return reorderCard(
          store,
          requireString("reorder_card", args, "id"),
          newPosition,
          optionalString(args, "status") as KanbanStatus | undefined,
        );
      }
      case "delete_card":
        return deleteCard(store, requireString("delete_card", args, "id"));
      case "trash_card":
        return trashCard(store, requireString("trash_card", args, "id"));
      case "restore_card":
        return restoreCard(
          store,
          requireString("restore_card", args, "id"),
          optionalString(args, "status") as KanbanStatus | undefined,
        );
      case "add_revision_note": {
        const input = requireObject<RevisionInput>("add_revision_note", args, "input");
        return addRevisionNote(store, input.id, input.note);
      }
      case "answer_feedback": {
        const input = requireObject<FeedbackInput>("answer_feedback", args, "input");
        return answerFeedback(store, input.id, input.answer);
      }
      case "import_cards": {
        const cards = args?.cards;
        if (!Array.isArray(cards)) throw commandError("import_cards", 'missing array argument "cards"');
        return importCards(store, cards as KanbanCard[]);
      }
      case "get_settings":
        return getSettings(store);
      case "save_settings":
        return saveSettings(store, requireObject<AppSettings>("save_settings", args, "settings"));
      case "list_schedules":
        return listSchedules(store);
      case "create_schedule":
        return createSchedule(store, requireObject<CreateScheduleInput>("create_schedule", args, "input"));
      case "update_schedule":
        return updateSchedule(store, requireObject<UpdateScheduleInput>("update_schedule", args, "input"));
      case "delete_schedule":
        return deleteSchedule(store, requireString("delete_schedule", args, "id"));
      case "toggle_schedule_enabled": {
        const enabled = args?.enabled;
        if (typeof enabled !== "boolean") {
          throw commandError("toggle_schedule_enabled", 'missing boolean argument "enabled"');
        }
        return toggleScheduleEnabled(store, requireString("toggle_schedule_enabled", args, "id"), enabled);
      }
      case "purge_schedule_history":
        return purgeScheduleHistory(store, requireString("purge_schedule_history", args, "id"));
      case "clear_run_history":
        return clearRunHistory(store);
      case "clear_logs":
        return true;
      default:
        throw new UnknownCommandError(cmd);
    }
  })();

  return result as T;
}
