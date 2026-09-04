# Pi extension configuration conventions

Status: Complete
Source date: 2026-09-04

## Question

How do established and official pi extensions locate extension-owned configuration?

## Findings

- `Fact`: There is no single enforced location for extension-owned configuration.
- `Fact`: Established extensions consistently use pi's exported `getAgentDir()` rather than hardcoding `~/.pi/agent`, so `PI_CODING_AGENT_DIR` and rebranded distributions are respected.
- `Fact`: `pi-tool-display` (275 GitHub stars when checked) stores global configuration at `<agent-dir>/extensions/pi-tool-display/config.json` and applies changes after `/reload`.
- `Fact`: `pi-context-prune` (231 GitHub stars when checked) stores project-independent settings at `<agent-dir>/context-prune/settings.json`.
- `Fact`: Pi's official preset example uses `<agent-dir>/presets.json` plus `<cwd>/.pi/presets.json`, with project entries overriding global entries.
- `Fact`: Pi's official sandbox example uses `<agent-dir>/extensions/sandbox.json` plus `<cwd>/.pi/sandbox.json`, with project settings merged over global settings.
- `Fact`: A small shared config library proposes `<agent-dir>/extensions/<extension-id>/config.json` and optional project config, but it is not itself widely adopted and would violate this extension's no-runtime-dependency goal.

## Interpretation

The stable ecosystem rule is to resolve the global root through `getAgentDir()`. The path below that root varies with scope and complexity. For this globally installed, project-independent extension, `<agent-dir>/extensions/<extension-id>/config.json` is collision-resistant, easy to document, and closely matches a prominent extension. Project overrides are not required by the stated product goal and would add trust and precedence rules.

## Recommendation

Use one optional global file at `<getAgentDir()>/extensions/<extension-id>/config.json`. The user subsequently selected the extension ID `pi-aware`, making the concrete path `<getAgentDir()>/extensions/pi-aware/config.json`. Do not add project-level configuration in version 1.

## Sources

- [pi-tool-display repository and configuration](https://github.com/MasuRii/pi-tool-display)
- [pi-context-prune repository and configuration](https://github.com/championswimmer/pi-context-prune)
- [Official pi preset extension example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/preset.ts)
- [Official pi sandbox extension example](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/sandbox/index.ts)
- [pi-ext-config conventions and trade-offs](https://github.com/graelo/pi-ext-config)
- [Pi configuration path helper](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/config.ts)
