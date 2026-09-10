# Verification: suppress TTS while microphone is active

Work item: `260910-1045-suppress-tts-while-microphone-is-active`
Date: 2026-09-10

## Environment

- Repository root: `/Users/dgjalic/Documents/1-Projects/10-software-development/pi-aware`
- Starting HEAD: `404bbf5e03fbdbde1f1dbe9cc04b808c145f9904`
- Host: macOS 26.4, arm64
- Mode: direct implementation
- Existing changes at invocation start: only this managed spec item and `spec/index.md`

## Changed paths

- `extensions/pi-aware.ts`
- `tests/pi-aware.test.ts`
- `native/pi-aware-mic-status.c`
- `scripts/build-mic-status.sh`
- `bin/pi-aware-mic-status`
- `package.json`
- `README.md`
- `spec/index.md`
- `spec/active/260910-1045-suppress-tts-while-microphone-is-active/item.yaml`
- `spec/active/260910-1045-suppress-tts-while-microphone-is-active/plan.md`
- `spec/active/260910-1045-suppress-tts-while-microphone-is-active/verification.md`
- `wiki/pi-aware.md`
- `wiki/log.md`

## Commands and checks

| Check | Result | Evidence |
| --- | --- | --- |
| `bun test` baseline | PASS | 12 tests, 82 expectations before implementation |
| Latest `bun test` | PASS | 19 tests, 125 expectations |
| `npm run build:mic-helper` | PASS | C helper compiled without warnings and was ad-hoc signed |
| Repeated helper build | PASS | Two consecutive same-environment builds produced SHA-256 `594916d3db5737a9a4372f498088ea3cb179175b5bfa04a08c386988ef1df180` |
| Helper live snapshot | PASS | Separate runs exited zero with `inactive` and later `active`; no microphone-permission prompt was observed |
| Native architecture and deployment | PASS | `lipo` reported only `arm64`; `vtool` reported minimum macOS 26.0 |
| Native identity and runtime | PASS | UUID `09083B68-B5D5-5DDC-ACBA-4AC1B1276DCF`; stable signing identifier `com.gyrozepelix.pi-aware.mic-status`; helper executed successfully |
| Native signing and linkage | PASS | `codesign --verify --strict` passed; `otool -L` showed only CoreAudio and libSystem |
| Package metadata | PASS | Version 0.1.0, Darwin, arm64, one pi extension, no runtime/development dependency, no install hook |
| `npm pack --dry-run --json` | PASS | Required helper, C source, build script, and extension included; executable files packaged as mode 0755 |
| Scope, ASCII, fences, relative links, spec protocol, and `git diff --check` | PASS | One TypeScript extension file; repository text, Markdown, link, and protocol checks passed |
| Offline `pi -e .` TUI load | PASS | Offline no-provider pty run exited zero |
| First independent focused review | BLOCK, resolved in current diff | Found ambiguous toggle/warning acceptance and PID-derived signature identity |
| Second independent focused review | BLOCK, evidence correction applied | Found no implementation defect; required this artifact and plan Progress to reflect corrected current evidence |
| Final independent focused review | PASS | Complete 13-path change reviewed with no blocking or non-blocking findings |

## Requirement coverage

| Requirement | Evidence | Status |
| --- | --- | --- |
| R01-R02 | Parser changes and invalid-config tests | PASS |
| R03-R07 | Runtime flow and active, inactive, disabled-config tests | PASS |
| R08 | Package-relative helper adapter, no-shell call, strict token parser, timeout inspection | PASS |
| R09-R10 | Fail-open retry, warning reset, stale-lifecycle tests | PASS |
| R11-R12 | Manual off, off-then-on final state, speech latch, shutdown, and concurrency tests | PASS |
| R13-R14 | Native source inspection, strict build, helper execution | PASS for deterministic checks; real active input remains gated |
| R15-R16 | Architecture, minos, UUID, hash, signing, linkage, modes, and package-content checks | PASS |
| R17 | Package metadata assertion | PASS |
| R18 | `bun test`, 19 tests and 125 expectations | PASS |
| R19 | README inspection and Markdown checks | PASS |

## Review findings

### First focused review

Verdict: `BLOCK`.

1. The reviewer interpreted AC08 as requiring any `/pi-aware` toggle to invalidate a pending alert. The user clarified that final-state semantics are required: off-then-on may allow the alert. The plan Requirements, Design, Decision Log, acceptance, and tests now state and prove this behavior.
2. The reviewer interpreted AC08 as suppressing a pending detection warning after manual disable. The user clarified that microphone diagnostics remain independent from manual and speech-failure gates. The corrected plan and tests prove the warning remains visible while speech stays suppressed.
3. The temporary PID appeared in the original ad-hoc signing identifier. The build now uses a fixed identifier and deterministic content-derived UUID. Repeated builds are byte-identical and execute successfully.

### Build correction discovered during reconciliation

Removing `LC_UUID` made two builds byte-identical but caused macOS 26 dyld to abort with `missing LC_UUID load command` and status 134. The user approved retaining a deterministic content-derived UUID. The build script now disables linker ad-hoc signing, normalizes the UUID from unsigned Mach-O content, and then signs with the stable identifier. The corrected helper passes repeated hash and execution checks.

### Second focused review

Verdict: `BLOCK` because evidence text was stale.

- No implementation, test, native, or package defect was reported.
- This artifact now records 19 tests and 125 expectations, corrected deterministic signing and UUID evidence, historical finding dispositions, and remaining approval-gated checks.
- Plan Progress now reflects that implementation and non-gated verification ran while completion remains blocked on final focused review.
- The README now states the point-in-time snapshot race noted as a non-blocking documentation improvement.

### Final focused review

Verdict: `PASS`.

- Coverage included root, spec, and wiki instructions; the complete plan and verification; all 13 changed paths; tracked and untracked evidence; R01-R19; D-010/D-011; AC01-AC16; native binary metadata; tests; package contents; documentation; and durable wiki updates.
- Blocking findings: none.
- Non-blocking findings: none.
- Reviewer-observed checks included `bun test` with 19 tests and 125 expectations, `git diff --check`, native metadata and signing inspection, package assertions, one-extension scope, Markdown and link checks, and Git checkpoint coverage.

## Failures and skipped checks

- Historical test failure: two new deferred-detector assertions initially ran before the async flow reached detection. The tests were corrected to await one microtask and now pass.
- Historical native failure: the no-UUID helper aborted under macOS 26 dyld. It was replaced after approval by the deterministic content-derived UUID implementation and now passes.
- Teams active-input, audible suppression/resumption, persistent global config, and provider-backed checks were not run because they require explicit approval. The plan permits them to be recorded as skipped.
- No dependency installation, migration, external write, commit, push, publication, deployment, or Dream invocation was performed.

## Unverified areas

- AC16 Teams-specific active-input and audible suppression/resumption behavior. The helper independently observed both live status tokens, but no controlled Teams or speech-suppression smoke was run.
- Persistent config and provider-backed lifecycle smoke behavior.
- No additional non-gated areas remain unverified.
