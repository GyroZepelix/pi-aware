import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type KeybindingsManager,
} from "@earendil-works/pi-tui";

interface PiAwareConfig {
  voice?: string;
  rate?: number;
  finishedPhrase: string;
  questionPhrase: string;
  suppressWhileMicrophoneInUse: boolean;
}

interface SettingsDraft {
  voice: string;
  rate: string;
  finishedPhrase: string;
  questionPhrase: string;
  suppressWhileMicrophoneInUse: boolean;
}

type AnnouncementKind = "finished" | "question";

export interface SpawnOptions {
  stdio: "ignore";
  shell: false;
}

export interface SpawnCallbacks {
  onError(error: unknown): void;
  onClose(code: number | null): void;
}

export interface SpawnHandle {
  unref(): void;
}

export interface PiAwareDependencies {
  platform: string;
  getAgentDir(): string;
  getEnv(name: string): string | undefined;
  readTextFile(path: string): Promise<string>;
  writeConfigFile(path: string, source: string): Promise<void>;
  execFile(file: string, args: string[]): Promise<string>;
  detectMicrophoneInUse(): Promise<boolean>;
  spawnProcess(
    file: string,
    args: string[],
    options: SpawnOptions,
    callbacks: SpawnCallbacks,
  ): SpawnHandle;
}

const DEFAULT_CONFIG: Readonly<PiAwareConfig> = Object.freeze({
  finishedPhrase: "finished",
  questionPhrase: "question",
  suppressWhileMicrophoneInUse: true,
});

const CONFIG_KEYS = new Set([
  "voice",
  "rate",
  "finishedPhrase",
  "questionPhrase",
  "suppressWhileMicrophoneInUse",
]);

const COMMAND_COMPLETIONS = [
  { value: "t", label: "t", description: "Toggle session voice" },
  { value: "toggle", label: "toggle", description: "Toggle session voice" },
  { value: "on", label: "on", description: "Enable session voice" },
  { value: "off", label: "off", description: "Disable session voice" },
  { value: "status", label: "status", description: "Show session voice state" },
];

const USAGE_MESSAGE =
  "pi-aware: usage: /pi-aware [t|toggle|on|off|status]";

function parseConfig(source: string): PiAwareConfig {
  const value: unknown = JSON.parse(source);

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("the root value must be an object");
  }

  const record = value as Record<string, unknown>;
  const unknownKey = Object.keys(record).find((key) => !CONFIG_KEYS.has(key));
  if (unknownKey !== undefined) {
    throw new Error(`unknown field: ${unknownKey}`);
  }

  const config: PiAwareConfig = { ...DEFAULT_CONFIG };

  for (const key of ["voice", "finishedPhrase", "questionPhrase"] as const) {
    if (!(key in record)) continue;
    if (typeof record[key] !== "string") {
      throw new Error(`${key} must be a string`);
    }

    const trimmed = record[key].trim();
    if (trimmed.length === 0) {
      throw new Error(`${key} must not be empty`);
    }
    config[key] = trimmed;
  }

  if ("rate" in record) {
    const rate = record.rate;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      throw new Error("rate must be a positive finite number");
    }
    config.rate = rate;
  }

  if ("suppressWhileMicrophoneInUse" in record) {
    const suppressWhileMicrophoneInUse = record.suppressWhileMicrophoneInUse;
    if (typeof suppressWhileMicrophoneInUse !== "boolean") {
      throw new Error("suppressWhileMicrophoneInUse must be a boolean");
    }
    config.suppressWhileMicrophoneInUse = suppressWhileMicrophoneInUse;
  }

  return config;
}

function serializeConfig(config: PiAwareConfig): string {
  const record: Record<string, string | number | boolean> = {};
  if (config.voice !== undefined) record.voice = config.voice;
  if (config.rate !== undefined) record.rate = config.rate;
  record.finishedPhrase = config.finishedPhrase;
  record.questionPhrase = config.questionPhrase;
  record.suppressWhileMicrophoneInUse = config.suppressWhileMicrophoneInUse;
  return `${JSON.stringify(record, null, 2)}\n`;
}

function configToDraft(config: PiAwareConfig): SettingsDraft {
  return {
    voice: config.voice ?? "",
    rate: config.rate === undefined ? "" : String(config.rate),
    finishedPhrase: config.finishedPhrase,
    questionPhrase: config.questionPhrase,
    suppressWhileMicrophoneInUse: config.suppressWhileMicrophoneInUse,
  };
}

function validateDraft(draft: SettingsDraft): PiAwareConfig {
  const record: Record<string, unknown> = {
    finishedPhrase: draft.finishedPhrase,
    questionPhrase: draft.questionPhrase,
    suppressWhileMicrophoneInUse: draft.suppressWhileMicrophoneInUse,
  };

  if (draft.voice.trim().length > 0) record.voice = draft.voice;
  if (draft.rate.trim().length > 0) record.rate = Number(draft.rate.trim());

  return parseConfig(JSON.stringify(record));
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function defaultExecFile(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: "utf8" }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

export interface AtomicConfigWriteOperations {
  makeDirectory(path: string): Promise<void>;
  writeTemporary(path: string, source: string): Promise<void>;
  replaceFile(from: string, to: string): Promise<void>;
  removeFile(path: string): Promise<void>;
}

const PRODUCTION_WRITE_OPERATIONS: AtomicConfigWriteOperations = {
  makeDirectory: async (path) => {
    await mkdir(path, { recursive: true });
  },
  writeTemporary: async (path, source) => {
    await writeFile(path, source, { encoding: "utf8", flag: "wx" });
  },
  replaceFile: (from, to) => rename(from, to),
  removeFile: (path) => unlink(path),
};

export async function writeConfigFileAtomically(
  path: string,
  source: string,
  operations: AtomicConfigWriteOperations = PRODUCTION_WRITE_OPERATIONS,
): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = join(
    directory,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );

  await operations.makeDirectory(directory);
  try {
    await operations.writeTemporary(temporaryPath, source);
    await operations.replaceFile(temporaryPath, path);
  } catch (error) {
    try {
      await operations.removeFile(temporaryPath);
    } catch {
      // Best-effort cleanup must not replace the original write error.
    }
    throw error;
  }
}

const MICROPHONE_HELPER_PATH = fileURLToPath(
  new URL("../bin/pi-aware-mic-status", import.meta.url),
);

function defaultDetectMicrophoneInUse(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    execFile(
      MICROPHONE_HELPER_PATH,
      [],
      { encoding: "utf8", shell: false, timeout: 1_000 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        const status = stdout.trim();
        if (status === "active") {
          resolve(true);
        } else if (status === "inactive") {
          resolve(false);
        } else {
          reject(new Error(`unexpected microphone helper output: ${status}`));
        }
      },
    );
  });
}

function createProductionDependencies(
  resolveAgentDir: () => string,
): PiAwareDependencies {
  return {
    platform: process.platform,
    getAgentDir: resolveAgentDir,
    getEnv: (name) => process.env[name],
    readTextFile: (path) => readFile(path, "utf8"),
    writeConfigFile: writeConfigFileAtomically,
    execFile: defaultExecFile,
    detectMicrophoneInUse: defaultDetectMicrophoneInUse,
    spawnProcess: (file, args, options, callbacks) => {
      const child = spawn(file, args, options);
      child.once("error", callbacks.onError);
      child.once("close", callbacks.onClose);
      return { unref: () => child.unref() };
    },
  };
}

class PiAwareSettingsForm implements Component {
  private draft: SettingsDraft;
  private readonly inputs: Input[];
  private selectedIndex = 0;
  private editingIndex: number | undefined;
  private editOriginal = "";
  private error: string | undefined;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;
  private _focused = true;

  constructor(
    initialConfig: PiAwareConfig,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly requestRender: () => void,
    private readonly done: (result: PiAwareConfig | null) => void,
  ) {
    this.draft = configToDraft(initialConfig);
    this.inputs = [
      new Input({ placeholder: "system default" }),
      new Input({ placeholder: "system default" }),
      new Input(),
      new Input(),
    ];
    this.syncInputs();
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.updateInputFocus();
    this.invalidate();
  }

  private syncInputs(): void {
    this.inputs[0]?.setValue(this.draft.voice);
    this.inputs[1]?.setValue(this.draft.rate);
    this.inputs[2]?.setValue(this.draft.finishedPhrase);
    this.inputs[3]?.setValue(this.draft.questionPhrase);
    this.updateInputFocus();
  }

  private updateInputFocus(): void {
    for (let index = 0; index < this.inputs.length; index += 1) {
      const input = this.inputs[index];
      if (input) input.focused = this._focused && this.editingIndex === index;
    }
  }

  private refresh(): void {
    this.invalidate();
    this.requestRender();
  }

  private updateDraftFromInputs(): void {
    this.draft.voice = this.inputs[0]?.getValue() ?? "";
    this.draft.rate = this.inputs[1]?.getValue() ?? "";
    this.draft.finishedPhrase = this.inputs[2]?.getValue() ?? "";
    this.draft.questionPhrase = this.inputs[3]?.getValue() ?? "";
  }

  private startEditing(index: number): void {
    this.editingIndex = index;
    this.editOriginal = this.inputs[index]?.getValue() ?? "";
    this.inputs[index]?.handleInput("\u001b[F");
    this.updateInputFocus();
    this.refresh();
  }

  private finishEditing(save: boolean): void {
    const index = this.editingIndex;
    if (index === undefined) return;
    if (!save) this.inputs[index]?.setValue(this.editOriginal);
    this.editingIndex = undefined;
    this.updateDraftFromInputs();
    if (save && this.error !== undefined) {
      try {
        validateDraft(this.draft);
        this.error = undefined;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "invalid settings";
      }
    }
    this.updateInputFocus();
    this.refresh();
  }

  private resetDraft(): void {
    this.draft = configToDraft({ ...DEFAULT_CONFIG });
    this.error = undefined;
    this.syncInputs();
    this.refresh();
  }

  private save(): void {
    this.updateDraftFromInputs();
    try {
      this.done(validateDraft(this.draft));
    } catch (error) {
      this.error = error instanceof Error ? error.message : "invalid settings";
      this.refresh();
    }
  }

  handleInput(data: string): void {
    if (this.editingIndex !== undefined) {
      if (this.keybindings.matches(data, "tui.select.cancel")) {
        this.finishEditing(false);
        return;
      }
      if (this.keybindings.matches(data, "tui.select.confirm")) {
        this.finishEditing(true);
        return;
      }
      this.inputs[this.editingIndex]?.handleInput(data);
      this.refresh();
      return;
    }

    if (
      this.keybindings.matches(data, "tui.select.up") ||
      matchesKey(data, Key.shift("tab"))
    ) {
      this.selectedIndex =
        (this.selectedIndex + 7) % 8;
      this.refresh();
      return;
    }

    if (
      this.keybindings.matches(data, "tui.select.down") ||
      matchesKey(data, Key.tab)
    ) {
      this.selectedIndex = (this.selectedIndex + 1) % 8;
      this.refresh();
      return;
    }

    if (this.keybindings.matches(data, "tui.select.cancel")) {
      this.done(null);
      return;
    }

    if (!this.keybindings.matches(data, "tui.select.confirm")) return;

    if (this.selectedIndex < 4) {
      this.startEditing(this.selectedIndex);
      return;
    }

    if (this.selectedIndex === 4) {
      this.draft.suppressWhileMicrophoneInUse =
        !this.draft.suppressWhileMicrophoneInUse;
      this.refresh();
    } else if (this.selectedIndex === 5) {
      this.save();
    } else if (this.selectedIndex === 6) {
      this.done(null);
    } else {
      this.resetDraft();
    }
  }

  render(width: number): string[] {
    if (this.cachedWidth === width && this.cachedLines !== undefined) {
      return this.cachedLines;
    }

    const renderWidth = Math.max(1, width);
    const innerWidth = Math.max(1, renderWidth - 4);
    const lines: string[] = [];
    const add = (line = ""): void => {
      lines.push(truncateToWidth(line, renderWidth));
    };
    const row = (index: number, label: string, value: string): void => {
      const selected = index === this.selectedIndex;
      const prefix = selected ? "> " : "  ";
      const labelWidth = Math.max(10, Math.min(39, renderWidth - 20));
      const visibleLabel = truncateToWidth(label, labelWidth);
      const paddedLabel = `${visibleLabel}${" ".repeat(
        Math.max(0, labelWidth - visibleWidth(visibleLabel)),
      )}`;
      const text = `${prefix}${paddedLabel} ${value}`;
      add(selected ? this.theme.fg("accent", text) : this.theme.fg("text", text));
      if (this.editingIndex === index) {
        for (const inputLine of this.inputs[index]?.render(innerWidth) ?? []) {
          add(`  ${inputLine}`);
        }
      }
    };

    add(this.theme.fg("accent", "-".repeat(renderWidth)));
    add(`  ${this.theme.fg("accent", this.theme.bold("pi-aware settings"))}`);
    add();
    row(0, "Voice", this.draft.voice || "system default");
    row(1, "Rate", this.draft.rate || "system default");
    row(2, "Finished phrase", this.inputs[2]?.getValue() ?? "");
    row(3, "Question phrase", this.inputs[3]?.getValue() ?? "");
    row(
      4,
      "Suppress while microphone is active",
      this.draft.suppressWhileMicrophoneInUse ? "on" : "off",
    );
    add();
    row(5, "Save", "write and apply");
    row(6, "Cancel", "discard draft");
    row(7, "Reset", "stage defaults");
    if (this.error !== undefined) {
      add();
      add(`  ${this.theme.fg("error", `Invalid settings: ${this.error}`)}`);
    }
    add();
    add(
      `  ${this.theme.fg(
        "dim",
        this.editingIndex === undefined
          ? "Up/Down or Tab: move  Enter: select  Esc: cancel"
          : "Enter: keep edit  Esc: discard edit",
      )}`,
    );
    add(this.theme.fg("accent", "-".repeat(renderWidth)));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
    for (const input of this.inputs) input.invalidate();
  }
}

export function createPiAwareExtension(dependencies: PiAwareDependencies) {
  return (pi: ExtensionAPI): void => {
    let active = false;
    let shutdown = true;
    let voiceNotificationsEnabled = true;
    let speechDisabled = false;
    let speechWarningShown = false;
    let microphoneWarningShown = false;
    let suppressNextOwnPromptAnnouncement = false;
    let lifecycleGeneration = 0;
    let config: PiAwareConfig = { ...DEFAULT_CONFIG };
    let currentContext: ExtensionContext | undefined;

    const configPath = (): string =>
      join(
        dependencies.getAgentDir(),
        "extensions",
        "pi-aware",
        "config.json",
      );

    const warn = (message: string): void => {
      if (shutdown || currentContext === undefined) return;
      currentContext.ui.notify(message, "warning");
    };

    const notifyVoiceState = (ctx: ExtensionContext): void => {
      ctx.ui.notify(
        `pi-aware: voice notifications ${voiceNotificationsEnabled ? "enabled" : "disabled"} for this session.`,
        "info",
      );
    };

    const openSettings = async (ctx: ExtensionContext): Promise<void> => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("pi-aware: settings require TUI mode.", "warning");
        return;
      }

      const generation = lifecycleGeneration;
      let result: PiAwareConfig | null;
      suppressNextOwnPromptAnnouncement = true;
      try {
        result = await ctx.ui.custom<PiAwareConfig | null>(
          (tui, theme, keybindings, done) =>
            new PiAwareSettingsForm(
              { ...config },
              theme,
              keybindings,
              () => tui.requestRender(),
              done,
            ),
          {
            overlay: true,
            overlayOptions: {
              anchor: "center",
              width: 72,
              minWidth: 42,
              maxHeight: 20,
            },
          },
        );
      } catch {
        if (generation === lifecycleGeneration && !shutdown) {
          ctx.ui.notify("pi-aware: could not open settings.", "error");
        }
        return;
      } finally {
        suppressNextOwnPromptAnnouncement = false;
      }

      if (
        result === null ||
        generation !== lifecycleGeneration ||
        shutdown
      ) {
        return;
      }

      const path = configPath();
      const source = serializeConfig(result);
      const savedConfig = parseConfig(source);
      try {
        await dependencies.writeConfigFile(path, source);
      } catch {
        if (generation === lifecycleGeneration && !shutdown) {
          ctx.ui.notify(
            `pi-aware: could not save settings at ${path}; settings were not changed.`,
            "error",
          );
        }
        return;
      }

      if (generation !== lifecycleGeneration || shutdown) return;
      config = savedConfig;
      ctx.ui.notify("pi-aware: settings saved and applied.", "info");
    };

    pi.registerCommand("pi-aware", {
      description: "Open settings or control session voice notifications",
      getArgumentCompletions: (prefix) => {
        const normalizedPrefix = prefix.trim().toLowerCase();
        const matches = COMMAND_COMPLETIONS.filter((item) =>
          item.value.startsWith(normalizedPrefix),
        );
        return matches.length > 0 ? matches : null;
      },
      handler: async (args, ctx) => {
        const command = args.trim().toLowerCase();
        if (command.length === 0) {
          await openSettings(ctx);
          return;
        }

        if (command === "t" || command === "toggle") {
          voiceNotificationsEnabled = !voiceNotificationsEnabled;
          notifyVoiceState(ctx);
        } else if (command === "on") {
          voiceNotificationsEnabled = true;
          notifyVoiceState(ctx);
        } else if (command === "off") {
          voiceNotificationsEnabled = false;
          notifyVoiceState(ctx);
        } else if (command === "status") {
          notifyVoiceState(ctx);
        } else {
          ctx.ui.notify(USAGE_MESSAGE, "warning");
        }
      },
    });

    const handleSpeechFailure = (): void => {
      speechDisabled = true;
      if (speechWarningShown) return;
      speechWarningShown = true;
      warn("pi-aware: /usr/bin/say failed; speech is disabled until reload.");
    };

    const resolveWindowIndex = async (): Promise<string | undefined> => {
      const paneId = dependencies.getEnv("TMUX_PANE");
      if (!paneId) return undefined;

      try {
        const output = await dependencies.execFile("tmux", [
          "display-message",
          "-p",
          "-t",
          paneId,
          "#{window_index}",
        ]);
        const windowIndex = output.trim();
        return /^(0|[1-9]\d*)$/.test(windowIndex) ? windowIndex : undefined;
      } catch {
        return undefined;
      }
    };

    const announce = async (kind: AnnouncementKind): Promise<void> => {
      if (
        !active ||
        shutdown ||
        !voiceNotificationsEnabled ||
        speechDisabled
      ) {
        return;
      }

      const generation = lifecycleGeneration;
      const announcementConfig: PiAwareConfig = { ...config };
      const phrase =
        kind === "question"
          ? announcementConfig.questionPhrase
          : announcementConfig.finishedPhrase;
      const windowIndex = await resolveWindowIndex();
      if (
        !active ||
        shutdown ||
        !voiceNotificationsEnabled ||
        speechDisabled ||
        generation !== lifecycleGeneration
      ) {
        return;
      }

      if (announcementConfig.suppressWhileMicrophoneInUse) {
        try {
          if (await dependencies.detectMicrophoneInUse()) return;
        } catch {
          if (
            generation === lifecycleGeneration &&
            active &&
            !shutdown &&
            !microphoneWarningShown
          ) {
            microphoneWarningShown = true;
            warn(
              "pi-aware: microphone-use detection failed; voice notifications will continue.",
            );
          }
        }
      }

      if (
        !active ||
        shutdown ||
        !voiceNotificationsEnabled ||
        speechDisabled ||
        generation !== lifecycleGeneration
      ) {
        return;
      }

      const spokenText =
        windowIndex === undefined ? phrase : `${phrase} ${windowIndex}`;
      const args: string[] = [];
      if (announcementConfig.voice !== undefined) {
        args.push("-v", announcementConfig.voice);
      }
      if (announcementConfig.rate !== undefined) {
        args.push("-r", String(announcementConfig.rate));
      }
      args.push(spokenText);

      try {
        const child = dependencies.spawnProcess(
          "/usr/bin/say",
          args,
          { stdio: "ignore", shell: false },
          {
            onError: () => {
              if (generation === lifecycleGeneration) handleSpeechFailure();
            },
            onClose: (code) => {
              if (code !== 0 && generation === lifecycleGeneration) {
                handleSpeechFailure();
              }
            },
          },
        );
        child.unref();
      } catch {
        handleSpeechFailure();
      }
    };

    pi.on("session_start", async (_event, ctx) => {
      lifecycleGeneration += 1;
      active = false;
      shutdown = false;
      voiceNotificationsEnabled = true;
      speechDisabled = false;
      speechWarningShown = false;
      microphoneWarningShown = false;
      suppressNextOwnPromptAnnouncement = false;
      config = { ...DEFAULT_CONFIG };
      currentContext = ctx;

      if (ctx.mode !== "tui") return;
      if (dependencies.platform !== "darwin") {
        warn("pi-aware: text-to-speech notifications require macOS.");
        return;
      }

      const path = configPath();
      try {
        config = parseConfig(await dependencies.readTextFile(path));
      } catch (error) {
        if (!isMissingFile(error)) {
          warn(`pi-aware: invalid config at ${path}; using defaults.`);
        }
      }

      active = true;
    });

    pi.on("session_shutdown", () => {
      lifecycleGeneration += 1;
      active = false;
      shutdown = true;
      suppressNextOwnPromptAnnouncement = false;
      currentContext = undefined;
    });

    pi.on("ui_prompt_start", async () => {
      if (suppressNextOwnPromptAnnouncement) {
        suppressNextOwnPromptAnnouncement = false;
        return;
      }
      await announce("question");
    });

    pi.on("agent_settled", async () => {
      await announce("finished");
    });
  };
}

const piAware: ExtensionFactory = async (pi) => {
  const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
  createPiAwareExtension(createProductionDependencies(getAgentDir))(pi);
};

export default piAware;
