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
}

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
  /** Surfaced as a dedicated checkbox (others live in the multiselect). */
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
    { flag: "--share", hint: "Share the session", featured: true },
    { flag: "--thinking", hint: "Show thinking blocks", featured: true },
    { flag: "--continue", hint: "Continue the last session" },
    { flag: "--fork", hint: "Fork the session when continuing" },
    { flag: "--model", hint: "Model to use", takesValue: true, valuePlaceholder: "provider/model" },
    { flag: "--variant", hint: "Model variant (reasoning effort)", takesValue: true, valuePlaceholder: "high" },
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
};

/** Result of the `check_binary` rpc. */
export interface BinaryStatus {
  found: boolean;
  path?: string;
  version?: string;
}

export interface AppSettings {
  defaultAgentId: string;
  agents: AgentPreset[];
  /** Maximum agents allowed to run concurrently. 0 = unlimited. */
  maxConcurrentAgents: number;
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
  // Only OpenCode ships for now — re-enable once integrated.
  // {
  //   id: "copilot",
  //   name: "GitHub Copilot CLI",
  //   binary: "copilot",
  //   argsTemplate: "-p {prompt} --yolo",
  // },
  // {
  //   id: "claude",
  //   name: "Claude CLI",
  //   binary: "claude",
  //   argsTemplate: "--dangerously-skip-permissions -p {prompt}",
  // },
];

export const DEFAULT_SETTINGS: AppSettings = {
  defaultAgentId: "opencode",
  agents: DEFAULT_AGENT_PRESETS,
  maxConcurrentAgents: 2,
  defaultHomePage: "kanban",
  locale: "auto",
  theme: "system",
  disabledPlugins: [],
  pluginConfig: {},
};
