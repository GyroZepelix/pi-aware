import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";

interface PiAwareConfig {
  voice?: string;
  rate?: number;
  finishedPhrase: string;
  questionPhrase: string;
}

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
  execFile(file: string, args: string[]): Promise<string>;
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
});

const CONFIG_KEYS = new Set([
  "voice",
  "rate",
  "finishedPhrase",
  "questionPhrase",
]);

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

  return config;
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

function createProductionDependencies(
  resolveAgentDir: () => string,
): PiAwareDependencies {
  return {
    platform: process.platform,
    getAgentDir: resolveAgentDir,
    getEnv: (name) => process.env[name],
    readTextFile: (path) => readFile(path, "utf8"),
    execFile: defaultExecFile,
    spawnProcess: (file, args, options, callbacks) => {
      const child = spawn(file, args, options);
      child.once("error", callbacks.onError);
      child.once("close", callbacks.onClose);
      return { unref: () => child.unref() };
    },
  };
}

export function createPiAwareExtension(dependencies: PiAwareDependencies) {
  return (pi: ExtensionAPI): void => {
    let active = false;
    let shutdown = true;
    let speechDisabled = false;
    let speechWarningShown = false;
    let lifecycleGeneration = 0;
    let config: PiAwareConfig = { ...DEFAULT_CONFIG };
    let currentContext: ExtensionContext | undefined;

    const warn = (message: string): void => {
      if (shutdown || currentContext === undefined) return;
      currentContext.ui.notify(message, "warning");
    };

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

    const announce = async (phrase: string): Promise<void> => {
      if (!active || shutdown || speechDisabled) return;

      const generation = lifecycleGeneration;
      const windowIndex = await resolveWindowIndex();
      if (
        !active ||
        shutdown ||
        speechDisabled ||
        generation !== lifecycleGeneration
      ) {
        return;
      }

      const spokenText = windowIndex === undefined ? phrase : `${phrase} ${windowIndex}`;
      const args: string[] = [];
      if (config.voice !== undefined) args.push("-v", config.voice);
      if (config.rate !== undefined) args.push("-r", String(config.rate));
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
      speechDisabled = false;
      speechWarningShown = false;
      config = { ...DEFAULT_CONFIG };
      currentContext = ctx;

      if (ctx.mode !== "tui") return;
      if (dependencies.platform !== "darwin") {
        warn("pi-aware: text-to-speech notifications require macOS.");
        return;
      }

      const configPath = join(
        dependencies.getAgentDir(),
        "extensions",
        "pi-aware",
        "config.json",
      );

      try {
        config = parseConfig(await dependencies.readTextFile(configPath));
      } catch (error) {
        if (!isMissingFile(error)) {
          warn(`pi-aware: invalid config at ${configPath}; using defaults.`);
        }
      }

      active = true;
    });

    pi.on("session_shutdown", () => {
      lifecycleGeneration += 1;
      active = false;
      shutdown = true;
      currentContext = undefined;
    });

    pi.on("ui_prompt_start", async () => {
      await announce(config.questionPhrase);
    });

    pi.on("agent_settled", async () => {
      await announce(config.finishedPhrase);
    });
  };
}

const piAware: ExtensionFactory = async (pi) => {
  const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
  createPiAwareExtension(createProductionDependencies(getAgentDir))(pi);
};

export default piAware;
