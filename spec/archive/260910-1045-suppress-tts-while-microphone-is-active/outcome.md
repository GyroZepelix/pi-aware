# Outcome: suppress TTS while microphone is active

Work item: `260910-1045-suppress-tts-while-microphone-is-active`
Disposition: implemented
Date: 2026-09-10

## Delivered scope

- Added default-on `suppressWhileMicrophoneInUse` strict configuration.
- Added per-alert CoreAudio input-state suppression with fail-open warning and retry behavior.
- Added a packaged macOS 26 arm64 C helper, source, deterministic build, stable UUID, and ad-hoc signature.
- Preserved tmux window lookup, `/pi-aware`, speech-failure, lifecycle, and overlap behavior.
- Added deterministic race, failure, configuration, and regression tests.
- Updated package metadata, README guidance, and durable wiki memory.

## Deviations from plan

- The user clarified during review that a pending alert uses the final `/pi-aware` state, so an off-then-on cycle may speak, and microphone-detection warnings remain independent from manual and speech-failure gates. The canonical plan was corrected before completion.
- Removing `LC_UUID` was rejected after macOS 26 dyld aborted the helper. The approved correction derives a deterministic UUID from unsigned Mach-O content before signing.

## Verification summary

- `bun test` passed 19 tests with 125 expectations.
- Repeated helper builds were byte-identical.
- Native architecture, macOS deployment target, UUID, signing, linkage, executable mode, helper execution, package contents, and package metadata passed.
- Offline no-provider `pi -e .`, spec validation, link, Markdown, ASCII, and diff checks passed.
- Final independent focused review passed with no findings.

## Retained, reverted, or transferred work

- All implemented source, native, test, package, documentation, spec, and wiki changes were retained.
- The failed no-UUID native binary was replaced by the deterministic content-derived UUID build.
- No work was transferred to another item.

## Residual risks

- Controlled Teams active-input suppression and audible resumption were not run.
- Persistent global configuration and provider-backed settled behavior remain unverified.
- The packaged helper must be rebuilt and recommitted whenever its C source or build contract changes.

## Follow-up work items

- None created. Controlled host smoke checks may be run with explicit approval before publication.
- Future Linux or x86_64 support requires a separate platform-backend plan.

## Source references

- `extensions/pi-aware.ts`
- `native/pi-aware-mic-status.c`
- `scripts/build-mic-status.sh`
- `tests/pi-aware.test.ts`
- `README.md`
- `package.json`
- `verification.md`

## Wiki updates

- `wiki/pi-aware.md`
- `wiki/log.md`
- `wiki/dreams/2026-09-10-1318-completed-session.md`
