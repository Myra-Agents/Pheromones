/**
 * Agent & settings types for the multi-backend agent system.
 */

export interface AgentPreset {
  id: string;
  name: string;
  binary: string;
  argsTemplate: string;
  workingDir?: string;
  /**
   * Extra CLI flags appended after the rendered argsTemplate. Boolean flags
   * are stored as-is (`"--share"`), value-taking flags as `"--model=provider/model"`.
   */
  flags?: string[];
  /** Run the agent inside a fresh git worktree of the working directory. */
  useWorktree?: boolean;
  /**
   * How the harness binary is launched.
   * - `"direct"` (default): run `binary argsTemplate` straight, the harness uses
   *   its own cloud provider config.
   * - `"ollama"`: route through `ollama launch <binary> --yes --model <ollamaModel>
   *   -- argsTemplate`, so a **local** Ollama model serves the run. Ollama injects
   *   the per-harness wiring (env for opencode/claude, profile for codex); the
   *   server scopes that config to the run via a throwaway config home so it never
   *   leaks into later (e.g. cloud) tasks. See {@link OLLAMA_LAUNCH_HARNESSES}.
   */
  launchVia?: "direct" | "ollama";
  /**
   * Local Ollama model tag to serve the run with when `launchVia === "ollama"`
   * (e.g. `"qwen3-coder"`). Ignored for `"direct"`. Stored here rather than as a
   * `--model` flag because it is `ollama launch`'s argument, not the harness's.
   */
  ollamaModel?: string;
}

/**
 * Harness subcommands `ollama launch` knows how to wire to a local model. The
 * `AgentPreset.binary` must be one of these for `launchVia: "ollama"` to work.
 * Mirrors Ollama's `cmd/launch/*` integrations (docs.ollama.com/integrations).
 */
export const OLLAMA_LAUNCH_HARNESSES = ["opencode", "claude", "codex"] as const;
export type OllamaLaunchHarness = (typeof OLLAMA_LAUNCH_HARNESSES)[number];

/** Minimum Ollama version that ships `ollama launch` (local-model harness wiring). */
export const OLLAMA_MIN_VERSION = "0.15.0";

/** One selectable CLI flag for an agent binary (drives the options UI). */
export interface AgentFlagDef {
  /** The flag itself, e.g. `"--share"`. */
  flag: string;
  /** Short English hint shown next to the flag. */
  hint: string;
  /** Flag expects a value (`--flag=value`). */
  takesValue?: boolean;
  /** Placeholder for the value input. */
  valuePlaceholder?: string;
  /**
   * Render the value as a dropdown limited to these choices instead of a free
   * input. For provider-dependent choices, resolve at render time (see
   * {@link opencodeVariantsForModel}).
   */
  options?: string[];
  /**
   * Populate the dropdown choices from a server rpc (e.g. `"list_models"` runs
   * `opencode models` on the connected machine). Falls back to a free input
   * when the rpc is unavailable or fails.
   */
  optionsRpc?: "list_models";
  /** Surfaced as a dedicated checkbox or dropdown (others live in the multiselect). */
  featured?: boolean;
  /** Visually flagged as dangerous (e.g. permission bypass). */
  danger?: boolean;
}

/**
 * Known CLI flags per agent binary, used to render the options checkboxes and
 * the "all options" multiselect. Keyed by `AgentPreset.binary`.
 */
export const AGENT_FLAG_CATALOG: Record<string, AgentFlagDef[]> = {
  opencode: [
    {
      flag: "--dangerously-skip-permissions",
      hint: "Auto-approve all permissions",
      featured: true,
      danger: true,
    },
    { flag: "--share", hint: "Share the session" },
    { flag: "--thinking", hint: "Show thinking blocks" },
    { flag: "--continue", hint: "Continue the last session" },
    { flag: "--fork", hint: "Fork the session when continuing" },
    {
      flag: "--model",
      hint: "Model to use",
      takesValue: true,
      valuePlaceholder: "provider/model",
      optionsRpc: "list_models",
      featured: true,
    },
    {
      flag: "--variant",
      hint: "Model variant (reasoning effort)",
      takesValue: true,
      valuePlaceholder: "high",
      featured: true,
    },
    { flag: "--agent", hint: "Agent to use", takesValue: true, valuePlaceholder: "build" },
    { flag: "--session", hint: "Session id to continue", takesValue: true, valuePlaceholder: "ses_…" },
    { flag: "--title", hint: "Title for the session", takesValue: true },
    { flag: "--format", hint: "Output format", takesValue: true, valuePlaceholder: "default | json" },
    { flag: "--file", hint: "File to attach to the message", takesValue: true, valuePlaceholder: "./path" },
    { flag: "--attach", hint: "Attach to a running server", takesValue: true, valuePlaceholder: "http://…" },
    { flag: "--port", hint: "Local server port", takesValue: true, valuePlaceholder: "4096" },
    { flag: "--log-level", hint: "Log level", takesValue: true, valuePlaceholder: "INFO" },
    { flag: "--print-logs", hint: "Print logs to stderr" },
    { flag: "--pure", hint: "Run without external plugins" },
  ],
};

/**
 * OpenCode reasoning-effort variants per provider. The CLI has no command to
 * enumerate them, so this mirrors the documented defaults — variants are fixed
 * per provider, not per model (opencode.ai/docs/models).
 */
export const OPENCODE_VARIANTS_BY_PROVIDER: Record<string, string[]> = {
  anthropic: ["high", "max"],
  openai: ["none", "minimal", "low", "medium", "high", "xhigh"],
  google: ["low", "high"],
};

/** All variants ordered by increasing reasoning effort, for dropdown display. */
const OPENCODE_VARIANT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

/** Sort variant names by increasing reasoning effort; unknown names sink last (stable). */
export function sortOpencodeVariants(variants: string[]): string[] {
  const rank = (variant: string) => {
    const index = OPENCODE_VARIANT_ORDER.indexOf(variant);
    return index === -1 ? OPENCODE_VARIANT_ORDER.length : index;
  };
  return [...variants].sort((a, b) => rank(a) - rank(b));
}

/**
 * Effort choices for an opencode `provider/model` id, ordered by increasing
 * effort. Unknown or empty model → the union of all known variants (the
 * provider can't be inferred yet).
 *
 * Static fallback only — variants really are per-model, so prefer the
 * `list_models` rpc's {@link AgentModelsResult.variants} when available.
 */
export function opencodeVariantsForModel(model: string): string[] {
  const provider = model.split("/")[0]?.trim().toLowerCase() ?? "";
  const known = OPENCODE_VARIANTS_BY_PROVIDER[provider];
  return sortOpencodeVariants(known ?? [...new Set(Object.values(OPENCODE_VARIANTS_BY_PROVIDER).flat())]);
}

/** Result of the `list_flags` rpc — run flags parsed live from the CLI's help. */
export interface AgentFlagsResult {
  flags: AgentFlagDef[];
}

/**
 * Merge the live flag list from `list_flags` with the static catalog. The
 * static entries win for flags both know about (they carry curated hints,
 * `featured`, `danger`, `optionsRpc`, placeholders); live-only flags are
 * appended as-is so new CLI versions surface immediately. Static-only flags
 * are kept too — dropping them would orphan saved presets if a parse hiccups.
 */
export function mergeFlagCatalog(catalog: AgentFlagDef[], live: AgentFlagDef[]): AgentFlagDef[] {
  const known = new Set(catalog.map((def) => def.flag));
  return [...catalog, ...live.filter((def) => !known.has(def.flag))];
}

/** Result of the `list_models` rpc — model ids the agent CLI reports. */
export interface AgentModelsResult {
  models: string[];
  /**
   * Reasoning-effort variants per model id (e.g. `"openai/gpt-5" → ["low","high"]`),
   * parsed from `opencode models --verbose`. A model absent from the map (or
   * mapped to `[]`) supports no variants. Omitted by older servers — fall back
   * to {@link opencodeVariantsForModel}.
   */
  variants?: Record<string, string[]>;
  /**
   * $ per million tokens per model id (models.dev data via
   * `opencode models --verbose`). Absent for models without pricing data;
   * `input === 0 && output === 0` means the model is free. Omitted by older
   * servers.
   */
  cost?: Record<string, AgentModelCost>;
}

/** $/M-token pricing for one model. */
export interface AgentModelCost {
  input: number;
  output: number;
}

/** One way of installing an agent binary, shown in the manual-install dialog. */
export interface AgentInstallMethod {
  id: string;
  label: string;
  command: string;
}

export interface AgentInstallInfo {
  docsUrl: string;
  /** Shell one-liner the server runs for one-click install (unix only). */
  installScript: string;
  methods: AgentInstallMethod[];
}

/** Install instructions per agent binary. Keyed by `AgentPreset.binary`. */
export const AGENT_INSTALL_INFO: Record<string, AgentInstallInfo> = {
  opencode: {
    docsUrl: "https://opencode.ai/docs",
    installScript: "curl -fsSL https://opencode.ai/install | bash",
    methods: [
      { id: "curl", label: "Install script", command: "curl -fsSL https://opencode.ai/install | bash" },
      { id: "brew", label: "Homebrew", command: "brew install anomalyco/tap/opencode" },
      { id: "npm", label: "npm", command: "npm install -g opencode-ai" },
      { id: "bun", label: "Bun", command: "bun install -g opencode-ai" },
    ],
  },
  claude: {
    docsUrl: "https://code.claude.com/docs/en/quickstart",
    installScript: "curl -fsSL https://claude.ai/install.sh | bash",
    methods: [
      { id: "curl", label: "Install script", command: "curl -fsSL https://claude.ai/install.sh | bash" },
      { id: "npm", label: "npm", command: "npm install -g @anthropic-ai/claude-code" },
    ],
  },
  codex: {
    docsUrl: "https://developers.openai.com/codex/cli",
    installScript: "npm install -g @openai/codex",
    methods: [
      { id: "npm", label: "npm", command: "npm install -g @openai/codex" },
      { id: "brew", label: "Homebrew", command: "brew install codex" },
    ],
  },
};

/**
 * Install instructions for the Ollama runtime itself (not a harness — the local
 * model server). The server's `install_ollama` rpc runs the platform default;
 * these power the manual-fallback dialog.
 */
export const OLLAMA_INSTALL_INFO: AgentInstallInfo = {
  docsUrl: "https://ollama.com/download",
  installScript: "curl -fsSL https://ollama.com/install.sh | sh",
  methods: [
    { id: "brew", label: "Homebrew (macOS)", command: "brew install ollama" },
    { id: "curl", label: "Install script (Linux)", command: "curl -fsSL https://ollama.com/install.sh | sh" },
    { id: "winget", label: "winget (Windows)", command: "winget install Ollama.Ollama" },
  ],
};

/** Result of the `check_binary` rpc. */
export interface BinaryStatus {
  found: boolean;
  path?: string;
  version?: string;
}

// ───────────────────────── Ollama (local models) ────────────────────────

/** One model pulled into the local Ollama store (`ollama_status.models`). */
export interface OllamaModel {
  /** Tag, e.g. `"qwen3-coder:latest"`. */
  name: string;
  /** On-disk size in bytes. */
  size?: number;
  /** Parameter size label from the model card, e.g. `"7B"`. */
  parameterSize?: string;
}

/** Result of the `ollama_status` rpc — install + daemon + installed-model state. */
export interface OllamaStatus {
  /** The `ollama` binary is on PATH / in a known install dir. */
  installed: boolean;
  /** Reported `ollama --version` (null when missing/unreadable). */
  version: string | null;
  /** Version is ≥ {@link OLLAMA_MIN_VERSION} (so `ollama launch` exists). */
  launchCapable: boolean;
  /** The daemon answers on the local API right now. */
  running: boolean;
  /** Models already pulled locally. Empty when the daemon is down. */
  models: OllamaModel[];
}

/**
 * Streamed progress for a `pull_model` run, emitted on the `ollama-pull-progress`
 * bus event (one per layer/status line of Ollama's `/api/pull`). `total`/
 * `completed` are bytes for the current layer; absent for status-only lines.
 */
export interface OllamaPullProgress {
  /** Model tag being pulled, echoes the request. */
  model: string;
  /** Ollama's status string, e.g. `"pulling manifest"`, `"downloading"`, `"success"`. */
  status: string;
  total?: number;
  completed?: number;
  /** True on the terminal line (`status === "success"` or an error). */
  done?: boolean;
  /** Set when the pull failed. */
  error?: string;
}

/** One curated entry in the local-model catalogue shown in the picker/settings. */
export interface OllamaCatalogModel {
  /** Pull tag, e.g. `"qwen2.5-coder:7b"`. */
  tag: string;
  /** Human label, e.g. `"Qwen2.5 Coder 7B"`. */
  label: string;
  /** Rough download size, e.g. `"4.7 GB"`. */
  size: string;
  /** Recommended minimum system RAM, e.g. `"8 GB"`. */
  minRam: string;
  /** One-line "good for…" hint. */
  blurb: string;
}

/**
 * Curated coder-friendly models for the "pull a local model" UI. Not exhaustive —
 * the UI also accepts a free-form tag for anything on ollama.com/library. Sizes
 * are approximate (default quantization) and only steer the user; the real pull
 * size comes from the daemon.
 */
export const OLLAMA_MODEL_CATALOG: OllamaCatalogModel[] = [
  {
    tag: "qwen3-coder",
    label: "Qwen3 Coder",
    size: "4.7 GB",
    minRam: "8 GB",
    blurb: "Strong general coding default",
  },
  {
    tag: "qwen2.5-coder:7b",
    label: "Qwen2.5 Coder 7B",
    size: "4.7 GB",
    minRam: "8 GB",
    blurb: "Fast, fits modest machines",
  },
  {
    tag: "qwen2.5-coder:32b",
    label: "Qwen2.5 Coder 32B",
    size: "19 GB",
    minRam: "24 GB",
    blurb: "Best quality, needs a big GPU",
  },
  {
    tag: "gpt-oss:20b",
    label: "gpt-oss 20B",
    size: "13 GB",
    minRam: "16 GB",
    blurb: "Open-weight, solid reasoning",
  },
  {
    tag: "llama3.1:8b",
    label: "Llama 3.1 8B",
    size: "4.9 GB",
    minRam: "8 GB",
    blurb: "Versatile all-rounder",
  },
  {
    tag: "devstral:24b",
    label: "Devstral 24B",
    size: "14 GB",
    minRam: "20 GB",
    blurb: "Agentic-coding tuned",
  },
];

export interface AppSettings {
  defaultAgentId: string;
  agents: AgentPreset[];
  /** Maximum agents allowed to run concurrently. 0 = unlimited. */
  maxConcurrentAgents: number;
  /**
   * Hold an OS power assertion while at least one agent is running so the
   * machine doesn't idle-sleep mid-run (which can sever a local-model session).
   * macOS `caffeinate`, Linux `systemd-inhibit`, Windows `SetThreadExecutionState`.
   * Acquired on the 0→1 running transition, released on 1→0. Best-effort —
   * a failed assertion never blocks a run. Omitted = treated as `true`.
   */
  keepAwakeWhileRunning?: boolean;
  /**
   * When an agent run terminates abnormally (non-zero/killed exit, no result
   * written) and the user did not cancel it — e.g. the machine slept and cut
   * the session — relaunch it with the harness's continue flag to resume the
   * conversation, up to {@link autoResumeMaxRetries} times. Omitted = `true`.
   */
  autoResumeInterrupted?: boolean;
  /**
   * Max automatic resume attempts per run before giving up (guards against an
   * agent that crashes for a real reason looping forever). Omitted = `2`.
   */
  autoResumeMaxRetries?: number;
  defaultHomePage: "kanban" | "schedules" | "planner" | "logs";
  locale: "auto" | "en" | "fr";
  theme: "light" | "dark" | "system";
  /**
   * Folder names of installed plugins the user has switched off. A disabled
   * plugin contributes no agent presets (and, once the server dispatches bus
   * events to plugins, receives none). Omitted/empty = all enabled.
   */
  disabledPlugins?: string[];
  /**
   * Non-secret plugin config values, keyed `pluginFolder → { CONFIG_KEY → value }`.
   * Secret-typed fields are NOT here — they live in the OS keychain. Omitted = none.
   *
   * Legacy single-config-per-plugin model. Superseded by {@link pluginInstances}
   * for webhook plugins, but kept for back-compat + agent-only plugins. On first
   * load the server synthesizes one {@link PluginInstance} per configured folder.
   */
  pluginConfig?: Record<string, Record<string, string | number | boolean>>;
  /**
   * Named integration instances, keyed by stable `instanceId`. Each is one
   * configured deployment of a source plugin (e.g. two Slack instances pointing
   * at different channels), with its own config, secrets (keychain, keyed by
   * instance id), and trigger overrides. An instance "is on this machine" iff
   * it appears in this map. Omitted = none.
   */
  pluginInstances?: Record<string, PluginInstance>;
}

/**
 * One configured deployment of a source plugin. Multiple instances of the same
 * plugin can run at once (Slack→#eng and Slack→#sales), each with its own config,
 * secrets, and trigger overrides. Created/edited from the app's connect wizard.
 */
export interface PluginInstance {
  /** Stable uuid generated on create — globally unique across machines. */
  id: string;
  /** Source plugin folder name (e.g. `"slack"`). Indexes the `list_plugins` catalog. */
  plugin: string;
  /** User-facing name (e.g. `"#eng-alerts"`). */
  label: string;
  enabled: boolean;
  /** Non-secret config values. Secret-typed fields live in the keychain (`inst:{id}:{key}`). */
  config: Record<string, string | number | boolean>;
  /** Per-instance override of the plugin's outbound webhook `events`; falls back to the manifest. */
  events?: string[];
  /** Per-instance override of the plugin's outbound webhook `template`; falls back to the manifest. */
  template?: string;
}

/** A user-supplied plugin setting, rendered as a form field in Settings → Plugins. */
export interface PluginConfigField {
  /** `^[A-Z][A-Z0-9_]*$`. Referenced by webhooks and injected as an env var into exec. */
  key: string;
  label: string;
  type: "string" | "secret" | "boolean" | "number" | "select" | "multiselect";
  /** Choices for select/multiselect. */
  options?: string[];
  required?: boolean;
  default?: string | number | boolean;
  description?: string;
  placeholder?: string;
}

/** Named signature scheme verified by the core for an inbound webhook. */
export interface WebhookVerify {
  scheme: "hmac-sha256" | "slack" | "stripe";
  /** Header carrying the signature (e.g. X-Hub-Signature-256). */
  header?: string;
  /** Config key whose value is the shared signing secret. */
  secretFrom?: string;
}

/**
 * A webhook the server core runs for a plugin. `out` POSTs on bus events;
 * `in` exposes a signed HTTP route at `/hooks/<plugin>/<route>`.
 */
export interface WebhookSpec {
  id: string;
  direction: "out" | "in";
  // outbound
  urlFrom?: string;
  events?: string[];
  template?: string;
  // inbound
  route?: string;
  verify?: WebhookVerify;
  action?: string;
  map?: Record<string, string>;
  /** Optional escape hatch: core invokes it request/response for verify/transform. */
  exec?: string;
}

/**
 * An installed plugin as surfaced by the `list_plugins` rpc. `name` is the
 * install identity — the plugin's folder name under `~/.myra-agents/plugins/`,
 * which is what {@link AppSettings.disabledPlugins} keys on.
 */
export interface PluginInfo {
  name: string;
  manifestName?: string;
  version?: string;
  /** `"agent"`, `"event"`, and/or `"webhook"` (declares webhooks). */
  roles: ("agent" | "event" | "webhook")[];
  subscribes: string[];
  providesAgents: AgentPreset[];
  /** Settings the user fills in, rendered as a form. */
  config: PluginConfigField[];
  /** Webhooks the core runs for this plugin. */
  webhooks: WebhookSpec[];
  enabled: boolean;
}

export const DEFAULT_AGENT_PRESETS: AgentPreset[] = [
  {
    id: "opencode",
    name: "OpenCode",
    binary: "opencode",
    argsTemplate: "run {prompt}",
    flags: ["--dangerously-skip-permissions"],
  },
  {
    id: "claude",
    name: "Claude Code",
    binary: "claude",
    argsTemplate: "-p {prompt}",
    flags: ["--dangerously-skip-permissions"],
  },
  {
    id: "codex",
    name: "Codex",
    binary: "codex",
    argsTemplate: "exec {prompt}",
    flags: ["--full-auto"],
  },
  // {
  //   id: "copilot",
  //   name: "GitHub Copilot CLI",
  //   binary: "copilot",
  //   argsTemplate: "-p {prompt} --yolo",
  // },
];

export const DEFAULT_SETTINGS: AppSettings = {
  defaultAgentId: "opencode",
  agents: DEFAULT_AGENT_PRESETS,
  maxConcurrentAgents: 2,
  keepAwakeWhileRunning: true,
  autoResumeInterrupted: true,
  autoResumeMaxRetries: 2,
  defaultHomePage: "kanban",
  locale: "auto",
  theme: "system",
  disabledPlugins: [],
  pluginConfig: {},
};
