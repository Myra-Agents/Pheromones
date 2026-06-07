/**
 * Agent & settings types for the multi-backend agent system.
 */

export interface AgentPreset {
  id: string;
  name: string;
  binary: string;
  argsTemplate: string;
  workingDir?: string;
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
    argsTemplate: "run {prompt} --dangerously-skip-permissions",
  },
  {
    id: "copilot",
    name: "GitHub Copilot CLI",
    binary: "copilot",
    argsTemplate: "-p {prompt} --yolo",
  },
  {
    id: "claude",
    name: "Claude CLI",
    binary: "claude",
    argsTemplate: "--dangerously-skip-permissions -p {prompt}",
  },
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
