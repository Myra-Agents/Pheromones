import type { Store } from "../store";
import type { CreateCardInput, KanbanCard, KanbanStatus, UpdateCardInput } from "../types/kanban";
import { newId } from "./ids";

/** Highest position in a column + 1000, matching the Rust + browser backends. */
export function nextPositionFor(cards: KanbanCard[], status: KanbanStatus): number {
  return Math.max(0, ...cards.filter((card) => card.status === status).map((card) => card.position ?? 0)) + 1000;
}

export async function getCards(store: Store): Promise<KanbanCard[]> {
  return store.getCards();
}

export async function addCard(store: Store, input: CreateCardInput): Promise<KanbanCard> {
  const cards = await store.getCards();
  const now = new Date().toISOString();
  const card: KanbanCard = {
    id: newId(),
    title: input.title,
    description: input.description ?? "",
    status: input.status,
    createdAt: now,
    updatedAt: now,
    agentPrompt: input.agentPrompt,
    linkedTaskId: input.linkedTaskId,
    tags: input.tags,
    position: nextPositionFor(cards, input.status),
    agentPresetId: input.agentPresetId,
    workingDir: input.workingDir,
    revisionNotes: [],
    runHistory: [],
  };

  await store.saveCards([...cards, card]);
  return card;
}

export async function updateCard(store: Store, input: UpdateCardInput): Promise<KanbanCard | null> {
  const cards = await store.getCards();
  const idx = cards.findIndex((card) => card.id === input.id);
  if (idx === -1) return null;

  const updated: KanbanCard = {
    ...cards[idx],
    title: input.title,
    description: input.description ?? "",
    agentPrompt: input.agentPrompt,
    agentPresetId: input.agentPresetId,
    workingDir: input.workingDir,
    tags: input.tags,
    updatedAt: new Date().toISOString(),
  };
  cards[idx] = updated;
  await store.saveCards(cards);
  return updated;
}

export async function moveCard(store: Store, id: string, status: KanbanStatus): Promise<KanbanCard | null> {
  const cards = await store.getCards();
  const idx = cards.findIndex((card) => card.id === id);
  if (idx === -1) return null;

  const changedColumn = cards[idx].status !== status;
  const updated: KanbanCard = {
    ...cards[idx],
    status,
    position: changedColumn ? nextPositionFor(cards, status) : cards[idx].position,
    updatedAt: new Date().toISOString(),
  };
  cards[idx] = updated;
  await store.saveCards(cards);
  return updated;
}

export async function reorderCard(
  store: Store,
  id: string,
  newPosition: number,
  status?: KanbanStatus,
): Promise<KanbanCard | null> {
  const cards = await store.getCards();
  const idx = cards.findIndex((card) => card.id === id);
  if (idx === -1) return null;

  cards[idx] = {
    ...cards[idx],
    ...(status ? { status } : {}),
    position: newPosition,
    updatedAt: new Date().toISOString(),
  };
  await store.saveCards(cards);
  return cards[idx];
}

export async function deleteCard(store: Store, id: string): Promise<boolean> {
  const cards = await store.getCards();
  const next = cards.filter((card) => card.id !== id);
  await store.saveCards(next);
  return next.length < cards.length;
}

export async function trashCard(store: Store, id: string): Promise<KanbanCard | null> {
  const cards = await store.getCards();
  const idx = cards.findIndex((card) => card.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const card = cards[idx];
  const updated: KanbanCard = {
    ...card,
    previousStatus: card.status === "trashed" ? card.previousStatus : card.status,
    status: "trashed",
    deletedAt: now,
    updatedAt: now,
  };
  cards[idx] = updated;
  await store.saveCards(cards);
  return updated;
}

export async function restoreCard(store: Store, id: string, status?: KanbanStatus): Promise<KanbanCard | null> {
  const cards = await store.getCards();
  const idx = cards.findIndex((card) => card.id === id);
  if (idx === -1) return null;

  const resolved = status ?? cards[idx].previousStatus ?? "todo";
  const updated: KanbanCard = {
    ...cards[idx],
    status: resolved,
    position: nextPositionFor(cards, resolved),
    deletedAt: undefined,
    previousStatus: undefined,
    updatedAt: new Date().toISOString(),
  };
  cards[idx] = updated;
  await store.saveCards(cards);
  return updated;
}

export async function addRevisionNote(store: Store, id: string, note: string): Promise<KanbanCard | null> {
  const cards = await store.getCards();
  const idx = cards.findIndex((card) => card.id === id);
  if (idx === -1) return null;

  const updated: KanbanCard = {
    ...cards[idx],
    revisionNotes: [...(cards[idx].revisionNotes ?? []), note],
    updatedAt: new Date().toISOString(),
  };
  cards[idx] = updated;
  await store.saveCards(cards);
  return updated;
}

export async function answerFeedback(store: Store, id: string, answer: string): Promise<KanbanCard | null> {
  const cards = await store.getCards();
  const idx = cards.findIndex((card) => card.id === id);
  if (idx === -1) return null;

  const updated: KanbanCard = {
    ...cards[idx],
    agentQuestion: undefined,
    revisionNotes: [...(cards[idx].revisionNotes ?? []), `Answer to agent question: ${answer}`],
    updatedAt: new Date().toISOString(),
  };
  cards[idx] = updated;
  await store.saveCards(cards);
  return updated;
}

export async function importCards(store: Store, cards: KanbanCard[]): Promise<boolean> {
  await store.saveCards(cards);
  return true;
}

export async function clearRunHistory(store: Store): Promise<number> {
  const cards = await store.getCards();
  let count = 0;
  const next = cards.map((card) => {
    const n = card.runHistory?.length ?? 0;
    count += n;
    return n > 0 ? { ...card, runHistory: [] } : card;
  });
  await store.saveCards(next);
  return count;
}

export async function purgeScheduleHistory(store: Store, linkedTaskId: string): Promise<number> {
  const cards = await store.getCards();
  const next = cards.filter(
    (card) =>
      card.linkedTaskId !== linkedTaskId ||
      card.status === "in_progress" ||
      card.status === "waiting_feedback" ||
      card.status === "awaiting_review",
  );
  await store.saveCards(next);
  return cards.length - next.length;
}
