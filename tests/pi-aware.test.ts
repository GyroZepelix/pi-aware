import { describe, expect, test } from "bun:test";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createPiAwareExtension,
  type PiAwareDependencies,
  type SpawnCallbacks,
  type SpawnOptions,
} from "../extensions/pi-aware.ts";

type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => unknown;

interface CommandOptions {
  description: string;
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
  const environment: Record<string, string | undefined> = {};

  const dependencies: PiAwareDependencies = {
    platform: "darwin",
    getAgentDir: () => "/agent",
    getEnv: (name) => environment[name],
    readTextFile: async (path) => {
      configReads.push(path);
      throw missingFile();
    },
    execFile: async (file, args) => {
      execCalls.push({ file, args });
      return "5\n";
    },
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

  const context = (mode: ExtensionContext["mode"] = "tui") =>
    ({
      mode,
      hasUI: mode === "tui" || mode === "rpc",
      ui: {
        notify(message: string, type?: string) {
          notifications.push({ message, type });
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
    args = "",
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
    environment,
    context,
    emit,
    start,
    runCommand,
  };
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
      "Toggle voice notifications for this session",
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
    ];

    for (const source of invalidSources) {
      const harness = createHarness({ readTextFile: async () => source });
      const ctx = await harness.start();
      await harness.emit("ui_prompt_start", ctx);

      expect(harness.notifications).toHaveLength(1);
      expect(harness.notifications[0]?.type).toBe("warning");
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
});
