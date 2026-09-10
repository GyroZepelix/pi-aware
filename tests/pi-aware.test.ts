import { describe, expect, test } from "bun:test";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  visibleWidth,
  type Component,
  type Keybinding,
  type KeybindingsManager,
  type KeyId,
} from "@earendil-works/pi-tui";
import {
  createPiAwareExtension,
  writeConfigFileAtomically,
  type AtomicConfigWriteOperations,
  type PiAwareDependencies,
  type SpawnCallbacks,
  type SpawnOptions,
} from "../extensions/pi-aware.ts";

type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => unknown;

interface CommandOptions {
  description: string;
  getArgumentCompletions?: (
    prefix: string,
  ) => Array<{ value: string; label: string; description?: string }> | null;
  handler(args: string, ctx: ExtensionContext): unknown;
}

interface ExecCall {
  file: string;
  args: string[];
}

interface SpawnCall {
  file: string;
  args: string[];
  options: SpawnOptions;
  callbacks: SpawnCallbacks;
  unrefCount: number;
}

interface ConfigWrite {
  path: string;
  source: string;
}

interface CustomCall {
  component: Component;
  options: Record<string, unknown> | undefined;
  finish(result: unknown): void;
}

const BINDING_KEYS: Record<string, KeyId[]> = {
  "tui.select.up": [Key.up],
  "tui.select.down": [Key.down],
  "tui.select.confirm": [Key.enter],
  "tui.select.cancel": [Key.escape, Key.ctrl("c")],
};

function missingFile(): Error & { code: string } {
  return Object.assign(new Error("missing"), { code: "ENOENT" });
}

function createHarness(overrides: Partial<PiAwareDependencies> = {}) {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, CommandOptions>();
  const notifications: Array<{ message: string; type?: string }> = [];
  const execCalls: ExecCall[] = [];
  const spawnCalls: SpawnCall[] = [];
  const configReads: string[] = [];
  const configWrites: ConfigWrite[] = [];
  const customCalls: CustomCall[] = [];
  const environment: Record<string, string | undefined> = {};
  let microphoneCheckCount = 0;
  let renderRequestCount = 0;

  const dependencies: PiAwareDependencies = {
    platform: "darwin",
    getAgentDir: () => "/agent",
    getEnv: (name) => environment[name],
    readTextFile: async (path) => {
      configReads.push(path);
      throw missingFile();
    },
    writeConfigFile: async () => {},
    execFile: async (file, args) => {
      execCalls.push({ file, args });
      return "5\n";
    },
    detectMicrophoneInUse: async () => false,
    spawnProcess: (file, args, options, callbacks) => {
      const call: SpawnCall = {
        file,
        args: [...args],
        options,
        callbacks,
        unrefCount: 0,
      };
      spawnCalls.push(call);
      return {
        unref: () => {
          call.unrefCount += 1;
        },
      };
    },
    ...overrides,
    writeConfigFile: async (path, source) => {
      configWrites.push({ path, source });
      await (overrides.writeConfigFile ?? (async () => {}))(path, source);
    },
    detectMicrophoneInUse: async () => {
      microphoneCheckCount += 1;
      return (overrides.detectMicrophoneInUse ?? (async () => false))();
    },
  };

  const pi = {
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
    registerCommand(name: string, options: CommandOptions) {
      commands.set(name, options);
    },
  } as unknown as ExtensionAPI;

  createPiAwareExtension(dependencies)(pi);

  const keybindings = {
    matches(data: string, keybinding: Keybinding) {
      return (BINDING_KEYS[keybinding] ?? []).some((key) =>
        matchesKey(data, key),
      );
    },
  } as unknown as KeybindingsManager;

  const theme = {
    fg(_color: string, text: string) {
      return text;
    },
    bg(_color: string, text: string) {
      return text;
    },
    bold(text: string) {
      return text;
    },
  };

  const context = (mode: ExtensionContext["mode"] = "tui") =>
    ({
      mode,
      hasUI: mode === "tui" || mode === "rpc",
      ui: {
        notify(message: string, type?: string) {
          notifications.push({ message, type });
        },
        custom<T>(factory: (...args: any[]) => Component, options?: Record<string, unknown>) {
          let finish!: (result: T) => void;
          const result = new Promise<T>((resolve) => {
            finish = resolve;
          });
          const component = factory(
            { requestRender: () => { renderRequestCount += 1; } },
            theme,
            keybindings,
            (value: T) => finish(value),
          );
          customCalls.push({
            component,
            options,
            finish: (value) => finish(value as T),
          });
          return result;
        },
      },
    }) as unknown as ExtensionContext;

  const emit = async (
    event: string,
    ctx: ExtensionContext,
    details: Record<string, unknown> = {},
  ) => {
    const handler = handlers.get(event);
    if (!handler) throw new Error(`No handler registered for ${event}`);
    await handler({ type: event, ...details }, ctx);
  };

  const start = async (mode: ExtensionContext["mode"] = "tui") => {
    const ctx = context(mode);
    await emit("session_start", ctx, { reason: "startup" });
    return ctx;
  };

  const runCommand = async (
    name: string,
    ctx: ExtensionContext,
    args = "toggle",
  ) => {
    const command = commands.get(name);
    if (!command) throw new Error(`No command registered for ${name}`);
    await command.handler(args, ctx);
  };

  return {
    handlers,
    commands,
    notifications,
    execCalls,
    spawnCalls,
    configReads,
    configWrites,
    customCalls,
    environment,
    microphoneCheckCount: () => microphoneCheckCount,
    renderRequestCount: () => renderRequestCount,
    context,
    emit,
    start,
    runCommand,
  };
}

const INPUT = {
  up: "\u001b[A",
  down: "\u001b[B",
  enter: "\r",
  escape: "\u001b",
  tab: "\t",
  shiftTab: "\u001b[Z",
  end: "\u001b[F",
  clearLine: "\u0015",
};

function send(component: Component, data: string): void {
  component.handleInput?.(data);
}

function typeText(component: Component, text: string): void {
  for (const character of text) send(component, character);
}

async function beginSettings(
  harness: ReturnType<typeof createHarness>,
  ctx: ExtensionContext,
) {
  const pending = harness.runCommand("pi-aware", ctx, "");
  await Promise.resolve();
  const call = harness.customCalls.at(-1);
  if (!call) throw new Error("settings UI did not open");
  return { pending, call };
}

describe("pi-aware", () => {
  test("registers the command and only the four lifecycle hooks", async () => {
    const harness = createHarness();

    expect([...harness.handlers.keys()].sort()).toEqual([
      "agent_settled",
      "session_shutdown",
      "session_start",
      "ui_prompt_start",
    ]);
    expect([...harness.commands.keys()]).toEqual(["pi-aware"]);
    expect(harness.commands.get("pi-aware")?.description).toBe(
      "Open settings or control session voice notifications",
    );

    const ctx = await harness.start();
    await harness.emit("ui_prompt_start", ctx, { kind: "select" });
    await harness.emit("agent_settled", ctx, { outcome: "aborted" });
    await harness.emit("agent_settled", ctx, { outcome: "error" });

    expect(harness.configReads).toEqual([
      "/agent/extensions/pi-aware/config.json",
    ]);
    expect(harness.notifications).toEqual([]);
    expect(harness.execCalls).toEqual([]);
    expect(harness.spawnCalls.map((call) => call.args)).toEqual([
      ["question"],
      ["finished"],
      ["finished"],
    ]);
    expect(harness.spawnCalls.every((call) => call.unrefCount === 1)).toBe(true);
  });

  test("toggles voice notifications for the current session", async () => {
    const harness = createHarness();
    harness.environment.TMUX_PANE = "%7";
    const ctx = await harness.start();

    await harness.runCommand("pi-aware", ctx);
    await harness.emit("ui_prompt_start", ctx);
    await harness.emit("agent_settled", ctx);

    expect(harness.notifications).toEqual([
      {
        message: "pi-aware: voice notifications disabled for this session.",
        type: "info",
      },
    ]);
    expect(harness.execCalls).toEqual([]);
    expect(harness.spawnCalls).toEqual([]);

    await harness.runCommand("pi-aware", ctx);
    await harness.emit("agent_settled", ctx);

    expect(harness.notifications).toEqual([
      {
        message: "pi-aware: voice notifications disabled for this session.",
        type: "info",
      },
      {
        message: "pi-aware: voice notifications enabled for this session.",
        type: "info",
      },
    ]);
    expect(harness.execCalls).toEqual([
      {
        file: "tmux",
        args: ["display-message", "-p", "-t", "%7", "#{window_index}"],
      },
    ]);
    expect(harness.spawnCalls.map((call) => call.args)).toEqual([
      ["finished 5"],
    ]);
  });

  test("suppresses an in-flight alert and resets to enabled on session start", async () => {
    let deferLookup = true;
    let lookupCount = 0;
    let resolveLookup: ((value: string) => void) | undefined;
    const harness = createHarness({
      getEnv: () => "%8",
      execFile: async () => {
        lookupCount += 1;
        if (!deferLookup) return "4\n";
        return new Promise<string>((resolve) => {
          resolveLookup = resolve;
        });
      },
    });

    let ctx = await harness.start();
    const pendingAlert = harness.emit("agent_settled", ctx);
    expect(lookupCount).toBe(1);

    await harness.runCommand("pi-aware", ctx);
    resolveLookup?.("3\n");
    await pendingAlert;

    expect(harness.spawnCalls).toEqual([]);

    await harness.emit("session_shutdown", ctx, { reason: "reload" });
    deferLookup = false;
    ctx = await harness.start();
    await harness.emit("agent_settled", ctx);

    expect(lookupCount).toBe(2);
    expect(harness.spawnCalls.map((call) => call.args)).toEqual([
      ["finished 4"],
    ]);
  });

  test("does not let the command clear the speech failure latch", async () => {
    const harness = createHarness();
    const ctx = await harness.start();

    await harness.emit("agent_settled", ctx);
    await harness.runCommand("pi-aware", ctx);
    harness.spawnCalls[0]?.callbacks.onError(new Error("spawn failed"));
    await harness.runCommand("pi-aware", ctx);
    await harness.emit("agent_settled", ctx);

    expect(harness.notifications).toEqual([
      {
        message: "pi-aware: voice notifications disabled for this session.",
        type: "info",
      },
      {
        message: "pi-aware: /usr/bin/say failed; speech is disabled until reload.",
        type: "warning",
      },
      {
        message: "pi-aware: voice notifications enabled for this session.",
        type: "info",
      },
    ]);
    expect(harness.spawnCalls).toHaveLength(1);
    expect(harness.microphoneCheckCount()).toBe(1);
  });

  test("suppresses both alert types while microphone input is active", async () => {
    let microphoneInUse = true;
    const harness = createHarness({
      detectMicrophoneInUse: async () => microphoneInUse,
    });
    const ctx = await harness.start();

    await harness.emit("ui_prompt_start", ctx);
    await harness.emit("agent_settled", ctx);

    expect(harness.microphoneCheckCount()).toBe(2);
    expect(harness.notifications).toEqual([]);
    expect(harness.spawnCalls).toEqual([]);

    microphoneInUse = false;
    await harness.emit("agent_settled", ctx);

    expect(harness.microphoneCheckCount()).toBe(3);
    expect(harness.spawnCalls.map((call) => call.args)).toEqual([
      ["finished"],
    ]);
  });

  test("skips microphone detection when automatic suppression is disabled", async () => {
    const harness = createHarness({
      readTextFile: async () =>
        JSON.stringify({ suppressWhileMicrophoneInUse: false }),
      detectMicrophoneInUse: async () => {
        throw new Error("detector should not run");
      },
    });
    const ctx = await harness.start();

    await harness.emit("ui_prompt_start", ctx);
    await harness.emit("agent_settled", ctx);

    expect(harness.microphoneCheckCount()).toBe(0);
    expect(harness.notifications).toEqual([]);
    expect(harness.spawnCalls.map((call) => call.args)).toEqual([
      ["question"],
      ["finished"],
    ]);
  });

  test("fails open, warns once, retries, and can recover detection", async () => {
    const outcomes: Array<boolean | Error> = [
      new Error("first failure"),
      new Error("second failure"),
      true,
      false,
    ];
    const harness = createHarness({
      detectMicrophoneInUse: async () => {
        const outcome = outcomes.shift();
        if (outcome instanceof Error) throw outcome;
        return outcome ?? false;
      },
    });
    const ctx = await harness.start();

    for (let index = 0; index < 4; index += 1) {
      await harness.emit("agent_settled", ctx);
    }

    expect(harness.microphoneCheckCount()).toBe(4);
    expect(harness.notifications).toEqual([
      {
        message:
          "pi-aware: microphone-use detection failed; voice notifications will continue.",
        type: "warning",
      },
    ]);
    expect(harness.spawnCalls.map((call) => call.args)).toEqual([
      ["finished"],
      ["finished"],
      ["finished"],
    ]);

    outcomes.push(new Error("new runtime failure"));
    const nextContext = await harness.start();
    await harness.emit("agent_settled", nextContext);

    expect(harness.microphoneCheckCount()).toBe(5);
    expect(harness.notifications).toHaveLength(2);
    expect(harness.notifications[1]).toEqual({
      message:
        "pi-aware: microphone-use detection failed; voice notifications will continue.",
      type: "warning",
    });
    expect(harness.spawnCalls).toHaveLength(4);
  });

  test("suppresses an in-flight microphone check after manual disable", async () => {
    let resolveCheck: ((value: boolean) => void) | undefined;
    const harness = createHarness({
      detectMicrophoneInUse: async () =>
        new Promise<boolean>((resolve) => {
          resolveCheck = resolve;
        }),
    });
    const ctx = await harness.start();

    const pendingAlert = harness.emit("agent_settled", ctx);
    await Promise.resolve();
    expect(harness.microphoneCheckCount()).toBe(1);
    await harness.runCommand("pi-aware", ctx);
    resolveCheck?.(false);
    await pendingAlert;

    expect(harness.spawnCalls).toEqual([]);
    expect(harness.notifications).toEqual([
      {
        message: "pi-aware: voice notifications disabled for this session.",
        type: "info",
      },
    ]);
  });

  test("uses the final toggle state after an in-flight microphone check", async () => {
    let resolveCheck: ((value: boolean) => void) | undefined;
    const harness = createHarness({
      detectMicrophoneInUse: async () =>
        new Promise<boolean>((resolve) => {
          resolveCheck = resolve;
        }),
    });
    const ctx = await harness.start();

    const pendingAlert = harness.emit("agent_settled", ctx);
    await Promise.resolve();
    await harness.runCommand("pi-aware", ctx);
    await harness.runCommand("pi-aware", ctx);
    resolveCheck?.(false);
    await pendingAlert;

    expect(harness.notifications).toEqual([
      {
        message: "pi-aware: voice notifications disabled for this session.",
        type: "info",
      },
      {
        message: "pi-aware: voice notifications enabled for this session.",
        type: "info",
      },
    ]);
    expect(harness.spawnCalls.map((call) => call.args)).toEqual([
      ["finished"],
    ]);
  });

  test("shows a pending detection warning independently from voice gates", async () => {
    let checkCount = 0;
    let rejectCheck: ((error: Error) => void) | undefined;
    const harness = createHarness({
      detectMicrophoneInUse: async () => {
        checkCount += 1;
        if (checkCount === 1) return false;
        return new Promise<boolean>((_resolve, reject) => {
          rejectCheck = reject;
        });
      },
    });
    const ctx = await harness.start();

    await harness.emit("agent_settled", ctx);
    const pendingAlert = harness.emit("agent_settled", ctx);
    await Promise.resolve();
    await harness.runCommand("pi-aware", ctx);
    harness.spawnCalls[0]?.callbacks.onError(new Error("speech failed"));
    rejectCheck?.(new Error("detection failed"));
    await pendingAlert;

    expect(harness.spawnCalls).toHaveLength(1);
    expect(harness.notifications).toEqual([
      {
        message: "pi-aware: voice notifications disabled for this session.",
        type: "info",
      },
      {
        message: "pi-aware: /usr/bin/say failed; speech is disabled until reload.",
        type: "warning",
      },
      {
        message:
          "pi-aware: microphone-use detection failed; voice notifications will continue.",
        type: "warning",
      },
    ]);
  });

  test("guards in-flight microphone checks across toggles and lifecycles", async () => {
    let rejectFirst: ((error: Error) => void) | undefined;
    let firstCheck = true;
    const harness = createHarness({
      detectMicrophoneInUse: async () => {
        if (!firstCheck) return false;
        firstCheck = false;
        return new Promise<boolean>((_resolve, reject) => {
          rejectFirst = reject;
        });
      },
    });

    let ctx = await harness.start();
    const staleAlert = harness.emit("agent_settled", ctx);
    await Promise.resolve();
    expect(harness.microphoneCheckCount()).toBe(1);

    await harness.runCommand("pi-aware", ctx);
    await harness.emit("session_shutdown", ctx, { reason: "reload" });
    ctx = await harness.start();
    rejectFirst?.(new Error("stale failure"));
    await staleAlert;

    expect(harness.notifications).toEqual([
      {
        message: "pi-aware: voice notifications disabled for this session.",
        type: "info",
      },
    ]);
    expect(harness.spawnCalls).toEqual([]);

    await harness.emit("agent_settled", ctx);
    expect(harness.microphoneCheckCount()).toBe(2);
    expect(harness.spawnCalls.map((call) => call.args)).toEqual([
      ["finished"],
    ]);
  });

  test("applies trimmed config and resolves the current window for every alert", async () => {
    const windowIndexes = ["5\n", "7\n"];
    const execCalls: ExecCall[] = [];
    const harness = createHarness({
      readTextFile: async () =>
        JSON.stringify({
          voice: "  Samantha  ",
          rate: 210.5,
          finishedPhrase: "  done  ",
          questionPhrase: "  answer  ",
        }),
      getEnv: () => "%42",
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return windowIndexes.shift() ?? "0";
      },
    });

    const ctx = await harness.start();
    await harness.emit("ui_prompt_start", ctx);
    await harness.emit("agent_settled", ctx);

    expect(execCalls).toEqual([
      {
        file: "tmux",
        args: ["display-message", "-p", "-t", "%42", "#{window_index}"],
      },
      {
        file: "tmux",
        args: ["display-message", "-p", "-t", "%42", "#{window_index}"],
      },
    ]);
    expect(harness.spawnCalls.map((call) => call.args)).toEqual([
      ["-v", "Samantha", "-r", "210.5", "answer 5"],
      ["-v", "Samantha", "-r", "210.5", "done 7"],
    ]);
    expect(harness.spawnCalls[0]?.file).toBe("/usr/bin/say");
    expect(harness.spawnCalls[0]?.options).toEqual({
      stdio: "ignore",
      shell: false,
    });
  });

  test("warns once and uses all defaults for invalid configuration", async () => {
    const invalidSources = [
      "{",
      "[]",
      '"text"',
      '{"unknown":true}',
      '{"voice":"   "}',
      '{"questionPhrase":1}',
      '{"rate":0}',
      '{"rate":-1}',
      '{"rate":1e999}',
      '{"voice":"Samantha","rate":0}',
      '{"suppressWhileMicrophoneInUse":"yes"}',
    ];

    for (const source of invalidSources) {
      const harness = createHarness({ readTextFile: async () => source });
      const ctx = await harness.start();
      await harness.emit("ui_prompt_start", ctx);

      expect(harness.notifications).toHaveLength(1);
      expect(harness.notifications[0]?.type).toBe("warning");
      expect(harness.microphoneCheckCount()).toBe(1);
      expect(harness.spawnCalls[0]?.args).toEqual(["question"]);
    }
  });

  test("warns for non-missing config read errors but not for ENOENT", async () => {
    const denied = createHarness({
      readTextFile: async () => {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      },
    });
    const deniedContext = await denied.start();
    await denied.emit("agent_settled", deniedContext);

    expect(denied.notifications).toHaveLength(1);
    expect(denied.spawnCalls[0]?.args).toEqual(["finished"]);

    const missing = createHarness();
    await missing.start();
    expect(missing.notifications).toEqual([]);
  });

  test("stays silent outside macOS TUI sessions", async () => {
    for (const mode of ["rpc", "json", "print"] as const) {
      const harness = createHarness();
      const ctx = await harness.start(mode);
      await harness.emit("ui_prompt_start", ctx);
      await harness.emit("agent_settled", ctx);
      expect(harness.configReads).toEqual([]);
      expect(harness.notifications).toEqual([]);
      expect(harness.spawnCalls).toEqual([]);
    }

    const nonMac = createHarness({ platform: "linux" });
    const ctx = await nonMac.start();
    await nonMac.emit("ui_prompt_start", ctx);
    await nonMac.emit("agent_settled", ctx);

    expect(nonMac.configReads).toEqual([]);
    expect(nonMac.notifications).toEqual([
      {
        message: "pi-aware: text-to-speech notifications require macOS.",
        type: "warning",
      },
    ]);
    expect(nonMac.spawnCalls).toEqual([]);
  });

  test("falls back silently when tmux lookup fails or returns invalid output", async () => {
    const outcomes: Array<string | Error> = [
      new Error("tmux failed"),
      "not-a-number\n",
      "-1\n",
      "  \n",
      "0\n",
    ];
    const harness = createHarness({
      getEnv: () => "%9",
      execFile: async () => {
        const outcome = outcomes.shift();
        if (outcome instanceof Error) throw outcome;
        return outcome ?? "";
      },
    });

    const ctx = await harness.start();
    for (let index = 0; index < 5; index += 1) {
      await harness.emit("agent_settled", ctx);
    }

    expect(harness.notifications).toEqual([]);
    expect(harness.spawnCalls.map((call) => call.args)).toEqual([
      ["finished"],
      ["finished"],
      ["finished"],
      ["finished"],
      ["finished 0"],
    ]);
  });

  test("allows concurrent window lookups and speech launches", async () => {
    const resolvers: Array<(value: string) => void> = [];
    let lookupCount = 0;
    const harness = createHarness({
      getEnv: () => "%1",
      execFile: async () => {
        lookupCount += 1;
        return new Promise<string>((resolve) => resolvers.push(resolve));
      },
    });

    const ctx = await harness.start();
    const question = harness.emit("ui_prompt_start", ctx);
    const finished = harness.emit("agent_settled", ctx);

    expect(lookupCount).toBe(2);
    expect(harness.spawnCalls).toHaveLength(0);

    resolvers[0]?.("1\n");
    resolvers[1]?.("1\n");
    await Promise.all([question, finished]);

    expect(harness.microphoneCheckCount()).toBe(2);
    expect(harness.spawnCalls.map((call) => call.args)).toEqual([
      ["question 1"],
      ["finished 1"],
    ]);
  });

  test("disables after spawn errors or unsuccessful exits and resets on startup", async () => {
    const harness = createHarness();
    let ctx = await harness.start();

    await harness.emit("agent_settled", ctx);
    harness.spawnCalls[0]?.callbacks.onError(new Error("spawn failed"));
    harness.spawnCalls[0]?.callbacks.onClose(null);
    await harness.emit("agent_settled", ctx);

    expect(harness.notifications).toHaveLength(1);
    expect(harness.spawnCalls).toHaveLength(1);

    ctx = await harness.start();
    await harness.emit("agent_settled", ctx);
    harness.spawnCalls[1]?.callbacks.onClose(1);
    await harness.emit("agent_settled", ctx);

    expect(harness.notifications).toHaveLength(2);
    expect(harness.spawnCalls).toHaveLength(2);
  });

  test("handles synchronous spawn failures and ignores stale callbacks", async () => {
    const throwing = createHarness({
      spawnProcess: () => {
        throw new Error("spawn threw");
      },
    });
    const throwingContext = await throwing.start();
    await throwing.emit("agent_settled", throwingContext);
    await throwing.emit("agent_settled", throwingContext);
    expect(throwing.notifications).toHaveLength(1);

    const harness = createHarness();
    let ctx = await harness.start();
    await harness.emit("agent_settled", ctx);
    const staleCallbacks = harness.spawnCalls[0]?.callbacks;
    await harness.emit("session_shutdown", ctx, { reason: "reload" });

    staleCallbacks?.onError(new Error("late error"));
    expect(harness.notifications).toEqual([]);

    ctx = await harness.start();
    staleCallbacks?.onClose(1);
    await harness.emit("agent_settled", ctx);
    harness.spawnCalls[1]?.callbacks.onClose(0);
    await harness.emit("agent_settled", ctx);

    expect(harness.notifications).toEqual([]);
    expect(harness.spawnCalls).toHaveLength(3);
  });

  test("supports explicit voice commands and argument completions", async () => {
    const harness = createHarness();
    const ctx = await harness.start();
    const command = harness.commands.get("pi-aware");

    expect(command?.getArgumentCompletions?.("")?.map((item) => item.value)).toEqual([
      "t",
      "toggle",
      "on",
      "off",
      "status",
    ]);
    expect(command?.getArgumentCompletions?.("to")?.map((item) => item.value)).toEqual([
      "toggle",
    ]);
    expect(command?.getArgumentCompletions?.("missing")).toBeNull();

    await harness.runCommand("pi-aware", ctx, "status");
    await harness.runCommand("pi-aware", ctx, "off");
    await harness.runCommand("pi-aware", ctx, " OFF ");
    await harness.runCommand("pi-aware", ctx, "status");
    await harness.runCommand("pi-aware", ctx, "on");
    await harness.runCommand("pi-aware", ctx, "t");
    await harness.runCommand("pi-aware", ctx, " ToGgLe ");
    await harness.runCommand("pi-aware", ctx, "on now");
    await harness.runCommand("pi-aware", ctx, "unknown");

    expect(harness.notifications).toEqual([
      { message: "pi-aware: voice notifications enabled for this session.", type: "info" },
      { message: "pi-aware: voice notifications disabled for this session.", type: "info" },
      { message: "pi-aware: voice notifications disabled for this session.", type: "info" },
      { message: "pi-aware: voice notifications disabled for this session.", type: "info" },
      { message: "pi-aware: voice notifications enabled for this session.", type: "info" },
      { message: "pi-aware: voice notifications disabled for this session.", type: "info" },
      { message: "pi-aware: voice notifications enabled for this session.", type: "info" },
      { message: "pi-aware: usage: /pi-aware [t|toggle|on|off|status]", type: "warning" },
      { message: "pi-aware: usage: /pi-aware [t|toggle|on|off|status]", type: "warning" },
    ]);
    expect(harness.customCalls).toEqual([]);
  });

  test("rejects bare settings outside TUI mode without changing voice state", async () => {
    const harness = createHarness();
    const ctx = await harness.start("rpc");

    await harness.runCommand("pi-aware", ctx, "   ");
    await harness.runCommand("pi-aware", ctx, "status");

    expect(harness.customCalls).toEqual([]);
    expect(harness.configWrites).toEqual([]);
    expect(harness.notifications).toEqual([
      { message: "pi-aware: settings require TUI mode.", type: "warning" },
      { message: "pi-aware: voice notifications enabled for this session.", type: "info" },
    ]);
  });

  test("opens a bounded settings overlay and suppresses only its own prompt", async () => {
    const harness = createHarness();
    const ctx = await harness.start();
    const { pending, call } = await beginSettings(harness, ctx);

    expect(call.options).toEqual({
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: 72,
        minWidth: 42,
        maxHeight: 20,
      },
    });
    const lines = call.component.render(42);
    const wideView = call.component.render(72).join("\n");
    expect(wideView).toContain("pi-aware settings");
    expect(wideView).toContain("Voice");
    expect(wideView).toContain("Suppress while microphone is active");
    expect(wideView).toContain("Save");
    expect(lines.every((line) => visibleWidth(line) <= 42)).toBe(true);

    await harness.emit("ui_prompt_start", ctx);
    expect(harness.spawnCalls).toEqual([]);
    send(call.component, INPUT.escape);
    await pending;

    await harness.emit("ui_prompt_start", ctx);
    expect(harness.spawnCalls.map((spawnCall) => spawnCall.args)).toEqual([
      ["question"],
    ]);
  });

  test("cleans an unused prompt guard when settings close before the event", async () => {
    const harness = createHarness();
    const ctx = await harness.start();
    const { pending, call } = await beginSettings(harness, ctx);

    send(call.component, INPUT.escape);
    await pending;
    await harness.emit("ui_prompt_start", ctx);

    expect(harness.spawnCalls.map((spawnCall) => spawnCall.args)).toEqual([
      ["question"],
    ]);
  });

  test("propagates Input focus, appends edits, and supports Tab navigation", async () => {
    const harness = createHarness({
      readTextFile: async () => JSON.stringify({ voice: "Alex" }),
    });
    const ctx = await harness.start();
    const { pending, call } = await beginSettings(harness, ctx);
    const component = call.component as Component & { focused: boolean };

    send(component, INPUT.enter);
    typeText(component, "a");
    expect(component.render(72).join("\n")).toContain("\u001b_pi:c\u0007");
    component.focused = false;
    expect(component.render(72).join("\n")).not.toContain("\u001b_pi:c\u0007");
    component.focused = true;
    expect(component.render(72).join("\n")).toContain("\u001b_pi:c\u0007");
    send(component, INPUT.enter);
    expect(component.render(72).join("\n")).toContain("Alexa");

    send(component, INPUT.tab);
    expect(component.render(72).some((line) => line.startsWith("> Rate"))).toBe(true);
    send(component, INPUT.shiftTab);
    expect(component.render(72).some((line) => line.startsWith("> Voice"))).toBe(true);

    send(component, INPUT.enter);
    typeText(component, " discarded");
    send(component, INPUT.escape);
    expect(component.render(72).join("\n")).toContain("Alexa");
    expect(component.render(72).join("\n")).not.toContain("discarded");
    send(component, INPUT.escape);
    await pending;
    expect(harness.configWrites).toEqual([]);
  });

  test("stages Reset and discards it on Cancel", async () => {
    const harness = createHarness({
      readTextFile: async () =>
        JSON.stringify({
          voice: "Alex",
          rate: 120,
          finishedPhrase: "old finished",
          questionPhrase: "old question",
          suppressWhileMicrophoneInUse: false,
        }),
    });
    const ctx = await harness.start();
    const { pending, call } = await beginSettings(harness, ctx);

    expect(call.component.render(72).join("\n")).toContain("Alex");
    send(call.component, INPUT.up);
    send(call.component, INPUT.enter);
    const resetView = call.component.render(72).join("\n");
    expect(resetView).toContain("finished");
    expect(resetView).toContain("question");
    expect(resetView).toContain("on");

    send(call.component, INPUT.escape);
    await pending;
    expect(harness.configWrites).toEqual([]);

    await harness.emit("agent_settled", ctx);
    expect(harness.spawnCalls.map((spawnCall) => spawnCall.args)).toEqual([
      ["-v", "Alex", "-r", "120", "old finished"],
    ]);
  });

  test("validates, canonically saves, and immediately applies all settings", async () => {
    const harness = createHarness();
    const ctx = await harness.start();
    await harness.runCommand("pi-aware", ctx, "off");
    const { pending, call } = await beginSettings(harness, ctx);
    const component = call.component;

    send(component, INPUT.enter);
    typeText(component, " Samantha ");
    send(component, INPUT.enter);
    send(component, INPUT.down);
    send(component, INPUT.enter);
    typeText(component, " 210.5 ");
    send(component, INPUT.enter);
    send(component, INPUT.down);
    send(component, INPUT.enter);
    send(component, INPUT.end);
    send(component, INPUT.clearLine);
    typeText(component, " done ");
    send(component, INPUT.enter);
    send(component, INPUT.down);
    send(component, INPUT.enter);
    send(component, INPUT.end);
    send(component, INPUT.clearLine);
    typeText(component, " answer ");
    send(component, INPUT.enter);
    send(component, INPUT.down);
    send(component, INPUT.enter);
    send(component, INPUT.down);
    send(component, INPUT.enter);
    await pending;

    expect(harness.configWrites).toEqual([
      {
        path: "/agent/extensions/pi-aware/config.json",
        source: [
          "{",
          '  "voice": "Samantha",',
          '  "rate": 210.5,',
          '  "finishedPhrase": "done",',
          '  "questionPhrase": "answer",',
          '  "suppressWhileMicrophoneInUse": false',
          "}",
          "",
        ].join("\n"),
      },
    ]);
    expect(harness.notifications).toEqual([
      { message: "pi-aware: voice notifications disabled for this session.", type: "info" },
      { message: "pi-aware: settings saved and applied.", type: "info" },
    ]);

    await harness.emit("agent_settled", ctx);
    expect(harness.spawnCalls).toEqual([]);
    await harness.runCommand("pi-aware", ctx, "on");
    await harness.emit("ui_prompt_start", ctx);
    expect(harness.microphoneCheckCount()).toBe(0);
    expect(harness.spawnCalls.map((spawnCall) => spawnCall.args)).toEqual([
      ["-v", "Samantha", "-r", "210.5", "answer"],
    ]);
  });

  test("rejects a blank required phrase and keeps the form open", async () => {
    const harness = createHarness();
    const ctx = await harness.start();
    const { pending, call } = await beginSettings(harness, ctx);
    const component = call.component;

    send(component, INPUT.down);
    send(component, INPUT.down);
    send(component, INPUT.enter);
    send(component, INPUT.end);
    send(component, INPUT.clearLine);
    typeText(component, "   ");
    send(component, INPUT.enter);
    for (let index = 0; index < 3; index += 1) send(component, INPUT.down);
    send(component, INPUT.enter);

    expect(component.render(72).join("\n")).toContain(
      "Invalid settings: finishedPhrase must not be empty",
    );
    expect(harness.configWrites).toEqual([]);
    send(component, INPUT.escape);
    await pending;
  });

  test("keeps invalid settings open and performs no write", async () => {
    const harness = createHarness();
    const ctx = await harness.start();
    const { pending, call } = await beginSettings(harness, ctx);
    const component = call.component;

    send(component, INPUT.down);
    send(component, INPUT.enter);
    typeText(component, "not-a-rate");
    send(component, INPUT.enter);
    for (let index = 0; index < 4; index += 1) send(component, INPUT.down);
    send(component, INPUT.enter);

    expect(component.render(72).join("\n")).toContain(
      "Invalid settings: rate must be a positive finite number",
    );
    expect(harness.configWrites).toEqual([]);
    expect(harness.renderRequestCount()).toBeGreaterThan(0);

    for (let index = 0; index < 4; index += 1) send(component, INPUT.up);
    send(component, INPUT.enter);
    expect(component.render(72).join("\n")).toContain(
      "Invalid settings: rate must be a positive finite number",
    );
    send(component, INPUT.end);
    send(component, INPUT.clearLine);
    typeText(component, "180");
    expect(component.render(72).join("\n")).toContain(
      "Invalid settings: rate must be a positive finite number",
    );
    send(component, INPUT.enter);
    expect(component.render(72).join("\n")).not.toContain("Invalid settings:");

    send(component, INPUT.escape);
    await pending;
    expect(harness.notifications).toEqual([]);
  });

  test("retains active settings and reports the path when saving fails", async () => {
    const harness = createHarness({
      readTextFile: async () => JSON.stringify({ finishedPhrase: "still old" }),
      writeConfigFile: async () => {
        throw new Error("denied");
      },
    });
    const ctx = await harness.start();
    const { pending, call } = await beginSettings(harness, ctx);

    for (let index = 0; index < 5; index += 1) send(call.component, INPUT.down);
    send(call.component, INPUT.enter);
    await pending;

    expect(harness.configWrites).toHaveLength(1);
    expect(harness.notifications).toEqual([
      {
        message:
          "pi-aware: could not save settings at /agent/extensions/pi-aware/config.json; settings were not changed.",
        type: "error",
      },
    ]);
    await harness.emit("agent_settled", ctx);
    expect(harness.spawnCalls.map((spawnCall) => spawnCall.args)).toEqual([
      ["still old"],
    ]);
  });

  test("does not write a settings result made stale before persistence", async () => {
    const harness = createHarness();
    const ctx = await harness.start();
    const { pending, call } = await beginSettings(harness, ctx);

    await harness.emit("session_shutdown", ctx, { reason: "reload" });
    call.finish({
      finishedPhrase: "new",
      questionPhrase: "ask",
      suppressWhileMicrophoneInUse: false,
    });
    await pending;

    expect(harness.configWrites).toEqual([]);
    expect(harness.notifications).toEqual([]);
  });

  test("does not apply or notify after lifecycle replacement during a write", async () => {
    let resolveWrite: (() => void) | undefined;
    const harness = createHarness({
      writeConfigFile: async () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    });
    const ctx = await harness.start();
    const { pending, call } = await beginSettings(harness, ctx);

    call.finish({
      finishedPhrase: "new",
      questionPhrase: "ask",
      suppressWhileMicrophoneInUse: false,
    });
    await Promise.resolve();
    expect(harness.configWrites).toHaveLength(1);
    await harness.emit("session_shutdown", ctx, { reason: "reload" });
    resolveWrite?.();
    await pending;

    expect(harness.notifications).toEqual([]);
  });

  test("orders atomic writes and cleans the temporary file after replacement failure", async () => {
    const calls: string[] = [];
    let temporaryPath = "";
    const operations: AtomicConfigWriteOperations = {
      makeDirectory: async (path) => {
        calls.push(`mkdir:${path}`);
      },
      writeTemporary: async (path, source) => {
        temporaryPath = path;
        calls.push(`write:${path}:${source}`);
      },
      replaceFile: async (from, to) => {
        calls.push(`rename:${from}:${to}`);
      },
      removeFile: async (path) => {
        calls.push(`unlink:${path}`);
      },
    };

    await writeConfigFileAtomically("/agent/extensions/pi-aware/config.json", "{}\n", operations);
    expect(temporaryPath).toMatch(
      /^\/agent\/extensions\/pi-aware\/\.config\.json\.\d+\.[0-9a-f-]+\.tmp$/,
    );
    expect(calls).toEqual([
      "mkdir:/agent/extensions/pi-aware",
      `write:${temporaryPath}:{}\n`,
      `rename:${temporaryPath}:/agent/extensions/pi-aware/config.json`,
    ]);

    calls.length = 0;
    const replacementError = new Error("replacement failed");
    operations.replaceFile = async (from, to) => {
      calls.push(`rename:${from}:${to}`);
      throw replacementError;
    };
    await expect(
      writeConfigFileAtomically("/agent/extensions/pi-aware/config.json", "next\n", operations),
    ).rejects.toBe(replacementError);
    const failedTemporaryPath = calls[1]?.slice("write:".length, -":next\n".length);
    expect(calls).toEqual([
      "mkdir:/agent/extensions/pi-aware",
      `write:${failedTemporaryPath}:next\n`,
      `rename:${failedTemporaryPath}:/agent/extensions/pi-aware/config.json`,
      `unlink:${failedTemporaryPath}`,
    ]);
  });

  test("preserves the original atomic write error when cleanup also fails", async () => {
    const writeError = new Error("write failed");
    let cleanupCount = 0;
    const operations: AtomicConfigWriteOperations = {
      makeDirectory: async () => {},
      writeTemporary: async () => {
        throw writeError;
      },
      replaceFile: async () => {
        throw new Error("replacement should not run");
      },
      removeFile: async () => {
        cleanupCount += 1;
        throw new Error("cleanup failed");
      },
    };

    await expect(
      writeConfigFileAtomically("/agent/extensions/pi-aware/config.json", "{}\n", operations),
    ).rejects.toBe(writeError);
    expect(cleanupCount).toBe(1);
  });

  test("snapshots complete config for pending alerts and uses saved config later", async () => {
    let resolveMicrophone: ((value: boolean) => void) | undefined;
    let deferMicrophone = true;
    const harness = createHarness({
      readTextFile: async () =>
        JSON.stringify({
          voice: "Old",
          rate: 100,
          finishedPhrase: "old",
          suppressWhileMicrophoneInUse: true,
        }),
      detectMicrophoneInUse: async () => {
        if (!deferMicrophone) return false;
        return new Promise<boolean>((resolve) => {
          resolveMicrophone = resolve;
        });
      },
    });
    const ctx = await harness.start();
    const pendingAlert = harness.emit("agent_settled", ctx);
    await Promise.resolve();
    expect(harness.microphoneCheckCount()).toBe(1);

    const settings = await beginSettings(harness, ctx);
    settings.call.finish({
      voice: "New",
      rate: 250,
      finishedPhrase: "new",
      questionPhrase: "ask",
      suppressWhileMicrophoneInUse: false,
    });
    await settings.pending;
    deferMicrophone = false;
    resolveMicrophone?.(false);
    await pendingAlert;

    await harness.emit("agent_settled", ctx);
    expect(harness.microphoneCheckCount()).toBe(1);
    expect(harness.spawnCalls.map((spawnCall) => spawnCall.args)).toEqual([
      ["-v", "Old", "-r", "100", "old"],
      ["-v", "New", "-r", "250", "new"],
    ]);
  });
});
