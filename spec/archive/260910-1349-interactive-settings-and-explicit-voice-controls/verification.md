# Verification: interactive settings and explicit voice controls

Work item: `260910-1349-interactive-settings-and-explicit-voice-controls`
Date: 2026-09-10

## Environment

- Mode: direct
- Starting HEAD: `1cceac9ed8dde4d5d6424db7d2e233a394490b9f`
- Initial staged changes: `item.yaml`, `plan.md`, and managed `spec/index.md` from the confirmed planning pass
- Initial source changes: none
- Platform: macOS arm64 repository checkout
- Reference Pi packages: `@earendil-works/pi-coding-agent` 0.85.1 and `@earendil-works/pi-tui` 0.85.1

## Changed paths

- `extensions/pi-aware.ts`: command grammar and completions, settings overlay, staged validation, atomic writer, immediate apply, one-shot self-prompt suppression, lifecycle guards, and per-announcement config snapshots
- `tests/pi-aware.test.ts`: deterministic command, UI component, persistence, atomic operation, lifecycle, snapshot, and regression coverage
- `package.json`: Pi TUI runtime peer plus approved exact development pin
- `bun.lock`: reproducible development dependency resolution
- `README.md`: settings, commands, persistence, reload semantics, and isolated smoke guidance
- `spec/archive/260910-1349-interactive-settings-and-explicit-voice-controls/plan.md`: approved D-010 and D-011 corrections plus completed progress
- `spec/archive/260910-1349-interactive-settings-and-explicit-voice-controls/verification.md`: this evidence
- `spec/archive/260910-1349-interactive-settings-and-explicit-voice-controls/item.yaml` and `spec/index.md`: preserved managed planning artifacts

## Commands and checks

| Check | Result | Evidence |
| --- | --- | --- |
| Resolve selected item | PASS | Helper resolved this active item in `planned` status and direct mode. |
| Starting checkpoint and status | PASS | `git rev-parse HEAD` returned `1cceac9ed8dde4d5d6424db7d2e233a394490b9f`; only staged planning artifacts existed before source work. |
| Pi TUI approval | PASS | User approved the peer metadata change, then approved exact Pi TUI 0.85.1 as the sole development dependency after the peer-only resolution failure. |
| `bun add --dev @earendil-works/pi-tui@0.85.1` | PASS with note | Installed the approved local development dependency and wrote `bun.lock`; Bun reported two blocked transitive postinstalls. Tests and import checks do not require them. |
| `bun test` | PASS | Final run passed 34 tests with 187 expectations. No real speech, microphone helper, tmux, provider, agent config, or production writer was used. |
| Package metadata assertion | PASS | Both Pi packages are runtime peers at `"*"`; Pi TUI 0.85.1 is the sole dev dependency; there are no runtime dependencies; one extension entry remains. |
| `bun install --frozen-lockfile` | PASS | Checked 128 installs across 161 packages with no lockfile change. |
| Direct Pi TUI import | PASS | Bun imported `Input` and confirmed it is a function. |
| `npm pack --dry-run` | PASS | Included `extensions/pi-aware.ts`, `bun.lock`, the arm64 helper, native C source, build script, README, and existing package contents; no publication occurred. |
| Command/UI source scan | PASS | `rg` found command registration, completions, exact saved and usage messages, `ctx.ui.custom`, and overlay configuration in source/tests/docs. |
| Extension source count | PASS | `find extensions -maxdepth 2 -type f -print` returned only `extensions/pi-aware.ts`. |
| `git diff --check` | PASS | No whitespace errors in the complete working tree diff. |
| Spec item validation | PASS | `uv run spec/scripts/manage-spec-item.py --root . validate --item 260910-1349-interactive-settings-and-explicit-voice-controls` reported valid. |
| Markdown checks | PASS | README and plan have balanced fences, ASCII text, and resolving changed relative links. |
| Isolated no-provider TUI smoke | PASS | A PTY run using `pi --no-session --offline --approve --no-extensions -e extensions/pi-aware.ts --no-skills --no-prompt-templates --no-context-files` verified disabled/enabled feedback and the `pi-aware settings` overlay, then canceled without Save. No steering or LLM markers appeared. The final smoke was repeated after material UI changes and passed. |
| Independent focused review | PASS | Final read-only reviewer inspected the complete checkpoint diff, plan, instructions, checks, source, tests, docs, metadata, lockfile, and evidence; verdict PASS with no blocking findings. |

## Requirement coverage

| Requirement | Evidence | Status |
| --- | --- | --- |
| R01-R02 | One command remains; description changed; blank arguments dispatch the centered blocking overlay only in TUI. | PASS |
| R03-R06 | Component exposes five fields and Save/Cancel/Reset, stages a normalized draft, supports keyboard editing/focus, and keeps validation errors until correction, Reset, or Cancel. | PASS |
| R07-R09 | Canonical serialization, same-directory unique temporary writes, atomic rename, best-effort cleanup, injected success/failure paths, and path-specific error behavior are implemented and tested. | PASS |
| R10-R12 | Settings preserve session and diagnostic state, announcements snapshot full config, and a one-shot guard suppresses only pi-aware's own next prompt event. | PASS |
| R13-R17 | Case-insensitive one-token toggle/on/off/status behavior, exact feedback, unknown usage, completion, and non-TUI rejection are covered by deterministic tests. | PASS |
| R18 | Existing platform, lifecycle, tmux, microphone, speech, overlap, native helper, and single-source behavior remain covered by passing regressions and package inspection. | PASS |
| R19 | Package metadata and lockfile match approved D-010; direct import and frozen install pass. | PASS |
| R20 | Bun suite covers command grammar, component navigation/edit/focus, validation, Reset/Cancel/Save, prompt guard cleanup, atomic operations, writer outcomes, lifecycle races, snapshots, and all prior regressions. | PASS |
| R21 | README documents the complete command, settings, persistence, reload, isolation, and approval-gated smoke behavior. | PASS |

## Acceptance evidence

- AC01-AC04: Overlay options, bounded rendering, all field/action labels, focus propagation, Tab/Shift-Tab, edit Escape, validation persistence, Reset staging, and Cancel are exercised without writes.
- AC05-AC08: Exact canonical JSON, immediate later-alert application, failure retention, session-state independence, stale lifecycle handling, and old/new config snapshots pass injected tests.
- AC09-AC12: Every explicit command, status, unknown/multi-token usage, completions, and non-TUI bare command behavior pass exact-message tests.
- AC13-AC14: Startup strict parsing and all existing notification, microphone, tmux, lifecycle, and speech regressions pass without real host side effects.
- AC15-AC17: Metadata, lockfile, import, package contents, README integrity, repository checks, and the corrected isolated no-provider smoke pass.

## Review findings

### Focused review 1

- Verdict: BLOCK.
- Findings: lifecycle evidence was preliminary; plain `pi -e .` was unsafe as a no-provider command; tests lacked explicit focus, Tab/Shift-Tab, edit Escape, prompt cleanup, blank phrase, and atomic operation coverage.
- Resolution: user approved D-011; plan and README now use the proven isolated command. Tests were expanded to cover every named seam and the production atomic writer through injected operations.

### Focused review 2

- Verdict: BLOCK.
- Finding: entering or typing in an edit cleared a validation error before the complete draft was corrected, contrary to the form contract.
- Resolution: errors now persist through navigation and editing, are revalidated on edit completion, and clear only when the full draft validates, Reset is chosen, or the form is canceled. The invalid-rate test proves persistence during entry and typing and clearing after correction.

### Focused review 3

- Verdict: PASS.
- Coverage: complete instructions, authoritative plan with D-010/D-011, starting checkpoint, cached/unstaged/untracked evidence, all changed paths, R01-R21, T01-T05, AC01-AC17, checks, correctness, regressions, maintainability, and test adequacy.
- Blocking findings: none.
- Non-blocking finding: finalize plan progress and this verification record, completed here.
- Observed checks: reviewer independently reran `bun test` (34 tests, 187 expectations), diff checks, package assertion, Pi TUI import, package dry run, item validation, and Markdown checks.

## Failures and skipped checks

- Initial `bun test` failed before test execution because the peer-only checkout could not resolve the static `@earendil-works/pi-tui` import. No requirements were marked complete. The user approved D-010, exact Pi TUI 0.85.1 was added as the sole dev dependency, and all later runs passed.
- Two intermediate test runs failed while the new harness was being completed: legacy no-argument toggle expectations needed explicit toggle semantics, then one width assertion and two cursor-position-dependent phrase edits needed correction. These were diagnosed and the final suite passes.
- The first attempted TUI smoke used plain `pi -e .`. Pi restored an active session, interpreted slash-command text as steering, and briefly began provider activity before termination. It did not verify extension commands. Exact provider cost, if any, is unknown. The command was not repeated unchanged. D-011 records the approved safety correction, and two later isolated offline no-session smoke runs passed.
- Real global config Save and restoration were skipped because they require an external write approval beyond the implemented injected and component-level evidence.
- Audible settings/self-prompt and unrelated-prompt checks were skipped because audio is approval-gated. Deterministic speech-adapter tests cover the event logic without sound.
- Intentional provider-backed `agent_settled`, remote installation, publication, commit, push, production actions, and wiki updates were not performed.

## Unverified areas

- Real global-config atomic replacement and restoration in the user's agent directory.
- Audible confirmation that the settings overlay remains silent while an unrelated blocking UI speaks.
- Provider-backed `agent_settled` behavior and any exact cost from the terminated accidental provider-active smoke attempt.
- Remote installation from the unpublished or unpushed repository state.
