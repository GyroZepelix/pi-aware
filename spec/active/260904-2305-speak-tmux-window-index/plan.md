# Plan: speak tmux window index

Work item: `260904-2305-speak-tmux-window-index`
Status: Planned
Created: 2026-09-04
Updated: 2026-09-04

## Goal

Change `pi-aware` so each tmux-aware announcement speaks the current displayed tmux window index instead of the current displayed pane index, while preserving the existing concise phrase format and all other behavior.

## Context

- The parent work item is [`260904-2205-tmux-aware-tts-notifications`](../260904-2205-tmux-aware-tts-notifications/plan.md).
- The current staged implementation in `extensions/pi-aware.ts` targets the stable `TMUX_PANE` value and queries tmux for `#{pane_index}` before every announcement.
- Tests in `tests/pi-aware.test.ts`, user documentation in `README.md`, and the package description in `package.json` consistently describe pane indexes.
- The current local tmux target demonstrates that these values are distinct: `#{window_index}` returned `2`, `#{pane_index}` returned `1`, and `#{window_id}` returned `@25`.
- The existing Bun suite passes 9 tests with 68 expectations before this change.
- The source, tests, and parent-plan progress are currently staged or modified in the working tree. Later implementation must preserve those existing changes and must not reset, unstage, or overwrite unrelated work.

## Requirements

- R01: Before every announcement inside tmux, query the containing window's current displayed `#{window_index}` using the stable `TMUX_PANE` value as the tmux target.
- R02: Keep the existing spoken format: `<phrase> <number>`, such as `question 2` and `finished 2`. Do not insert the word `window`.
- R03: Accept only trimmed non-negative integer tmux output. When `TMUX_PANE` is absent, lookup fails, or output is invalid, preserve the existing no-number fallback without warning.
- R04: Resolve the window index separately for every announcement so tmux renumbering, moves, or swaps are reflected without reloading pi.
- R05: Rename pane-specific internal function, variable, test, and documentation terminology to window-specific terminology where it describes the spoken index. Keep `TMUX_PANE` unchanged because it remains the stable lookup target.
- R06: Update the deterministic tests to assert the `#{window_index}` tmux format and window-index speech for both question and finished events, fallback cases, current-value refresh, and concurrent lookups.
- R07: Update `README.md`, its smoke-test instructions, and the `package.json` description so the public behavior consistently says window index rather than pane index.
- R08: Preserve version `0.1.0`, the package manifest, the injected test seam, config schema, lifecycle hooks, macOS/TUI gates, speech process behavior, overlap, failure handling, and shutdown behavior.
- R09: Add no dependencies and create no additional runtime files.

## Out of scope

- Speaking both window and pane indexes.
- Adding the word `window` to speech.
- Speaking tmux window names, stable `@N` window IDs, session names, or server names.
- Changing `TMUX_PANE` to a less precise or unstable target source.
- Changing question or finished trigger semantics, phrase configuration, voice, rate, reload behavior, or no-tmux fallback.
- Solving duplicate window indexes across separate tmux sessions.
- Introducing config migration, new options, dependencies, version enforcement, npm publication, remote writes, commits, or pushes.
- Reworking unrelated staged implementation or parent-plan history.

## Assumptions

- The user means tmux's displayed numeric `window_index`, not the stable internal `window_id`; revisit only if speech should use names or IDs instead.
- Version `0.1.0` remains appropriate because the initial implementation has not been published from the supplied remote; revisit if release history appears before implementation.
- `TMUX_PANE` remains available to select the exact pane and therefore its containing window. Lookup failure remains safe through the existing fallback.
- Window indexes can change through tmux renumbering and can repeat across sessions. The requested short phrase accepts that ambiguity and intentionally queries the current value for every alert.
- Bun remains the project test runner, and no external compatibility research is needed for this bounded tmux format substitution.

## Design

### Runtime lookup

Keep the existing lookup flow and process boundary, changing only the requested tmux format and pane-specific naming:

```text
tmux display-message -p -t "$TMUX_PANE" '#{window_index}'
```

`TMUX_PANE` is still the target because it identifies the current pi process's exact pane. tmux derives that pane's containing window and returns its displayed `window_index`. The current integer validation and silent fallback remain unchanged.

Rename `resolvePaneIndex`, `paneIndex`, and equivalent local names to `resolveWindowIndex`, `windowIndex`, or similarly clear window terminology. Do not rename the `paneId` target variable or the `TMUX_PANE` environment key, because those still represent a pane ID rather than the spoken result.

### Tests

Continue using the existing injected `PiAwareDependencies` seam. Update expected tmux arguments from `#{pane_index}` to `#{window_index}` and rename test fixtures and titles that describe returned indexes. Preserve all existing config, platform, lifecycle, concurrency, process-failure, and stale-callback coverage.

At least one test must return different window values on sequential announcements and assert that the spoken phrases change, proving lookup occurs per event. Fallback tests must continue to cover command errors, non-numeric output, negative output, whitespace, and zero.

### Documentation and metadata

Change public prose from pane index to window index in `README.md`, including requirements, behavior, and manual smoke steps. Keep references to `TMUX_PANE` where explaining lookup mechanics. Update the package description from tmux pane indexes to tmux window indexes without changing any other package contract.

## Decision Log

| ID | Scope | Decision | Rationale | Evidence | Revisit when |
| --- | --- | --- | --- | --- | --- |
| D-001 | Spoken identifier | Use displayed `#{window_index}` rather than `#{pane_index}` or `#{window_id}`. | The user explicitly wants the number of the window. | User confirmation; local tmux probe returned `window_index=2`, `pane_index=1`, `window_id=@25`. | The user requests a stable ID, name, or combined label. |
| D-002 | Phrase format | Continue speaking `question 2` and `finished 2` with no `window` word. | Preserves the concise current format and matches the confirmed option. | User confirmation. | The number alone proves ambiguous in real use. |
| D-003 | Targeting | Keep stable `TMUX_PANE` as the tmux command target. | It selects the exact process pane, from which tmux can derive the containing window. | `extensions/pi-aware.ts`; local tmux probe. | The process can no longer inherit a usable pane ID. |
| D-004 | Refresh and fallback | Query before every alert and silently omit the number on absence, failure, or invalid output. | Preserves proven behavior while reflecting window renumbering. | Parent plan; current source and tests. | Lookup latency or renumbering behavior becomes problematic. |
| D-005 | Compatibility | Keep package version `0.1.0` and all non-index behavior unchanged. | The current package is still the initial unpublished implementation, and the request is narrowly scoped. | `package.json`; parent plan; user-confirmed defaults. | A release is published before implementation. |
| D-006 | Verification | Reuse the injected test seam and Bun suite, then compare a no-provider host smoke with live `#{window_index}`. | Gives deterministic command and phrase coverage plus one real tmux integration signal. | `tests/pi-aware.test.ts`; baseline `bun test`. | The test seam or runtime process design changes. |

## Work breakdown

- [x] T01: Replace pane-index resolution with window-index resolution.
  - Depends on: none
  - Scope: Change the tmux format to `#{window_index}` and rename only result-related runtime symbols while preserving `TMUX_PANE`, validation, fallback, lifecycle, and speech behavior.
  - Expected areas: `extensions/pi-aware.ts`
  - Acceptance: Every tmux-aware announcement appends the current valid window index; no-tmux and lookup-failure alerts omit the number exactly as before.
  - Verification: Run `bun test` after T02 and inspect the command arguments for `tmux display-message -p -t <pane-id> #{window_index}`.

- [x] T02: Update deterministic tests for window semantics.
  - Depends on: T01
  - Scope: Replace pane-format expectations and pane-result terminology, preserve all unrelated coverage, and prove sequential and concurrent window lookups.
  - Expected areas: `tests/pi-aware.test.ts`
  - Acceptance: Tests fail against the old `#{pane_index}` implementation and pass against `#{window_index}` while retaining existing config, lifecycle, fallback, concurrency, and failure assertions.
  - Verification: `bun test`

- [x] T03: Align public documentation and package metadata.
  - Depends on: T01
  - Scope: Update pane-index behavior wording and smoke instructions to window-index wording; update only the package description in metadata.
  - Expected areas: `README.md`, `package.json`
  - Acceptance: User-facing text consistently describes the spoken window index, and legitimate references to the `TMUX_PANE` target remain intact.
  - Verification: Search affected files for stale `pane index`, `pane-index`, `pane indexes`, and `#{pane_index}` references, then inspect any remaining `TMUX_PANE` references for correctness.

- [x] T04: Run focused and package verification.
  - Depends on: T01, T02, T03
  - Scope: Run automated, package-shape, text, and local-load checks. Perform audible or provider-backed smoke checks only with explicit approval. Do not modify persistent pi config or publish/install remotely.
  - Expected areas: no new source areas; update this plan's Progress and Notes with actual results
  - Acceptance: All non-gated checks pass, and every skipped host, provider, or remote check is recorded without claiming success.
  - Verification: Use the Verification plan below.

## Acceptance criteria

- AC01: With `TMUX_PANE=%46` and tmux returning `2` for `#{window_index}`, both event paths speak `question 2` or `finished 2` as applicable.
- AC02: The tmux invocation uses executable `tmux` and separate arguments `display-message`, `-p`, `-t`, the inherited pane ID, and `#{window_index}`.
- AC03: Sequential announcements can speak different returned window indexes without `/reload`.
- AC04: Missing `TMUX_PANE`, command failure, non-numeric output, negative output, or empty output silently falls back to the configured phrase without a number; zero remains valid.
- AC05: No runtime query, test expectation, README behavior statement, smoke instruction, or package description still claims that the spoken number is a pane index.
- AC06: `TMUX_PANE` remains the stable target and is not incorrectly renamed or removed.
- AC07: Existing trigger, config, platform, lifecycle, concurrency, speech failure, shutdown, package, and dependency behavior remains unchanged.
- AC08: `bun test`, package metadata validation, `npm pack --dry-run`, text checks, and `git diff --check` pass.
- AC09: `pi -e .` loads without an extension error in an offline no-provider TUI check.
- AC10: If an audible tmux smoke is approved, its spoken number matches the live `#{window_index}` result. If it is not approved, the check is explicitly recorded as skipped.

## Testing decisions and seams

- Reuse `createPiAwareExtension` with injected environment, tmux execution, and speech adapters. Do not create a new test seam.
- Assert the complete tmux executable and argument array, not only the resulting spoken phrase.
- Preserve the test that changes the lookup result between consecutive announcements, renaming it to window terminology.
- Preserve concurrent lookup coverage to ensure changing the identifier does not introduce serialization.
- Preserve fallback cases and all unrelated regression tests.
- Keep real audio outside automated tests. A no-provider temporary blocking-UI extension may be used for an approved host smoke, with temporary files removed afterward.

## Verification plan

1. Run the focused suite:

   ```text
   bun test
   ```

2. Confirm package metadata and contents without publication:

   ```text
   node -e 'const p=require("./package.json"); if (p.name!=="pi-aware" || p.version!=="0.1.0" || !p.description.includes("window") || p.dependencies || p.devDependencies) process.exit(1)'
   npm pack --dry-run
   ```

3. Check runtime scope and stale terminology:

   ```text
   find extensions -maxdepth 2 -type f -print
   rg -n 'pane index|pane-index|pane indexes|pane_index' extensions tests README.md package.json
   rg -n 'window index|window-index|window indexes|window_index|TMUX_PANE' extensions tests README.md package.json
   git diff --check
   ```

   The first `rg` command should return no stale spoken-pane references. Review `TMUX_PANE` results from the second command as legitimate stable-target references.

4. Compare live tmux values without changing state:

   ```text
   tmux display-message -p -t "$TMUX_PANE" 'window_index=#{window_index} pane_index=#{pane_index}'
   ```

5. Load the package without a provider call:

   ```text
   pi -e .
   ```

   Confirm the extension loads without error, then quit.

6. With explicit approval for audible output, trigger one blocking UI in tmux and confirm the spoken number equals:

   ```text
   tmux display-message -p -t "$TMUX_PANE" '#{window_index}'
   ```

7. Do not run a provider-backed `agent_settled` smoke, modify persistent config, install from the unpublished remote, commit, or push without explicit approval. Record these checks as skipped when approval or prerequisites are absent.

## Risks and blockers

- Window indexes can change after tmux renumbering, moves, or swaps. Querying every event intentionally reports the current displayed value.
- Window indexes can repeat across tmux sessions, so a number may not globally identify a session. Adding session speech is explicitly out of scope.
- `TMUX_PANE` remains in the implementation and documentation as the target source even though the spoken result is a window index. Careful terminology and argument-level tests prevent an incorrect rename.
- Broad search-and-replace could damage legitimate pane-target logic or unrelated staged work. Make targeted edits and inspect the full diff.
- The original source and tests are staged but not represented at `HEAD`. Preserve index and working-tree state; do not reset or unstage existing changes.
- The GitHub remote remains unavailable or unconfigured, blocking only remote installation verification.
- Audible and provider-backed integration checks have side effects or cost and remain explicit approval gates.

## Progress

- [x] Planning complete and confirmed.
- [x] Runtime, tests, documentation, and package metadata updated.
- [x] Focused, package, terminology, local-load, tmux, and approved audible verification passed.

## Execution handoff

Use PI Agent in a fresh session with this prompt:

```text
Read spec/active/260904-2305-speak-tmux-window-index/plan.md and the adjacent item.yaml completely.
Implement one confirmed task at a time while preserving Requirements, Out of scope, Decision Log, Risks, and Verification plan.
Update Progress and add a confirmed Decision Log entry when implementation changes the approach.
Run focused checks during work and the plan's required verification before reporting completion.
Stop and ask before dependencies, migrations, destructive operations, external writes, commits, pushes, production actions, or scope expansion.
Preserve failures, skipped checks, deviations, and unverified areas instead of claiming completion.
```

## Proposed durable knowledge updates

No wiki update is required for this bounded behavior change. Keep current behavior documented in `README.md`; add wiki knowledge later only if broader architecture or maintenance guidance is established and independently verified.

## Notes

- Shared understanding was explicitly confirmed before item creation.
- Minor defaults are version `0.1.0`, no dependencies, no unrelated cleanup, and parent linkage to `260904-2205-tmux-aware-tts-notifications`.
- No external research was used. Current source, tests, the parent plan, and a read-only local tmux probe were sufficient planning evidence.
- Baseline verification: `bun test` passed 9 tests with 68 expectations before implementation.
- Planning must not alter the currently staged source implementation or its index state.
- Implementation changed only `extensions/pi-aware.ts`, `tests/pi-aware.test.ts`, `README.md`, and the `package.json` description. Existing staged work was preserved without reset or unstage operations.
- `bun test` passed 9 tests with 68 expectations. Package metadata validation, `npm pack --dry-run`, stale-terminology checks, runtime-file scope, and `git diff --check` passed.
- A real offline `pi -e .` TUI loaded without an extension error or provider call.
- The user approved the audible no-provider smoke. Live tmux reported window index `2`; the temporary blocking UI appeared; `/usr/bin/say question 2` was observed; pi exited successfully; temporary files were removed.
- Provider-backed, persistent-config, remote-installation, commit, and push operations were not run because they are unnecessary for this bounded change and remain approval-gated.
