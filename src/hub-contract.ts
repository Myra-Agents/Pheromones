/**
 * The hub wire contract — the single source of truth for frames exchanged
 * across the centralized relay (see `docs/centralized-hub-plan.md`).
 *
 * Two channels meet at the hub:
 *  - Instance ↔ hub: a persistent reverse tunnel carrying {@link HubFrame}s.
 *  - Dashboard ↔ hub: REST RPC + a multiplexed event stream of
 *    {@link DashboardEventFrame}s (each tagged with the originating instance).
 *
 * The relay is a "dumb hub": it authenticates, tracks presence, and forwards
 * frames. It never interprets `cmd`/`args`/`payload` — those round-trip the
 * existing command contract untouched.
 */

import { AGENT_COMMANDS, OS_COMMANDS } from "./contract";

/** What an instance can do; gates which commands the hub will route to it. */
export type Capability = "agent" | "os";

/**
 * The capability a command requires, or `null` for pure data CRUD (always
 * allowed — every backend implements it). Imported here, not in `contract.ts`,
 * to keep the capability ↔ command mapping next to the {@link Capability} type
 * the hub gates on. The instance enforces this against its own granted
 * capabilities before dispatch (see `connector/index.ts`); an out-of-scope
 * command is rejected without ever touching the runner.
 */
export function requiredCapability(cmd: string): Capability | null {
  if ((OS_COMMANDS as readonly string[]).includes(cmd)) return "os";
  if ((AGENT_COMMANDS as readonly string[]).includes(cmd)) return "agent";
  return null;
}

/** A connected instance as advertised to the dashboard. */
export interface InstanceInfo {
  instanceId: string;
  label: string;
  capabilities: Capability[];
  status: "online";
}

// --- Instance ↔ hub reverse-tunnel frames -----------------------------------

/** First frame after the socket opens — registers the instance. */
export interface HelloFrame {
  type: "hello";
  instanceId: string;
  label: string;
  capabilities: Capability[];
}

/** A command forwarded down from a dashboard, awaiting an {@link RpcResultFrame}. */
export interface RpcFrame {
  type: "rpc";
  id: string;
  cmd: string;
  args?: Record<string, unknown>;
}

/** The instance's reply to an {@link RpcFrame}, correlated by `id`. */
export interface RpcResultFrame {
  type: "rpc-result";
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

/** Unsolicited push from the instance (log line, result, schedule change). */
export interface EventFrame {
  type: "event";
  event: string;
  payload: unknown;
}

export interface PingFrame {
  type: "ping";
}
export interface PongFrame {
  type: "pong";
}

/** The full set of frames carried on the instance ↔ hub tunnel. */
export type HubFrame = HelloFrame | RpcFrame | RpcResultFrame | EventFrame | PingFrame | PongFrame;

// --- Dashboard ↔ hub --------------------------------------------------------

/** An event fanned out to dashboards, tagged with its source instance. */
export interface DashboardEventFrame {
  instanceId: string;
  event: string;
  payload: unknown;
}

/** Reserved dashboard event: an instance came online / went offline (drives client topology refresh). */
export const PRESENCE_EVENT = "__presence";
export interface PresencePayload {
  online: boolean;
}

/** The envelope returned by an RPC — identical to a direct server's `/rpc/:cmd`. */
export type RpcResult = { ok: true; data: unknown } | { ok: false; error: string };

/** Canonical hub route shapes, shared by host + client transport. */
export const HUB_ROUTES = {
  agentConnect: "/agent/connect",
  /** Unauthenticated liveness probe — used by the dashboard to show hub availability. */
  health: "/healthz",
  instances: "/api/instances",
  pair: "/api/instances/pair",
  revoke: (instanceId: string) => `/api/instances/${instanceId}/revoke`,
  events: "/api/events",
  rpc: (instanceId: string, cmd: string) => `/api/i/${instanceId}/rpc/${cmd}`,
} as const;

/** A freshly minted one-time pairing code (the dashboard shows it; a machine enrolls with it). */
export interface PairingCode {
  code: string;
  expiresAt: number;
}

// --- Authentication ---------------------------------------------------------

/** Product tier. `free` = desktop-only/local; `pro` = remote/hub access. */
export type Tier = "free" | "pro";
/** Org role. Surfaced now; admin-sees-all-org enforcement is a follow-up. */
export type Role = "admin" | "member";

/**
 * The account record the hub keeps per user (keyed by `userId`). `tier` is set
 * manually for now (no billing); `role`/`orgId` come from the IdP's org claims.
 */
export interface AccountInfo {
  userId: string;
  email?: string;
  tier: Tier;
  role: Role;
  orgId?: string;
}

/**
 * Claims embedded in a hub **session** JWT (HS256, short-lived). Mirrors
 * {@link AccountInfo} minus `email`, so the client can read tier/role/orgId
 * without an extra round-trip. `sub` is the `userId`.
 */
export interface SessionClaims {
  sub: string;
  typ: "session";
  tier: Tier;
  role: Role;
  orgId?: string;
  exp: number;
}

/** Result of a login exchange / refresh: a short session + a long refresh token. */
export interface AuthTokens {
  session: string;
  refresh: string;
}

/**
 * Hub auth routes. Identity is proven by a managed IdP (Clerk) at
 * `exchange`/`desktopHandoff`; the hub then owns the session lifecycle
 * (`refresh`/`logout`) and the desktop handoff (`desktopClaim`).
 */
export const AUTH_ROUTES = {
  exchange: "/auth/exchange",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
  desktopHandoff: "/auth/desktop-handoff",
  desktopClaim: "/auth/desktop-claim",
  me: "/auth/me",
} as const;

// ── E2E-encrypted sync (Phase 2) ──────────────────────────────────────
//
// The desktop app is the crypto boundary; the hub is a **dumb relay** that only
// ever sees ciphertext + public keys. These shapes are the wire contract for the
// per-user sync endpoints — never plaintext, never the vault key.

/** A device enrolled in sync. Only public material — safe for the hub to store. */
export interface SyncDevice {
  deviceId: string;
  /** base64 X25519 public key. */
  pubkey: string;
  label: string;
  addedAt: number;
}

/**
 * `recipient → base64(sealed vault key)`. Recipient is a `deviceId` or the
 * literal `"recovery"` (a one-time recovery code's derived key). Ciphertext only.
 */
export type WrappedKeys = Record<string, string>;

/** One encrypted delta queued for a device. `ciphertext` is vault-encrypted. */
export interface SyncDelta {
  seq: number;
  /** base64 vault-encrypted payload (the instance set). */
  ciphertext: string;
  ts: number;
  /** Origin device id — receivers skip a delta they authored. */
  from: string;
}

/** `POST /api/sync/push` body: a delta to fan to every *other* device's queue. */
export interface SyncPushBody {
  from: string;
  ciphertext: string;
}

/** `GET /api/sync/pull` response: this device's queued deltas (oldest first). */
export interface SyncPullResult {
  deltas: SyncDelta[];
  /** True when the queue was coalesced to a single current-state snapshot. */
  coalesced?: boolean;
}

/** Per-user E2E sync routes (Worker → per-user Durable Object). */
export const SYNC_ROUTES = {
  /** GET list devices · POST register/update this device · (revoke is nested). */
  devices: "/api/sync/devices",
  /** GET the wrapped-keys map · PUT replace it (on setup + rotation). */
  wrapped: "/api/sync/wrapped",
  /** POST a delta → fans to every other device's ephemeral queue. */
  push: "/api/sync/push",
  /** GET drain this device's queue. */
  pull: "/api/sync/pull",
  /** POST ack seqs → hub purges them. */
  ack: "/api/sync/ack",
} as const;
