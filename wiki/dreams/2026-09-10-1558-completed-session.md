# 260910-1349-interactive-settings-and-explicit-voice-controls - interactive settings and voice controls

Date: 2026-09-10
Work item: `260910-1349-interactive-settings-and-explicit-voice-controls`
Status: partial
In one line: Implemented and verified an in-Pi settings overlay, explicit session voice commands, atomic immediate configuration, and isolated no-provider smoke guidance; the Git checkpoint and approval-gated host checks remain pending.

## Goal

Make bare `/pi-aware` open a complete settings window while retaining explicit current-session voice controls and preserving microphone, lifecycle, and diagnostic behavior.

## How we approached it

The session selected the newly planned settings work item from four active plans and confirmed its package metadata gate. Implementation expanded the single extension source with a staged Pi TUI form, strict draft normalization, an injectable atomic writer, immediate runtime replacement, command completions, lifecycle-safe saves, one-shot suppression of the settings window's own prompt event, and complete announcement configuration snapshots. The test harness gained custom-component input, write, lifecycle, and atomic-operation seams. Two independent blocking reviews drove missing component coverage and corrected validation-error persistence before a final focused review passed. User documentation and durable pi-aware guidance were updated to match verified behavior.

## Key decisions

- **Local Pi TUI resolution** - kept Pi TUI as a runtime peer at `"*"` and added exact 0.85.1 as the sole development dependency because Bun could not resolve the static peer import from the checkout without a local install.
- **Persistence ordering** - chose canonical temporary write plus same-directory rename, then runtime replacement, so failed writes cannot apply an unsaved configuration.
- **Asynchronous behavior** - chose full configuration snapshots per announcement while retaining final session-toggle gates, preventing mixed old/new settings during tmux or microphone waits.
- **Settings prompt isolation** - chose a one-shot prompt guard rather than a broad settings-open speech gate so unrelated blocking UIs continue to announce.
- **Smoke safety** - chose an ephemeral offline Pi process with discovered resources disabled after plain local loading restored active work and caused unintended provider activity.

## What did not work

- **Peer-only development setup** - the first `bun test` could not resolve `@earendil-works/pi-tui`; the user approved an exact development pin and lockfile, after which direct imports and all tests passed.
- **Plain `pi -e .` smoke automation** - Pi restored an active session and interpreted scripted slash commands as steering, briefly starting provider activity before termination. The attempt verified nothing and any exact cost is unknown. The corrected isolated invocation passed twice.
- **Initial component evidence** - the first focused review found no direct proof for focus propagation, Tab and Shift-Tab, edit cancellation, prompt-guard cleanup, blank phrases, or atomic cleanup. Deterministic tests were added for each seam.
- **Premature validation-error clearing** - a second review found that entering edit mode hid an error before correction. Revalidation now keeps the error until the complete draft is valid, reset, or canceled.

## Current state and where we left off

- Implemented/verified: complete command grammar and completion, five-field centered settings overlay, Save/Cancel/Reset, validation persistence, atomic writer behavior, immediate application, session and diagnostic independence, lifecycle staleness, one-shot self-prompt suppression, per-alert snapshots, package peer and dev metadata, Bun lockfile, README guidance, 34 tests with 187 expectations, package checks, two isolated no-provider TUI smokes, and a final independent focused review with no blockers.
- Pending: all changes remain uncommitted. Real global configuration Save and restoration, audible behavior, intentional provider-backed settled behavior, and remote installation remain approval-gated and unverified.

## Source of truth

- `spec/archive/260910-1349-interactive-settings-and-explicit-voice-controls/plan.md`: implemented requirements, approved corrections, decisions, and completed tasks.
- `spec/archive/260910-1349-interactive-settings-and-explicit-voice-controls/verification.md`: checks, failed attempts, review reconciliation, acceptance evidence, and remaining uncertainty.
- `extensions/pi-aware.ts`: current command, settings, persistence, lifecycle, and announcement behavior.
- `tests/pi-aware.test.ts`: deterministic UI, command, writer, lifecycle, and regression evidence.
- `README.md` and `package.json`: user and package contracts.
- `wiki/pi-aware.md`: durable topic guidance.

## Verification

- Done: `bun test` passed 34 tests with 187 expectations; frozen installation, package metadata, direct Pi TUI import, package dry run, spec validation, Markdown checks, diff checks, and the isolated no-provider TUI smoke passed; the final focused reviewer returned PASS.
- Not verified yet: real global configuration writes, audible settings and unrelated-prompt behavior, intentional provider-backed lifecycle behavior, exact cost from the terminated accidental provider-active attempt, remote installation, and publication.

## Open questions, blockers, next safe action

- Open/blocked: no implementation blocker; host-side writes, audio, provider calls, and publication remain approval gates.
- Next safe action: review the complete working-tree diff and create a user-controlled Git checkpoint. Optionally authorize real Save/restoration and audible checks before publication.

## Dynamic knowledge trail

- `wiki/pi-aware.md`: topic-specific dynamic knowledge.
