import type { Store } from "../store";
import type { CreateScheduleInput, ScheduledTask, ScheduleKind, UpdateScheduleInput } from "../types/schedule";
import { newId } from "./ids";

function parseTime(value: string): { hours: number; minutes: number } | null {
  const [hours, minutes] = value.split(":").map(Number);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return { hours, minutes };
}

function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function dateAtTime(base: Date, value: string): Date | null {
  const parsed = parseTime(value);
  if (!parsed) return null;
  const date = new Date(base);
  date.setHours(parsed.hours, parsed.minutes, 0, 0);
  return date;
}

function toIsoIfValid(date: Date): string | undefined {
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Computes the next fire time. NOTE: `cron` returns undefined here (parity
 * gap with the Rust backend); the Node scheduler (Phase 3) adds a real cron
 * evaluator. Behavior is otherwise identical to the original browser backend.
 */
export function computeNextRun(
  schedule: ScheduleKind | undefined,
  enabled: boolean,
  lastTriggeredAt?: string,
): string | undefined {
  if (!enabled || !schedule) return undefined;

  const now = new Date();
  switch (schedule.type) {
    case "once":
      return lastTriggeredAt ? undefined : toIsoIfValid(new Date(schedule.at));
    case "daily": {
      const next = dateAtTime(now, schedule.time);
      if (!next) return undefined;
      if (next <= now) next.setDate(next.getDate() + 1);
      return next.toISOString();
    }
    case "weekly": {
      for (let offset = 0; offset <= 7; offset += 1) {
        const candidate = dateAtTime(now, schedule.time);
        if (!candidate) return undefined;
        candidate.setDate(candidate.getDate() + offset);
        if (schedule.days.includes(isoWeekday(candidate)) && candidate > now) {
          return candidate.toISOString();
        }
      }
      return undefined;
    }
    case "interval": {
      const next = dateAtTime(now, schedule.start);
      if (!next || schedule.minutes <= 0) return undefined;
      while (next <= now) next.setMinutes(next.getMinutes() + schedule.minutes);
      return next.toISOString();
    }
    case "cron":
      return undefined;
  }
}

export async function listSchedules(store: Store): Promise<ScheduledTask[]> {
  return store.getSchedules();
}

export async function createSchedule(store: Store, input: CreateScheduleInput): Promise<ScheduledTask> {
  const createdAt = new Date().toISOString();
  const task: ScheduledTask = {
    id: newId().slice(0, 8),
    ...input,
    createdAt,
    nextRunAt: computeNextRun(input.schedule, input.enabled),
  };
  await store.saveSchedules([...(await store.getSchedules()), task]);
  return task;
}

export async function updateSchedule(store: Store, input: UpdateScheduleInput): Promise<ScheduledTask> {
  const schedules = await store.getSchedules();
  const idx = schedules.findIndex((schedule) => schedule.id === input.id);
  if (idx === -1) throw new Error(`update_schedule: schedule not found: ${input.id}`);

  const task: ScheduledTask = {
    ...schedules[idx],
    ...input,
    nextRunAt: computeNextRun(input.schedule, input.enabled, schedules[idx].lastTriggeredAt),
  };
  schedules[idx] = task;
  await store.saveSchedules(schedules);
  return task;
}

export async function deleteSchedule(store: Store, id: string): Promise<boolean> {
  const schedules = await store.getSchedules();
  const next = schedules.filter((schedule) => schedule.id !== id);
  await store.saveSchedules(next);
  return next.length < schedules.length;
}

export async function toggleScheduleEnabled(store: Store, id: string, enabled: boolean): Promise<ScheduledTask | null> {
  const schedules = await store.getSchedules();
  const idx = schedules.findIndex((schedule) => schedule.id === id);
  if (idx === -1) return null;

  const task: ScheduledTask = {
    ...schedules[idx],
    enabled,
    nextRunAt: computeNextRun(schedules[idx].schedule, enabled, schedules[idx].lastTriggeredAt),
  };
  schedules[idx] = task;
  await store.saveSchedules(schedules);
  return task;
}
