/**
 * Pure server-version helpers — no I/O, no deps. Used by the dashboard to tell
 * whether a remote `myra-server` instance is behind the latest published release.
 *
 * Server builds report `CARGO_PKG_VERSION` ("0.4.0"); GitHub release tags are
 * `server-vX.Y.Z`. Normalize both to a bare `X.Y.Z` before comparing.
 */

/** `"server-v0.4.0"` → `"0.4.0"`; leaves already-bare versions untouched. */
export function stripServerTag(tag: string): string {
  return tag.trim().replace(/^server-/, "").replace(/^v/, "");
}

/**
 * Tolerant numeric parse of a version string. Drops any pre-release / build
 * suffix (`-rc.1`, `+sha`) and any non-numeric segment, returning the numeric
 * release components only. `"0.4.0-rc.1"` → `[0, 4, 0]`.
 */
export function parseVersion(v: string): number[] {
  const core = stripServerTag(v).split(/[-+]/, 1)[0] ?? "";
  return core
    .split(".")
    .map((p) => Number.parseInt(p, 10))
    .filter((n) => Number.isFinite(n));
}

/**
 * Compare two versions. Returns -1 if `a < b`, 1 if `a > b`, 0 if equal.
 * Missing trailing components count as 0 (`"0.4" === "0.4.0"`).
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** How a running server compares to the latest released version. */
export type ServerUpdateState = "current" | "outdated" | "ahead" | "unknown";

/**
 * Classify a server's `current` version against the `latest` released version.
 * Returns `"unknown"` when either side is missing or unparseable — the caller
 * should render no badge in that case rather than guessing.
 */
export function serverUpdateState(current?: string | null, latest?: string | null): ServerUpdateState {
  if (!current || !latest) return "unknown";
  if (parseVersion(current).length === 0 || parseVersion(latest).length === 0) return "unknown";
  const cmp = compareVersions(current, latest);
  if (cmp < 0) return "outdated";
  if (cmp > 0) return "ahead";
  return "current";
}
