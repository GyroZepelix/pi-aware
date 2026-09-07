# Plan: toggle per-session voice notifications

Work item: `260907-1141-toggle-per-session-voice-notifications`
Status: Planned
Created: 2026-09-07
Updated: 2026-09-07

## Goal

Add a `/pi-aware` command that lets a user disable or re-enable `pi-aware` voice notifications for the current in-memory Pi session, with concise UI-only status feedback and no persistent configuration change.

## Context

- The parent work item is [`260904-2205-tmux-aware-tts-notifications`](../260904-2205-tmux-aware-tts-notifications/plan.md). The current extension already speaks for `ui_prompt_start` and `agent_settled`, limits speech to macOS TUI sessions, resolves the current tmux window index per alert, and disables speech after a `/usr/bin/say` failure.
- `extensions/pi-aware.ts` keeps lifecycle, configuration, warning, and speech-failure state inside the extension factory closure. `session_start` resets runtime state and `session_shutdown` invalidates it.
- Pi's installed extension documentation supports factory-time slash-command registration through `pi.registerCommand(name, options)`. A command handler can provide non-blocking UI feedback through `ctx.ui.notify(message, "info")` without adding a session entry or invoking the model.
- Pi emits a fresh extension lifecycle for startup, reload, new session, resume, and fork. An intentionally in-memory toggle therefore resets to enabled whenever the extension receives `session_start`, including after `/reload`.
- The existing injected dependency factory and fake `ExtensionAPI` harness provide deterministic coverage without real tmux commands or speech. The baseline `bun test` run passes 9 tests with 68 expectations.
- The user confirmed enabled-by-default in-memory behavior, UI-only command feedback, and suppression of voice alerts only.

## Requirements

- R01: Register one extension command named `pi-aware`, invokable as `/pi-aware`, with a concise description that identifies it as the current-session voice-notification toggle.
- R02: Start every `session_start` with user-controlled voice notifications enabled. Keep the toggle only in extension memory and discard it on shutdown or runtime replacement; do not persist it in session entries, config, environment variables, or files.
- R03: Each `/pi-aware` invocation must invert the current user-controlled state and issue exactly one informational UI notification: `pi-aware: voice notifications disabled for this session.` when disabling or `pi-aware: voice notifications enabled for this session.` when enabling.
- R04: The command must not invoke `/usr/bin/say`, query tmux, trigger an agent turn, or produce a spoken confirmation.
- R05: While user-controlled notifications are disabled, both `ui_prompt_start` and `agent_settled` must return before tmux lookup or speech launch.
- R06: Recheck the user-controlled state after the asynchronous tmux lookup so an alert whose lookup is still pending cannot launch speech if notifications are disabled before the lookup resolves.
- R07: Re-enabling must restore normal question and finished announcements only when all existing runtime gates also allow speech.
- R08: Keep the user-controlled toggle independent from the existing `speechDisabled` failure latch. `/pi-aware` must not recover, clear, or bypass a `/usr/bin/say` failure; existing warning-once and reload-recovery behavior remains authoritative.
- R09: Disabling voice notifications must not suppress command feedback, invalid-config warnings, non-macOS warnings, or speech-failure warnings. It must not cancel speech processes that were already launched.
- R10: Preserve the current configuration schema, tmux window-index lookup and fallback, phrases, voice and rate handling, platform and mode gates, lifecycle triggers, overlapping speech policy, shutdown guards, package manifest, and dependency-free runtime.
- R11: Extend the deterministic Bun harness and tests to cover command registration, both toggle directions, suppression before lookup, suppression after an in-flight lookup, session-start reset, UI feedback, and independence from the speech-failure latch.
- R12: Update user documentation to describe `/pi-aware`, its enabled default, current-session and reload reset semantics, visible feedback, interaction with speech failures, and a no-provider manual check.

## Out of scope

- Persisting notification state across `/reload`, `/new`, `/resume`, `/fork`, process restart, or resumed sessions.
- Adding a config key, project-local override, environment variable, session entry, file write, settings UI, status widget, or keyboard shortcut for this toggle.
- Separate controls for question and finished announcements.
- Canceling or terminating speech that has already started.
- Using the toggle to recover from `/usr/bin/say` failures or changing existing failure warnings.
- Changing non-macOS or non-TUI speech behavior, tmux lookup behavior, phrase formatting, package version, or extension distribution.
- Adding dependencies, migrations, additional runtime files, unrelated refactors, commits, pushes, publication, or other external writes.

## Assumptions

- "Current running session" means the current in-memory extension runtime. The user confirmed that state need not persist, so every `session_start`, including `/reload`, resets the toggle to enabled. Revisit if toggle state must survive reload or session replacement.
- `/pi-aware` is an argument-free toggle. Any future explicit `on`, `off`, or `status` arguments require a separate behavior decision.
- Pi's normal duplicate-command suffix behavior is acceptable if another extension also registers `pi-aware`. Revisit only if a known collision appears in supported installations.
- The current pi minimum and installed command API remain valid. No package compatibility change is required for `registerCommand`.

## Design

### Runtime state and command

Add a clearly named user-controlled boolean beside the existing runtime-local state in `createPiAwareExtension`. Register `pi-aware` once when the extension factory runs, not from `session_start`, so lifecycle restarts do not accumulate registrations.

The command handler will:

1. Invert the user-controlled boolean.
2. Call `ctx.ui.notify` once with the exact enabled or disabled message and notification type `info`.
3. Return without invoking lifecycle handlers, tmux, speech, persistence, reload, or model work.

Reset the boolean to `true` at the start of every `session_start`. Keep it separate from `active`, `shutdown`, and `speechDisabled` so each state retains one responsibility:

- `active` and `shutdown` enforce platform, mode, and lifecycle eligibility.
- The new boolean represents the user's current-session preference.
- `speechDisabled` remains the safety latch for speech-process failures.

### Announcement gates and races

Add the user-controlled boolean to both existing announcement eligibility checks:

1. The initial check returns before `resolveWindowIndex`, proving disabled alerts do not call tmux.
2. The post-lookup check returns before argument construction and process spawning when the command disabled notifications while lookup was pending.

Do not attempt to stop a child process after `spawnProcess` has returned. Existing lifecycle-generation checks and asynchronous callback behavior remain unchanged.

### Test harness

Extend the fake Pi API to capture registered commands separately from event handlers and expose a helper that invokes the `pi-aware` handler with a fake command context. Keep production types as type-only imports so the dependency-free Bun runtime continues to load the source without resolving the undeployed peer package as a value import.

Focused tests will prove:

- The four existing lifecycle hooks remain registered and one `pi-aware` command is registered with a useful description.
- The first event after `session_start` still speaks by default.
- The first command invocation reports disabled, produces no speech itself, and prevents both event types from performing tmux lookup or speech launch.
- The second invocation reports enabled and subsequent events use the existing tmux and speech flow.
- A deferred tmux lookup cannot spawn speech when notifications are disabled before it resolves.
- A later `session_start` restores enabled behavior.
- Toggling off and on after a speech failure does not clear `speechDisabled` or create another speech attempt.
- Existing warning and lifecycle regression tests continue to pass.

### Documentation

Add `/pi-aware` to the README behavior and manual smoke instructions. State that it controls voice alerts only, starts enabled, resets after reload or session replacement, gives UI-only status, does not cancel speech already playing, and cannot clear a speech-failure disable. Keep configuration documentation unchanged because this feature is not a config field.

## Decision Log

| ID | Scope | Decision | Rationale | Evidence | Revisit when |
| --- | --- | --- | --- | --- | --- |
| D-001 | Command surface | Use `/pi-aware` as an argument-free toggle with exact UI-only enabled and disabled feedback. | Matches the requested interaction while remaining a minimal extension command. | User confirmation; installed Pi `docs/extensions.md` command API. | Explicit on/off/status arguments or a shortcut are requested. |
| D-002 | Lifecycle | Keep state only in memory and reset it to enabled on every `session_start`, including reload and session replacement. | The user selected enabled-per-session behavior and rejected persistence. | User confirmation; Pi extension lifecycle documentation. | State must survive reload, resume, fork, or process restart. |
| D-003 | Suppression | Suppress question and finished speech only, while retaining UI feedback and warnings. | The user selected voice-only suppression and existing diagnostics remain important. | User confirmation; current warning paths in `extensions/pi-aware.ts`. | Users request a fully silent extension mode. |
| D-004 | Failure isolation | Keep the manual toggle independent from `speechDisabled`. | A preference toggle must not bypass the established fail-safe after `/usr/bin/say` errors. | Current source, tests, and parent plan R15. | A separately designed retry or recovery command is requested. |
| D-005 | Async safety | Check the preference before and after tmux lookup, without canceling already-started speech. | Avoids unnecessary lookup and prevents a pending alert from launching after disable, while preserving the current non-canceling model. | Current two-stage announcement guard; confirmed scope. | Announcement cancellation or serialization is introduced. |
| D-006 | Verification | Extend the injected Bun seam and reserve real audio or provider-backed checks for explicit approval. | Deterministic tests can prove state and process behavior without host side effects or provider cost. | `tests/pi-aware.test.ts`; current README verification boundaries. | The runtime or command API cannot be exercised through the existing harness. |

## Work breakdown

- [x] T01: Add the session-local command and announcement gate.
  - Depends on: none
  - Scope: Register `/pi-aware`, add enabled-by-default user preference state, reset it on `session_start`, include it in both announcement checks, and preserve the independent speech-failure latch.
  - Expected areas: `extensions/pi-aware.ts`
  - Acceptance: The command toggles exact UI status, disabled events perform no tmux lookup or speech launch, pending lookups cannot launch while disabled, and re-enabled events retain all existing behavior.
  - Verification: Run the focused tests from T02 and inspect the command and announcement control flow.

- [x] T02: Extend deterministic command and lifecycle coverage.
  - Depends on: T01
  - Scope: Capture `registerCommand` in the existing harness and add focused tests for registration, default state, off/on transitions, feedback, pre-lookup suppression, in-flight suppression, session reset, and failure-latch independence without producing real audio.
  - Expected areas: `tests/pi-aware.test.ts`
  - Acceptance: New tests fail against the current commandless implementation, pass after T01, and all existing config, platform, tmux, concurrency, failure, and shutdown assertions remain green.
  - Verification: `bun test`

- [x] T03: Document the per-session toggle.
  - Depends on: T01, T02
  - Scope: Add concise behavior, lifecycle reset, failure interaction, and no-provider manual-check documentation without presenting the toggle as persistent configuration.
  - Expected areas: `README.md`
  - Acceptance: A user can discover `/pi-aware`, understand its exact state lifetime and feedback, and verify both directions without reading source.
  - Verification: Compare README claims with runtime and tests; search for `/pi-aware`, `enabled`, `disabled`, `reload`, and `speech` in the affected documentation.

- [x] T04: Run focused and package verification.
  - Depends on: T01, T02, T03
  - Scope: Run automated, source-scope, package, formatting, and no-provider local-load checks. Perform audible or provider-backed checks only after explicit approval.
  - Expected areas: no new runtime areas; record actual evidence in the later verification artifact and update this plan's Progress only as allowed by the implementation workflow
  - Acceptance: All non-gated checks pass, and skipped side-effecting or cost-bearing checks are explicitly recorded without claiming success.
  - Verification: Execute the Verification plan below.

## Acceptance criteria

- AC01: Pi exposes an extension command invokable as `/pi-aware` with a description identifying it as the current-session voice-notification toggle.
- AC02: A new `session_start` is enabled by default, and existing question and finished events behave exactly as before until the user toggles.
- AC03: The first `/pi-aware` invocation produces exactly one `info` notification saying `pi-aware: voice notifications disabled for this session.` and produces no tmux lookup or speech process.
- AC04: While disabled, both `ui_prompt_start` and `agent_settled` perform no tmux lookup and launch no `/usr/bin/say` process.
- AC05: If an event is waiting for tmux when `/pi-aware` disables notifications, resolving that lookup does not launch speech while the state remains disabled.
- AC06: The next `/pi-aware` invocation produces exactly one `info` notification saying `pi-aware: voice notifications enabled for this session.`, and later eligible events resume configured phrase, voice, rate, tmux, and overlap behavior.
- AC07: A subsequent `session_start`, including after reload or session replacement, resets the user-controlled state to enabled.
- AC08: Toggling after a simulated speech failure does not clear the warning-once failure latch or permit another speech attempt before a new `session_start`.
- AC09: Command feedback and existing warnings remain visible while voice alerts are manually disabled; already-launched speech is not canceled.
- AC10: No config field, persisted session entry, environment variable, dependency, package-version change, or additional runtime file is introduced.
- AC11: README behavior and smoke instructions accurately describe the command, enabled default, reset boundary, UI-only feedback, and failure-latch interaction.
- AC12: `bun test`, package-shape checks, runtime-file scope checks, documentation checks, `git diff --check`, and the no-provider local-load check pass.

## Testing decisions and seams

- Reuse `createPiAwareExtension` and the current injected adapters. Do not add a second runtime module or a new test framework.
- Extend the fake `ExtensionAPI` with `registerCommand` capture and invoke the captured handler directly through a fake TUI command context.
- Keep event handlers and command handlers in separate harness maps so the existing assertion about exactly four lifecycle hooks remains meaningful.
- Assert both absence of `execCalls` and absence of `spawnCalls` while disabled, not only missing audio process calls.
- Use a deferred `execFile` promise to test the post-lookup guard deterministically.
- Drive a second `session_start` through the existing harness to verify reset semantics without persisting state.
- Simulate speech-process callbacks to prove command toggles do not bypass `speechDisabled`.
- Automated tests must not execute real tmux, `/usr/bin/say`, reload, providers, or filesystem config writes.

## Verification plan

1. Run the focused test suite:

   ```text
   bun test
   ```

2. Confirm the command, exact feedback, documentation, and bounded runtime surface:

   ```text
   rg -n 'registerCommand\("pi-aware"|voice notifications (enabled|disabled)|/pi-aware' extensions/pi-aware.ts tests/pi-aware.test.ts README.md
   find extensions -maxdepth 2 -type f -print
   ```

   Confirm `extensions/pi-aware.ts` remains the only runtime implementation file.

3. Confirm package metadata and the no-dependency contract without publishing:

   ```text
   node -e 'const p=require("./package.json"); if (JSON.stringify(p.pi?.extensions)!==JSON.stringify(["./extensions/pi-aware.ts"]) || p.dependencies || p.devDependencies) process.exit(1)'
   npm pack --dry-run
   ```

4. Check formatting and unintended changes:

   ```text
   git diff --check
   git status --short
   ```

   Inspect the diff and confirm implementation changes are limited to `extensions/pi-aware.ts`, `tests/pi-aware.test.ts`, `README.md`, and later lifecycle artifacts under this work item or explicitly required wiki updates.

5. Load the checkout without a provider call:

   ```text
   pi -e .
   ```

   Run `/pi-aware` twice and confirm the disabled and enabled info messages appear in order, with no spoken command confirmation or extension-load error, then quit without sending a provider prompt.

6. Treat real audio and provider-backed lifecycle checks as approval gates:

   - With explicit approval for audible output, disable notifications, trigger a no-provider blocking UI, and confirm no question speech; re-enable and confirm the next equivalent UI can speak.
   - Do not make a provider-backed prompt solely to test `agent_settled` without explicit cost approval.
   - Do not modify persistent global config, install or publish remotely, commit, or push without explicit approval.

## Risks and blockers

- The existing `speechDisabled` name can be mistaken for the new user preference. Mitigate by using distinct state names and tests proving the failure latch remains independent.
- `resolveWindowIndex` is asynchronous. A single pre-lookup check would permit speech after a mid-lookup disable, so retain a post-lookup preference check and a deferred-promise test.
- Speech already launched may continue after the user disables notifications. This is explicit, documented behavior; process tracking and cancellation remain out of scope.
- Pi can suffix duplicate extension command names when another extension registers `pi-aware`. This does not block the package's own registration but may change the displayed invocation in a conflicting installation.
- `/reload` rebuilds the extension runtime and therefore resets the in-memory toggle. Documentation and tests must prevent users from mistaking it for persistent configuration.
- Real audio and provider-backed `agent_settled` checks have host side effects or cost. Deterministic adapters provide primary coverage, and manual checks remain approval-gated.
- The two older active plans describe already-implemented behavior but remain in `planned` status. Use current source at HEAD as behavior authority and link this item to the original parent without rewriting older lifecycle history.

## Progress

- [x] Planning complete and confirmed.
- [x] Runtime, deterministic tests, and README documentation implemented.
- [x] All non-gated automated, package, formatting, and no-provider TUI checks passed.
- [ ] Audible suppression and provider-backed lifecycle smoke checks were not run because they remain approval-gated.

## Execution handoff

Use PI Agent in a fresh session with this prompt:

```text
Read spec/active/260907-1141-toggle-per-session-voice-notifications/plan.md and the adjacent item.yaml completely.
Implement one confirmed task at a time while preserving Requirements, Out of scope, Decision Log, Risks, and Verification plan.
Update Progress and add a confirmed Decision Log entry when implementation changes the approach.
Run focused checks during work and the plan's required verification before reporting completion.
Stop and ask before dependencies, migrations, destructive operations, external writes, commits, pushes, production actions, or scope expansion.
Preserve failures, skipped checks, deviations, and unverified areas instead of claiming completion.
```

## Proposed durable knowledge updates

After implementation and verification establish current behavior, update `wiki/pi-aware.md` to record the `/pi-aware` command, its enabled-by-default in-memory lifecycle, voice-only suppression, and independence from the speech-failure latch. Do not update the wiki during planning.

## Notes

- Shared understanding was explicitly confirmed before item creation.
- Confirmed defaults are enabled on every `session_start`, UI-only command feedback, voice-alert-only suppression, and no persistence.
- Minor defaults exclude explicit command arguments, unrelated cleanup, dependencies, migrations, external writes, commits, pushes, publication, and production actions.
- Planning evidence came from current source, tests, package metadata, README, the two relevant active plans, `wiki/pi-aware.md`, and the installed official Pi extension documentation and command examples. No web research or external source was required.
- Baseline verification before planning: `bun test` passed 9 tests with 68 expectations.
- The working tree was clean before item creation. Planning changed only managed files under `spec/`.
- The planning phase performed no implementation. Implementation later changed `extensions/pi-aware.ts`, `tests/pi-aware.test.ts`, and `README.md`, then updated `wiki/pi-aware.md` and `wiki/log.md` with verified durable behavior.
- `bun test` passed 12 tests with 82 expectations. Package metadata, `npm pack --dry-run`, runtime-file scope, documentation terms and fences, and `git diff --check` passed.
- The first automated nested-TUI attempt sent input before editor initialization and did not dispatch the command. A corrected no-provider run waited for the extension-load marker, then observed disabled and enabled feedback in order and exited cleanly without audio.
- Audible suppression and provider-backed `agent_settled` smoke checks were not run because they remain approval-gated. No dependency installation, migration, persistent config write, provider call, commit, push, publication, or other external action was performed.
