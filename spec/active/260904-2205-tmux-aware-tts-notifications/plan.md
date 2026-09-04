# Plan: tmux-aware TTS notifications

Work item: `260904-2205-tmux-aware-tts-notifications`
Status: Planned
Created: 2026-09-04
Updated: 2026-09-04

## Goal

Deliver `pi-aware` version `0.1.0`, an extremely lean, public macOS pi extension that uses text to speech to identify an interactive pi session needing attention, including its current displayed tmux pane index when available.

## Context

- The repository currently contains spec and wiki scaffolding only. There is no implementation or existing test convention.
- Pi extensions are TypeScript modules. Git-installed pi packages can expose them through an explicit `package.json` `pi.extensions` manifest.
- Pi 0.84.4 introduced `ui_prompt_start`; pi 0.80.4 introduced `agent_settled`. Full planned behavior therefore requires pi 0.84.4 or newer.
- `ui_prompt_start` covers all blocking extension UI, not only literal questions. This broad trigger is accepted.
- `agent_settled` means no automatic continuation remains and also fires after aborts or unrecoverable failures. The word `finished` intentionally carries that meaning rather than success-only semantics.
- tmux exposes a stable pane ID through `TMUX_PANE`; querying `#{pane_index}` at announcement time yields the current displayed pane index.
- macOS supplies `/usr/bin/say`, including optional voice and rate arguments.
- Detailed evidence remains in [discovery.md](./discovery.md) and [research/index.md](./research/index.md).

## Requirements

- R01: Publish a git-installable pi package named `pi-aware`, version `0.1.0`, with an explicit manifest for exactly one runtime extension at `extensions/pi-aware.ts`.
- R02: Keep all runtime implementation in `extensions/pi-aware.ts`. It must default-export a valid pi extension and may expose only the small named factory and types needed for deterministic tests.
- R03: Add no third-party runtime or development dependencies. The manifest may declare the pi coding-agent package as the `"*"` peer recommended by pi package documentation.
- R04: Enable announcements only when `ctx.mode === "tui"` on macOS. Other pi modes must remain silent. An interactive non-macOS session must receive one warning and no speech behavior.
- R05: Announce every `ui_prompt_start` with the configured question phrase and every `agent_settled` with the configured finished phrase, including settled runs ending in abort or unrecoverable error.
- R06: Do not inspect assistant prose or punctuation to classify ordinary questions. A prose question in a final assistant response receives only the settled announcement.
- R07: Before every announcement, when `TMUX_PANE` is present, query tmux for that pane's current `#{pane_index}`. Append the index to the phrase when the lookup returns a valid non-negative integer.
- R08: Outside tmux, or when pane lookup fails or returns invalid output, speak the event phrase without a number and without a tmux warning.
- R09: Launch `/usr/bin/say` without a shell and without waiting for speech playback to finish. Pass configured phrase, voice, and rate only as process arguments. Omitted voice or rate must preserve the macOS system default.
- R10: Allow simultaneous announcements to overlap. Do not add locks, queues, cross-process coordination, or cancellation of other speech processes.
- R11: Read one optional global config file from `<getAgentDir()>/extensions/pi-aware/config.json` during `session_start`; configuration changes take effect through pi's normal `/reload` lifecycle. Do not read project configuration or watch the file.
- R12: Support only these optional flat config keys: `voice`, `rate`, `finishedPhrase`, and `questionPhrase`. Defaults are `finished` and `question`, with voice and rate omitted.
- R13: Trim configured strings and require each supplied string to remain non-empty. Require `rate` to be a positive finite number. Require the parsed root to be a JSON object and reject unknown keys.
- R14: A missing config file must silently use defaults. Any other read error, malformed JSON, invalid field, or unknown key must produce one TUI warning and use the entire default configuration rather than partially applying values.
- R15: If `/usr/bin/say` cannot spawn or exits unsuccessfully, issue at most one warning and disable further speech attempts for that extension runtime. `/reload` or session replacement may restore attempts.
- R16: Guard asynchronous speech callbacks after `session_shutdown` so stale extension contexts are not used. Do not cancel speech already playing during normal reload or session replacement.
- R17: Document macOS and pi 0.84.4 requirements, behavior, accepted semantics, configuration, SSH git installation, local development, and manual smoke testing.
- R18: Ship the standard MIT license with copyright `GyroZepelix`.
- R19: Provide focused Bun tests with no test dependencies, using an injected extension factory to cover deterministic behavior without producing real speech.

## Out of scope

- Non-macOS speech backends.
- Speech in pi print, JSON, or RPC modes.
- Heuristic detection of questions in assistant prose.
- Terminal application, window, tab, or tmux pane autofocus.
- Window-plus-pane labels, stable `%N` pane IDs, or pi session names in speech.
- Project-local configuration, config merging, environment-variable configuration, file watching, or interactive settings UI.
- Per-event enable toggles or a separate stopped/error phrase.
- Cross-pane queuing, deduplication, serialization, or newest-wins cancellation.
- Runtime pi-version checks or package-level enforcement of pi 0.84.4.
- npm publication, compiled JavaScript artifacts, migrations, external writes, remote creation, commits, or pushes.
- A broad terminal emulator, voice, or operating-system test matrix.

## Assumptions

- A user installing from GitHub has access to `git@github.com:GyroZepelix/pi-aware.git`; revisit if the configured or published remote differs.
- The current checkout's missing git remote does not block implementation, local loading, or package-shape verification. Remote installation verification remains deferred until the user creates and publishes that remote.
- `tmux` is callable from the inherited environment when `TMUX_PANE` is set. Failure is safe because R08 requires no-number fallback.
- Installed macOS voice names vary by host. A configured but unavailable voice is delegated to `/usr/bin/say` and follows R15.
- Contributors running automated tests have Bun available. Revisit test tooling if Bun is not available in the intended development environment.

## Design

### Package surface

Create a minimal `package.json` containing:

- `name: "pi-aware"`
- `version: "0.1.0"`
- `type: "module"`
- `license: "MIT"`
- the `pi-package` keyword
- repository metadata for `git@github.com:GyroZepelix/pi-aware.git`
- `pi.extensions: ["./extensions/pi-aware.ts"]`
- a `bun test` script
- `@earendil-works/pi-coding-agent: "*"` as a peer dependency
- no `dependencies` or `devDependencies`

The README must show the corresponding SSH installation command:

```text
pi install git:git@github.com:GyroZepelix/pi-aware.git
```

It must also show local loading with `pi -e .` and explain that the remote install cannot be validated until the remote exists.

### Extension and test seam

`extensions/pi-aware.ts` must provide:

1. A default production extension factory for pi auto-loading.
2. A small named factory that accepts adapters for platform, environment, config reads, tmux lookup, and speech process launching.
3. Minimal named types or pure helpers only where tests require them.

The production default must bind those adapters to Node built-ins, pi's `getAgentDir()`, the current process environment, the `tmux` executable, and `/usr/bin/say`. The injection surface is for tests, not an additional user-facing configuration API.

### Configuration lifecycle

At `session_start`:

1. Reset runtime-local warning, disabled, and shutdown state.
2. Return silently when the mode is not TUI.
3. Warn once and remain disabled when the platform is not macOS.
4. Resolve `<getAgentDir()>/extensions/pi-aware/config.json`.
5. Use defaults for a missing file.
6. Parse and validate the whole document. On any other error, warn once and use all defaults.
7. Enable the two event handlers for the current runtime.

The accepted configuration shape is:

```json
{
  "voice": "Samantha",
  "rate": 200,
  "finishedPhrase": "finished",
  "questionPhrase": "question"
}
```

Every field is optional. Unknown fields invalidate the document. Configured strings are trimmed before storage and phrase construction.

### Announcement flow

For `ui_prompt_start`, request a question announcement. For `agent_settled`, request a finished announcement.

For each request:

1. Return if the runtime is inactive, shut down, or disabled after a speech failure.
2. Read the current `TMUX_PANE` value.
3. If present, invoke `tmux` with separate arguments equivalent to `display-message -p -t <pane-id> #{pane_index}`.
4. Accept only trimmed non-negative integer output; otherwise use no pane label.
5. Build `<trimmed phrase> <pane-index>` when an index exists, otherwise `<trimmed phrase>`.
6. Build `/usr/bin/say` arguments, adding `-v <voice>` and `-r <rate>` only when configured, then the phrase.
7. Spawn speech with ignored stdio and no shell. Do not await playback.
8. On spawn failure or unsuccessful exit, atomically mark speech disabled and issue at most one warning while the runtime context is still live.

Each announcement owns its own tmux lookup and speech process. No shared queue or cancellation policy is introduced.

### Shutdown behavior

A `session_shutdown` handler must mark the extension runtime inactive so delayed callbacks cannot use a stale UI context. Speech already started is allowed to finish because cancellation and cross-event coordination are out of scope.

## Decision Log

| ID | Scope | Decision | Rationale | Evidence | Revisit when |
| --- | --- | --- | --- | --- | --- |
| D-001, D-015, D-028 | Triggers | Speak `question` for every blocking extension UI and `finished` for every settled run, including aborts and errors. | Exact lifecycle hooks are reliable attention signals; their accepted meanings are broader than literal question and success. | `discovery.md`; installed pi extension types/runtime. | Pi exposes more semantic events or broad announcements become disruptive. |
| D-002, D-003, D-020, D-024 | tmux label | Resolve current pane index before each alert; omit it outside tmux or on lookup failure. | Matches the visible pane number while preserving alerts under fallback conditions. | `discovery.md`; tmux manual and local probe. | Duplicate indexes across windows or lookup overhead becomes problematic. |
| D-004, D-012, D-025, D-026, D-027, D-029, D-030 | Distribution | Ship public MIT `pi-aware` 0.1.0 as one runtime TypeScript extension with a minimal manifest and documented SSH git source. | Meets git installation and lean runtime goals with explicit package metadata. | `discovery.md`; pi package documentation. | npm publication, remote identity, or release history changes. |
| D-005, D-019 | Runtime scope | Run only in macOS TUI sessions; warn once and disable on interactive non-macOS hosts. | The product is for keyboard attention on a Mac and has no other backend. | `discovery.md`. | Noninteractive or non-macOS support is requested. |
| D-006, D-008 through D-013, D-016 through D-018 | Configuration | Use one strict optional global config with flat voice, rate, and phrase fields, loaded on session start and reload. | Gives bounded customization while preserving simple all-default failure behavior. | `discovery.md`; [config research](./research/config-conventions.md). | Project overrides, more fields, or forward-compatible schema evolution is needed. |
| D-007 | Concurrency | Allow speech overlap. | Avoids global coordination and cancellation complexity. | `discovery.md`. | Real multi-pane use proves overlap unusable. |
| D-014 | Focus | Do not autofocus terminals or panes. | Exact focus is terminal-specific and app activation can target the wrong window. | [focus research](./research/focus-behavior.md). | A separately scoped terminal-specific feature is approved. |
| D-021 | Speech failure | Warn once and disable speech until reload or session replacement. | Makes failure visible without repeated broken process launches. | `discovery.md`. | Failures prove transient in practice. |
| D-022 | Compatibility | Document pi 0.84.4 minimum without runtime enforcement. | This is the first version containing both required hooks and keeps code lean. | [compatibility research](./research/pi-compatibility.md). | Documentation alone proves insufficient. |
| D-023 | Verification | Use focused automated tests plus real macOS pi/tmux/say smoke testing. | Balances deterministic coverage with host integration evidence. | `discovery.md`. | Runtime scope or focus behavior expands. |
| TSG-001 | Test tooling | Use Bun's built-in test runner with no development dependencies. | The repository has no existing tooling and Bun is locally available. | Targeted To Spec confirmation. | Bun is unavailable for intended contributors or CI. |
| TSG-002 | Test seam | Use a small injected extension factory while retaining the normal default export. | Allows event, failure, and process behavior to be verified without real speech or brittle module mocks. | Targeted To Spec confirmation. | The seam becomes burdensome or an existing public harness replaces it. |

## Work breakdown

- [ ] T01: Establish the minimal package and legal surface.
  - Depends on: none
  - Scope: Add `package.json`, `LICENSE`, and only the ignore entry needed for generated local dependency output. Do not add runtime or development dependencies.
  - Expected areas: `package.json`, `LICENSE`, `.gitignore` if required
  - Acceptance: Package metadata matches R01, R03, and R18; the pi manifest references only `extensions/pi-aware.ts`.
  - Verification: Parse `package.json`, inspect the declared dependency sections, and run `npm pack --dry-run` without publishing.

- [ ] T02: Implement the complete extension behind the approved test seam.
  - Depends on: T01
  - Scope: Add the single runtime file, injected factory, strict config loading, lifecycle gates, tmux lookup, phrase and argument construction, nonblocking speech launch, failure disabling, and shutdown guard.
  - Expected areas: `extensions/pi-aware.ts`
  - Acceptance: R02 and R04 through R16 are observable through injected handlers and adapters; production commands use argument arrays and no shell.
  - Verification: Run the focused tests added by T03 and inspect process construction for shell-free execution.

- [ ] T03: Add focused deterministic tests.
  - Depends on: T02
  - Scope: Exercise the extension factory with fake pi registration, contexts, config reads, environment, tmux results, and speech processes. Do not invoke real tmux or speech.
  - Expected areas: `tests/pi-aware.test.ts`, `package.json` test script
  - Acceptance: Tests cover missing and valid config, malformed JSON, invalid fields, unknown keys, all-default fallback, mode/platform gates, both event hooks, settled abort/error semantics, pane lookup success/failure, phrase and say arguments, overlap, single-warning disable-after-failure, reset after session start, and stale-callback shutdown guards.
  - Verification: `bun test`

- [ ] T04: Document installation, configuration, semantics, and limitations.
  - Depends on: T02, T03
  - Scope: Add concise README sections for requirements, SSH git install, local loading, config path and schema, reload behavior, default phrases, tmux fallback, broad UI-prompt semantics, settled stop semantics, failure behavior, non-goals, tests, and manual smoke steps.
  - Expected areas: `README.md`
  - Acceptance: A user can install or locally load the package and configure all four fields without reading source; compatibility and accepted caveats are explicit.
  - Verification: Check commands and paths against `package.json`, the extension, pi package docs, and the supplied remote.

- [ ] T05: Run package, automated, and host smoke verification.
  - Depends on: T01, T02, T03, T04
  - Scope: Run non-publishing package checks and automated tests, then perform approved local macOS/TUI/tmux/say smoke checks. Do not create or push the remote. Obtain approval before any provider-backed smoke prompt that incurs cost.
  - Expected areas: no new runtime areas; update only this plan's Progress and Notes with verified results during implementation
  - Acceptance: All locally executable criteria pass or each blocked external/provider-backed check is explicitly recorded with owner and reason.
  - Verification: Commands and observations in the Verification plan.

## Acceptance criteria

- AC01: `package.json` identifies `pi-aware` 0.1.0, declares MIT, includes `pi-package`, and exposes exactly `./extensions/pi-aware.ts` through the pi manifest.
- AC02: The default export loads as a pi extension while the named injected factory supports deterministic tests; no second runtime source file exists.
- AC03: Non-TUI modes produce no speech. TUI on a non-macOS platform warns once and remains disabled.
- AC04: A blocking extension UI triggers `question 5` in pane index 5, and every settled run triggers `finished 5`, including abort and unrecoverable-error settlements.
- AC05: A plain assistant prose question is not separately classified and receives only the settled announcement.
- AC06: A missing `TMUX_PANE`, failed tmux command, nonzero tmux exit, or invalid pane output produces the phrase without a number and does not suppress speech.
- AC07: Pane index lookup occurs for every announcement, so changed indexes are reflected without reload.
- AC08: `/usr/bin/say` receives separate arguments for optional voice, optional rate, and the completed phrase; no shell command string is constructed and playback does not block the event handler.
- AC09: Concurrent events can create overlapping speech processes without shared coordination or cancellation.
- AC10: A missing config uses defaults silently. Every valid optional field applies after startup or `/reload`.
- AC11: Malformed JSON, a non-object root, empty strings, nonpositive or nonfinite rate, wrong field types, or unknown keys warns once and applies the entire default config.
- AC12: A speech spawn error or unsuccessful exit warns at most once, prevents later attempts in the same runtime, and can recover through a new `session_start` after reload or replacement.
- AC13: Delayed process callbacks after `session_shutdown` do not use a stale pi context and do not crash the extension.
- AC14: README documents macOS, pi 0.84.4, config and reload behavior, exact SSH install syntax, local loading, tests, smoke checks, accepted event semantics, and explicit non-goals.
- AC15: The MIT license names `GyroZepelix`.
- AC16: `bun test`, package-shape checks, repository text checks, and `git diff --check` pass.
- AC17: Remote installation is either verified after the user publishes the supplied remote or explicitly recorded as a non-blocking external prerequisite owned by the user.

## Testing decisions and seams

- Use Bun's built-in test runner. Do not add a test framework, TypeScript compiler dependency, or Node type dependency.
- Keep `extensions/pi-aware.ts` as the only runtime source. Its default export uses production adapters; a named factory accepts test adapters.
- Use a fake `ExtensionAPI` surface that captures `session_start`, `session_shutdown`, `ui_prompt_start`, and `agent_settled` handlers. Invoke those handlers with fake contexts to verify lifecycle wiring at the highest practical seam.
- Inject config reads rather than creating files under the real agent directory.
- Inject environment and tmux lookup results rather than depending on the test runner's tmux state.
- Inject speech child behavior, including spawn errors, nonzero exits, concurrent children, and delayed callbacks, so tests never produce audio.
- Assert executable names and argument arrays to prove shell-free handling of user-controlled config strings.
- Reserve real pi, tmux, and sound output for manual smoke verification.

## Verification plan

1. Run automated tests:

   ```text
   bun test
   ```

2. Check package metadata without publishing:

   ```text
   node -e 'const p=require("./package.json"); if (p.name!=="pi-aware" || p.version!=="0.1.0" || p.license!=="MIT" || JSON.stringify(p.pi?.extensions)!==JSON.stringify(["./extensions/pi-aware.ts"])) process.exit(1)'
   npm pack --dry-run
   ```

3. Check scope and formatting:

   ```text
   find extensions -type f -maxdepth 2 -print
   git diff --check
   ```

   Confirm that `extensions/pi-aware.ts` is the only runtime implementation file and that no `dependencies` or `devDependencies` were introduced.

4. Locally load the git package without installing or publishing it:

   ```text
   pi -e .
   ```

   Confirm pi lists the extension and starts without extension errors, then quit without a provider call.

5. In a macOS TUI inside tmux, with approval for any provider-backed call:

   - Trigger a blocking extension UI and hear `question <current-pane-index>`.
   - Complete a normal run and hear `finished <current-pane-index>` only after all automatic continuation settles.
   - Abort a run and confirm the accepted `finished <current-pane-index>` stop semantic.
   - Change or swap the pane index and confirm the next announcement uses the new index.

6. Verify configuration and fallback behavior:

   - Start with no config and confirm default phrases and system voice/rate.
   - Create a valid config in the documented global path, run `/reload`, and confirm voice, rate, and both phrases apply.
   - Use invalid config, run `/reload`, and confirm one warning plus all defaults.
   - Start outside tmux, or inject/induce tmux lookup failure where practical, and confirm no-number speech.
   - Induce a safe `say` failure with an unavailable configured voice where practical, confirm one warning and no later speech, then restore config and `/reload` to recover.

7. Treat the following as external or cost-bearing gates rather than silently expanding scope:

   - Do not create, configure, commit, or push `git@github.com:GyroZepelix/pi-aware.git` without explicit approval.
   - After the user publishes the remote, optionally verify `pi install git:git@github.com:GyroZepelix/pi-aware.git` with approval.
   - Do not incur a provider-backed smoke-test cost without approval.

## Risks and blockers

- `ui_prompt_start` may call a non-question custom settings UI or loader a question. This is accepted behavior and must be documented, not heuristically corrected.
- Pane indexes may repeat across tmux windows. The selected short phrase accepts this ambiguity; do not add window indexes without scope confirmation.
- A tmux pane may be attached to multiple terminal clients. This does not affect pane-index speech because autofocus is excluded.
- Speech failures are asynchronous. Mitigate duplicate warnings and stale contexts with runtime-local disabled, warned, and shutdown state.
- Two alerts can race before one failed child disables speech. This is an accepted consequence of overlap; tests should prove the extension remains stable and warns at most once.
- A custom phrase or voice is user-controlled process input. Mitigate command injection by using executable-and-argument process APIs with `shell: false` or equivalent.
- `package.json` causes pi to run `npm install` for git reconciliation. Keep the manifest dependency-free except for the documented pi peer.
- The supplied GitHub remote does not yet exist in local git configuration and may not yet be published. This blocks only remote installation verification, not implementation or local package validation.
- Real audio, available voices, and provider-backed events are host-dependent. Use deterministic automated adapters first and record any manual check that cannot be reproduced.

## Progress

- [x] Planning complete and confirmed.
- [ ] Implementation not started.
- [ ] Verification not run.

## Execution handoff

Use PI Agent in a fresh session with this prompt:

```text
Read this plan and its item.yaml completely.
Implement the work step by step while preserving Requirements, Out of scope, Decision Log, and Verification plan.
Update Progress and the Decision Log when confirmed implementation discoveries change the approach.
Run the specified verification before reporting completion.
Stop and ask before dependencies, migrations, destructive operations, external writes, commits, pushes, or scope expansion.
```

## Proposed durable knowledge updates

No wiki update is required during implementation. After implementation and verification, add durable package architecture or maintenance guidance only if it is likely to be reused beyond this small extension; otherwise retain the plan and later verification artifacts as the authoritative history.

## Notes

- Discovery evidence is preserved unchanged in [discovery.md](./discovery.md).
- Research evidence is preserved unchanged under [research/](./research/index.md).
- The plan contract was approved after targeted confirmation of Bun-only test tooling and the injected extension factory seam.
- No implementation, dependency installation, migration, remote operation, commit, push, or publication is part of this plan-writing workflow.
