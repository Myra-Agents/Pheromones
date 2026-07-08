# Changelog

All notable changes to `@myra/shared` (Pheromones) are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

## [0.6.0] — 2026-07-09

### Added

- **`KanbanCard.agentSessionId`** — the harness session id captured from a run (opencode's `--format json` stream) so a reply can resume that exact conversation via `opencode -s <id>` rather than the blind "continue the last session" flag. Mirrors the field on the server's `models.rs`.

### Changed

- Reverted the built-in **embedded-harness default agent preset** (introduced in 0.5.0) — the default agent is opencode again while the embedded harness is paused.

## [0.4.0] — 2026-07-02

### Added

- **`buildAgentCommand` options** — the TS builder now takes an `AgentCommandOptions` argument (`flags`, `launchVia`, `ollamaModel`), mirroring the Rust `build_agent_command`: it appends preset flags (skipping empties, value-less `--flag=`, and names already in the template) and, when `launchVia === "ollama"`, wraps the invocation in `ollama launch … --` (dropping cloud `--model`/`--variant`).
- **`clear_run_history` data command** — new `DATA_COMMANDS` entry + `clearRunHistory(store)` domain helper that empties every card's `runHistory` and returns the number of runs cleared.
- **`KanbanCard.archivedAt`** — timestamp set when the nightly auto-archive moves a Done card to Trash (vs a manual delete), so History/UIs can distinguish archived from deleted cards.
- **`AppSettings.timezone`** — IANA timezone for time-of-day automation (nightly Done → archive at local midnight); defaults to `"Europe/Paris"`.

### Changed

- **`OLLAMA_LAUNCH_HARNESSES`** narrowed to `["opencode"]` — only opencode currently ships an `ollama launch` integration.
- Scheduled cards are no longer auto-tagged with `⏱ scheduled` when materialized.

### Removed

- **`AgentPreset.workingDir`** — unused; working directory is carried on the card/schedule, not the preset.
- **`claude` / `codex` default presets and install info** — the built-in defaults are opencode-only for now (kept commented for reference).
