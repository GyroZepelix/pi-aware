# 260910-1045-suppress-tts-while-microphone-is-active - microphone-aware speech suppression

Date: 2026-09-10
Work item: `260910-1045-suppress-tts-while-microphone-is-active`
Status: partial
In one line: Added and verified default-on CoreAudio microphone suppression for macOS 26 arm64, while controlled host audio checks and a Git checkpoint remain pending.

## Goal

Keep pi text-to-speech alerts from interrupting voice calls or recordings while preserving normal alerts when audio input is inactive or detection fails.

## How we approached it

The session first created a confirmed implementation plan covering any active audio input, a bundled first-party helper, fail-open diagnostics, macOS 26, and arm64-only support. Implementation added a CoreAudio C snapshot helper, a deterministic contributor build, a packaged executable, strict default-on configuration, lifecycle-safe TypeScript integration, regression tests, package constraints, and documentation. Independent review exposed ambiguous asynchronous toggle wording and native signing reproducibility issues; the user clarified final-state toggle and independent-warning semantics, after which the plan, tests, and build were corrected and re-reviewed. Durable runtime and packaging guidance was merged into the existing pi-aware wiki page.

## Key decisions

- **Detection boundary** - chose CoreAudio process objects and active-input state because the requirement applies to every microphone consumer; rejected app-name heuristics and older-device fallbacks.
- **Distribution** - chose a checked-in macOS 26 arm64 helper plus source and an explicit contributor build; rejected build-on-install because normal users should not need compiler tools.
- **Gate interaction** - speech requires the current manual toggle to allow it and the microphone snapshot to be inactive. A pending check uses the final toggle state, while detection warnings remain independent from voice gates.
- **Failure policy** - detection failures warn once, fail open for speech, and retry later; lifecycle-stale failures cannot warn through a newer context.
- **Verification boundary** - deterministic tests and native/package checks are primary evidence; Teams, audible, persistent-config, and provider-backed checks remain explicit approval gates.

## What did not work

- **Immediate deferred-test assertions** - two tests initially observed the call count before the async announcement reached detection; yielding one microtask made the test synchronize with the intended seam.
- **Temporary-path signing identity** - ad-hoc signing inherited a PID-suffixed helper identifier; a fixed identifier removed that instability.
- **Removing the Mach-O UUID** - produced repeatable output but macOS 26 dyld aborted the executable because `LC_UUID` is required. The corrected build derives a stable UUID from unsigned binary content before signing, preserving both execution and byte-identical rebuilds.
- **Initial review interpretation** - AC08 implied that any toggle invalidated pending work and suppressed warnings. User clarification established final-state toggle behavior and independent diagnostics, and the canonical plan was corrected before completion.

## Current state and where we left off

- Implemented/verified: source implementation, native helper, package metadata, documentation, durable wiki guidance, 19 Bun tests with 125 expectations, byte-identical native rebuilds, architecture and deployment metadata, UUID and signing, system-only linkage, package contents, helper status tokens, offline pi loading, and a final independent review with no findings.
- Pending: changes are uncommitted. A controlled Teams active-input suppression test, audible resumption, persistent config, and provider-backed lifecycle behavior were not run because they require explicit approval.

## Source of truth

- `spec/active/260910-1045-suppress-tts-while-microphone-is-active/plan.md`: confirmed requirements, decisions, tasks, and approval boundaries.
- `spec/active/260910-1045-suppress-tts-while-microphone-is-active/verification.md`: commands, failures, review reconciliation, passing evidence, and remaining gaps.
- `extensions/pi-aware.ts`: current configuration and announcement control flow.
- `native/pi-aware-mic-status.c` and `scripts/build-mic-status.sh`: CoreAudio snapshot and deterministic native build.
- `tests/pi-aware.test.ts`: deterministic behavior and race coverage.
- `wiki/pi-aware.md`: durable topic guidance.

## Verification

- Done: `bun test` passed 19 tests with 125 expectations; repeated native builds had matching hashes; helper architecture, macOS target, UUID, signature, linkage, execution, and package modes passed; package metadata and dry-run contents passed; spec, Markdown, link, and diff checks passed; offline no-provider TUI load passed; final focused review passed.
- Not verified yet: controlled Teams active-input and audible behavior, persistent global configuration, provider-backed settled behavior, remote install after these uncommitted changes are published.

## Open questions, blockers, next safe action

- Open/blocked: no implementation blocker; side-effecting host checks and publication require user approval.
- Next safe action: review the complete working-tree diff and create a user-controlled Git checkpoint. If desired, run the controlled Teams and audible smoke checks before publishing.

## Dynamic knowledge trail

- `wiki/pi-aware.md`: topic-specific dynamic knowledge.
