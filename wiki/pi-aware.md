# pi-aware extension

Load this page when changing the extension's alerts, tmux lookup, configuration, packaging, or tests.

## Runtime contract

- **Attention events are lifecycle-driven** - Announce `question` for every `ui_prompt_start` and `finished` for every `agent_settled`; do not infer questions from assistant prose. `finished` means automatic work stopped, including aborts and unrecoverable failures. ([source](../extensions/pi-aware.ts))
- **Announcements run only in macOS TUI sessions** - Other pi modes stay silent; interactive non-macOS sessions warn once and remain disabled. ([source](../extensions/pi-aware.ts))
- **Speak the current tmux window index** - Target the exact process pane through `TMUX_PANE`, query `#{window_index}` before every alert, and append only valid non-negative integer output. Missing tmux state, lookup failure, or invalid output silently falls back to the phrase without a number. ([source](../extensions/pi-aware.ts))
- **Speech is asynchronous and may overlap** - Launch `/usr/bin/say` without a shell or playback wait. A spawn error or unsuccessful exit warns once and disables later speech until reload or session replacement. ([source](../extensions/pi-aware.ts))

## Configuration

- **Configuration is global and reload-based** - Read `<getAgentDir()>/extensions/pi-aware/config.json` at `session_start`; do not add project config or file watching without a new decision. ([source](../extensions/pi-aware.ts))
- **Validation is strict and all-or-default** - The only optional keys are `voice`, `rate`, `finishedPhrase`, and `questionPhrase`. Unknown or invalid fields reject the entire file, warn once, and use defaults; a missing file silently uses defaults. ([source](../extensions/pi-aware.ts))

## Package and testing

- **Keep one runtime file and no development dependencies** - The package exposes `extensions/pi-aware.ts`; Bun's built-in runner exercises the injected filesystem, environment, process, and lifecycle adapters. ([manifest](../package.json), [tests](../tests/pi-aware.test.ts))
- **Keep the pi value import lazy** - The default extension dynamically imports `getAgentDir` so dependency-free Bun tests can import the runtime without resolving the undeployed peer package. Type-only pi imports remain static. ([source](../extensions/pi-aware.ts), [tests](../tests/pi-aware.test.ts))
- **Verify at both seams** - Run `bun test` for deterministic behavior, then use `pi -e .` for no-provider loading. Real audio or provider-backed lifecycle checks require explicit approval because they produce host side effects or provider cost. ([README](../README.md))
