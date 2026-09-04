# 260904-2305-speak-tmux-window-index - pi-aware implementation session

Date: 2026-09-04
Work item: `260904-2305-speak-tmux-window-index` (child of `260904-2205-tmux-aware-tts-notifications`)
Status: partial
In one line: Implemented and verified the initial pi-aware extension, then changed its spoken tmux identifier from pane index to current displayed window index.

## Goal

Create a lean macOS pi extension that announces blocking UI prompts and settled runs through text to speech, then refine it so tmux announcements use the current window number rather than the pane number.

## How we approached it

The session first consolidated prior discovery into a confirmed implementation contract. Implementation added the single TypeScript runtime, package metadata, license, README, and dependency-free Bun tests around an injected adapter seam. After the user requested window numbers, a child Quick Plan confirmed the exact `question 2` format, and targeted edits changed tmux lookup, tests, documentation, and metadata without disturbing the broader behavior.

## Key decisions

- **Use lifecycle events rather than text heuristics** - `ui_prompt_start` drives question alerts and `agent_settled` drives finished alerts, preserving stop-not-success semantics.
- **Use the displayed window index** - kept `TMUX_PANE` as the exact target but changed the format query to `#{window_index}`; rejected `window_id`, names, combined labels, and the spoken word `window`.
- **Keep tests dependency-free** - used Bun and an injected extension factory for config, environment, tmux, and process behavior.
- **Preserve a lean runtime** - retained one runtime source file, no runtime or development dependencies, and nonblocking overlapping speech.

## What did not work

- **Static pi value import in the Bun test environment** - the initial test run could not resolve the undeployed peer package from the runtime module; the production default now lazy-loads `getAgentDir` while type imports and injected tests remain dependency-free.
- **Piping Enter directly into the first TUI smoke** - EOF closed the session before the blocking prompt was observable; a controlled pseudo-terminal waited for the prompt, observed the new `say` process, then submitted Enter and cleaned up.

## Current state and where we left off

- Shipped/verified: Runtime, tests, README, package metadata, original plan progress, and the window-index child plan are staged. The child implementation tasks and approved host smoke are complete.
- Pending: No commit, push, remote installation, persistent-config smoke, or provider-backed real `agent_settled` smoke was performed. Spec lifecycle completion and archival remain for their owning workflow.

## Source of truth

- `extensions/pi-aware.ts`: Current runtime behavior and production adapters.
- `tests/pi-aware.test.ts`: Deterministic lifecycle, config, tmux, concurrency, and failure coverage.
- `README.md`: Current user-facing installation, behavior, configuration, and smoke guidance.
- `spec/active/260904-2205-tmux-aware-tts-notifications/plan.md`: Original implementation contract and recorded initial verification.
- `spec/active/260904-2305-speak-tmux-window-index/plan.md`: Confirmed window-index change and final execution notes.

## Verification

- Done: `bun test` passed 9 tests with 68 expectations; package metadata and `npm pack --dry-run` passed; stale pane-index terminology checks, runtime-file scope, spec validation, text checks, and `git diff --check` passed; `pi -e .` loaded without a provider call.
- Done: An approved no-provider tmux smoke observed live window index `2` and process command `/usr/bin/say question 2`, then exited cleanly and removed temporary files.
- Not verified yet: Published git installation, persistent config and reload on the host, real speech-failure recovery, and provider-backed settled-run behavior.

## Open questions, blockers, next safe action

- Open/blocked: The supplied GitHub remote is not configured or published, so remote installation cannot yet be verified. Provider-backed smoke remains cost-gated.
- Next safe action: Inspect the staged diff and run `bun test`, then use the repository's completion or commit workflow only when explicitly requested.

## Dynamic knowledge trail

- `wiki/pi-aware.md`: Topic-specific dynamic knowledge.
