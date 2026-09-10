# Outcome: interactive settings and explicit voice controls

Work item: `260910-1349-interactive-settings-and-explicit-voice-controls`
Disposition: completed
Date: 2026-09-10

## Delivered scope

- Bare `/pi-aware` opens a centered staged settings overlay for voice, rate, both phrases, and microphone suppression.
- `/pi-aware t`, `toggle`, `on`, `off`, and `status` provide explicit current-session voice controls with argument completion and bounded usage errors.
- Save validates and canonically persists the complete configuration through a same-directory temporary file and atomic rename, then applies it immediately when the lifecycle remains current.
- Cancel and staged Reset preserve persistent and runtime state until Save.
- The settings overlay suppresses only its own prompt announcement, while announcements snapshot persistent configuration and retain final session-toggle gates.
- Deterministic tests, package metadata, README guidance, verification evidence, and durable wiki memory were updated.

## Deviations from plan

- The peer-only Pi TUI import could not resolve in checkout tests. With explicit approval, Pi TUI remains a runtime peer at `"*"` and version 0.85.1 became the sole development dependency with `bun.lock`.
- Plain `pi -e .` restored an active session during the first automated smoke and briefly began unintended provider activity. With explicit approval, verification and documentation now use an ephemeral offline command that disables discovered resources and explicitly loads the extension.

## Verification summary

- `bun test` passed 34 tests with 187 expectations.
- Frozen dependency installation, package metadata, direct Pi TUI import, package dry run, spec validation, Markdown integrity, link, ASCII, and diff checks passed.
- Two isolated no-provider TUI smokes passed after the unsafe invocation was corrected.
- The final independent focused reviewer returned PASS with no blocking findings.

## Retained, reverted, or transferred work

- All planned implementation, test, package, documentation, verification, and wiki changes were retained.
- No implementation was reverted or transferred to another work item.

## Residual risks

- Real global configuration Save and restoration remain unverified because they require approval for host writes.
- Audible self-prompt and unrelated-prompt behavior remains unverified because audio is approval-gated.
- Intentional provider-backed `agent_settled`, remote installation, and publication remain unverified.
- Exact provider cost, if any, from the terminated first smoke attempt is unknown.

## Follow-up work items

- None created. Host-side and publication checks may be authorized separately without changing this delivered scope.

## Source references

- `extensions/pi-aware.ts`
- `tests/pi-aware.test.ts`
- `package.json`
- `bun.lock`
- `README.md`
- `verification.md`

## Wiki updates

- `wiki/pi-aware.md`
- `wiki/dreams/2026-09-10-1558-completed-session.md`
- `wiki/index.md`
- `wiki/log.md`
