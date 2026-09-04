# Pi lifecycle-hook compatibility

Status: Complete
Source date: 2026-09-04

## Question

What minimum pi version provides both lifecycle hooks required by pi-aware?

## Findings

- `Fact`: `agent_settled` was added in pi 0.80.4 on 2026-07-09.
- `Fact`: `ui_prompt_start` and `ui_prompt_end` were added in pi 0.84.4 on 2026-08-28.
- `Fact`: Both hooks are present in the locally installed pi 0.85.0 declarations and runtime.

## Interpretation

The complete selected behavior requires pi 0.84.4 or newer. Supporting older versions would require degraded behavior or runtime version branching, neither of which is part of the lean selected design.

## Recommendation

Document pi 0.84.4 or newer as a requirement. Do not add a runtime compatibility layer in version 1.

## Sources

- [Pi 0.84.4 release](https://github.com/earendil-works/pi/releases/tag/v0.84.4)
- [Current pi coding-agent changelog](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/CHANGELOG.md)
- Local installed `CHANGELOG.md`, `dist/core/extensions/types.d.ts`, and `dist/core/agent-session.js` for pi 0.85.0.
