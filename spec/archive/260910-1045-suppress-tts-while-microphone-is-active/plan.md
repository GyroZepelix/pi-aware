# Plan: suppress TTS while microphone is active

Work item: `260910-1045-suppress-tts-while-microphone-is-active`
Status: Planned
Created: 2026-09-10
Updated: 2026-09-10

## Goal

Prevent new `pi-aware` text-to-speech notifications from interrupting calls or recordings by checking macOS CoreAudio immediately before speech and silently suppressing the alert when any process has active audio input. Make this behavior configurable, enabled by default, and limited to macOS 26.0 or newer on Apple Silicon.

## Context

- The parent work item is [`260904-2205-tmux-aware-tts-notifications`](../../active/260904-2205-tmux-aware-tts-notifications/plan.md). Current source already speaks for `ui_prompt_start` and `agent_settled`, resolves the current tmux window index, supports strict global configuration, and provides the session-local `/pi-aware` voice toggle.
- [`extensions/pi-aware.ts`](../../../extensions/pi-aware.ts) is the only current runtime source. It uses injected filesystem, environment, process, and speech adapters so [`tests/pi-aware.test.ts`](../../../tests/pi-aware.test.ts) can verify behavior without real audio.
- Configuration is loaded from `<getAgentDir()>/extensions/pi-aware/config.json` at `session_start`. Validation is strict and all-or-default, and unknown or invalid fields reject the whole file.
- The confirmed support boundary is macOS 26.0 or newer on `arm64` only. Intel macOS, older macOS, Linux, and other architectures are not supported by this change.
- CoreAudio exposes `kAudioHardwarePropertyProcessObjectList` for enumerating connected audio client processes and `kAudioProcessPropertyIsRunningInput` for determining whether a process is running I/O with at least one active input stream. Both APIs predate the macOS 26 minimum, so no legacy device-level fallback is required. See [Apple's process-object-list documentation](https://developer.apple.com/documentation/coreaudio/kaudiohardwarepropertyprocessobjectlist) and [running-input documentation](https://developer.apple.com/documentation/coreaudio/kaudioprocesspropertyisrunninginput).
- CoreAudio is part of macOS and is not an additional install. A small first-party C executable is required because the TypeScript runtime has no direct CoreAudio FFI and the package must not require a third-party utility or compiler on the user's machine.
- Baseline verification before planning passed: `bun test` reported 12 tests, 82 expectations, and no failures. The working tree was clean before the managed spec item was created.

## Requirements

- R01: Add optional config key `suppressWhileMicrophoneInUse`, accepting only a boolean and defaulting to `true` when omitted or when the config file is missing.
- R02: Preserve strict all-or-default config validation. A non-boolean value for `suppressWhileMicrophoneInUse`, an unknown key, or any other invalid field must warn once through the existing invalid-config path and replace the entire file with defaults, including microphone suppression enabled.
- R03: When automatic suppression is enabled, check microphone state for every otherwise eligible `ui_prompt_start` and `agent_settled` announcement after tmux lookup and immediately before constructing or launching `/usr/bin/say`.
- R04: Treat the microphone as in use when any CoreAudio process object reports a nonzero `kAudioProcessPropertyIsRunningInput` value. Do not identify, filter, or special-case applications.
- R05: When the microphone is in use, return without launching `/usr/bin/say`. Suppression must be silent, with no per-event UI notification, warning, tmux behavior change, persistence, or model interaction.
- R06: When the microphone is not in use, preserve the configured phrase, voice, rate, tmux window suffix, asynchronous spawn, overlap, and speech-failure behavior exactly as currently implemented.
- R07: When `suppressWhileMicrophoneInUse` is `false`, do not invoke the native helper. Proceed through the existing speech flow without microphone detection.
- R08: Invoke the helper by absolute package-relative path, without a shell, with no user-controlled arguments, and with a one-second timeout. Accept only exact trimmed stdout values `active` and `inactive`; treat nonzero exit, timeout, spawn failure, or any other output as detection failure.
- R09: Detection failure must fail open for the affected event, issue at most one warning per extension runtime, and retry detection on later eligible events. Use the exact warning `pi-aware: microphone-use detection failed; voice notifications will continue.` The warning remains independent from the manual voice toggle and speech-failure latch, so it is still shown when either has changed while detection was pending.
- R10: Reset the detection-warning latch on every `session_start`. Ignore stale detection results and failures after shutdown or lifecycle replacement, and never send a stale warning through a newer context.
- R11: Preserve the current eligibility gates. Manual `/pi-aware` disable and the existing speech-failure latch must return before microphone detection. After asynchronous detection, use the final current session-toggle and speech-failure state: an event cannot speak while either gate remains ineligible, but an off-then-on toggle cycle may restore eligibility before the check resolves. Do not add a toggle-generation invalidation rule.
- R12: Do not cancel `/usr/bin/say` processes already launched. The helper is a per-event snapshot, not a continuous monitor, listener, cache, daemon, or cross-session coordinator.
- R13: Add a first-party C helper that reads CoreAudio state without opening an input stream, capturing audio, requesting microphone data, or querying process identity. On success it must print exactly `active\n` or `inactive\n` and exit zero. A systemic CoreAudio query failure must produce no success token and exit nonzero.
- R14: Handle process-list races safely. Process objects that disappear during enumeration may be skipped; inability to retrieve the process list or to obtain a meaningful snapshot must fail rather than report `inactive` with false confidence.
- R15: Ship the helper as an ad-hoc-signed Mach-O executable containing only an `arm64` slice with deployment target macOS 26.0. Link only Apple system libraries and frameworks required for CoreAudio and the C runtime.
- R16: Include the helper source and a deterministic repository build script. The prebuilt executable must be packaged so installed users do not need Xcode Command Line Tools, a build-on-install hook, or a third-party dependency.
- R17: Declare the package platform boundary through `package.json` `os: ["darwin"]` and `cpu: ["arm64"]`, retain version `0.1.0`, keep exactly one pi extension entry, and add no runtime or development dependency.
- R18: Extend deterministic Bun tests for configuration, active and inactive states, disabled detection, fail-open behavior, warning-once retry, in-flight session toggles, stale lifecycle results, concurrent alerts, and independence from speech failures.
- R19: Update README requirements, behavior, configuration, limitations, development instructions, and manual checks for macOS 26.0+, Apple Silicon, the default-on suppression option, helper failure behavior, and the fact that CoreAudio itself requires no installation.

## Out of scope

- macOS before 26.0, Intel macOS, Linux, Windows, or `x86_64` helper binaries.
- A legacy CoreAudio device-level fallback.
- Bundling or requiring a third-party microphone-monitoring utility.
- Teams-specific, Zoom-specific, browser-specific, bundle-ID, window-title, or process-name heuristics.
- Reporting which process is using the microphone.
- Reading, recording, buffering, analyzing, or transmitting microphone audio.
- Continuous polling, CoreAudio listeners, a resident daemon, caching microphone state, or coordination across pi sessions.
- Per-event suppression messages, a status widget, a new slash command, or changes to `/pi-aware` feedback.
- Canceling speech already started or changing announcement overlap.
- Changing event semantics, tmux lookup, phrases, voice, rate, config location, reload behavior, or the existing speech-failure latch.
- Build-on-install scripts, third-party dependencies, migrations, publication, commits, pushes, production actions, or unrelated refactors.
- Designing a future Linux backend. Linux architecture and detection choices require a separate plan.

## Assumptions

- macOS 26 retains the documented CoreAudio process-object APIs. Revisit if the macOS 26 SDK deprecates or changes their runtime behavior.
- Querying CoreAudio state without opening an input stream does not require microphone permission and does not display a privacy prompt. Verify this on the host before claiming it as established behavior.
- A one-second helper timeout is long enough for a local CoreAudio snapshot while preventing a failed check from indefinitely blocking an alert. Revisit if measured host behavior approaches the limit.
- Any active input stream counts, including conferencing, recording, dictation, browser, virtual-device, and background-process use. This can suppress speech outside a voice call and is intentional.
- A snapshot cannot eliminate the small race in which microphone state changes after the helper exits and before `/usr/bin/say` launches. Continuous monitoring and speech cancellation remain out of scope.
- Version `0.1.0` remains appropriate because no published release evidence was found during planning. Stop for a versioning decision if implementation discovers that `0.1.0` has already been released.
- The checked-in helper executable is acceptable as a package artifact when accompanied by source, a build script, architecture and deployment checks, and ad-hoc signing. Revisit if distribution policy requires Developer ID signing or source-only packages.

## Design

### Configuration and runtime state

Extend `PiAwareConfig`, `DEFAULT_CONFIG`, `CONFIG_KEYS`, and `parseConfig` with:

```json
{
  "suppressWhileMicrophoneInUse": true
}
```

The property is a strict boolean. It is not trimmed or coerced. Because the existing parser builds from `DEFAULT_CONFIG`, omission and a missing file enable suppression, while any invalid document falls back to the complete default configuration.

Add one runtime-local `microphoneWarningShown` boolean. Reset it during every `session_start`, separately from `speechWarningShown` and `voiceNotificationsEnabled`. The microphone warning records only whether the fail-open diagnostic has been shown; it must not disable future checks.

### Native helper

Add these stable areas:

- `native/pi-aware-mic-status.c`: CoreAudio implementation.
- `scripts/build-mic-status.sh`: reproducible local build and ad-hoc signing.
- `bin/pi-aware-mic-status`: packaged `arm64` Mach-O executable.

The helper will:

1. Query `kAudioObjectSystemObject` for `kAudioHardwarePropertyProcessObjectList` using global scope and the main element.
2. Allocate the process-object list using `AudioObjectGetPropertyDataSize` followed by `AudioObjectGetPropertyData`.
3. Query each live process object for `kAudioProcessPropertyIsRunningInput` using global scope and the main element.
4. Print `active` and exit zero immediately when any readable process reports active input.
5. Skip an object that vanished during enumeration, but track whether the snapshot contained readable state.
6. Print `inactive` and exit zero only after a meaningful successful snapshot reports no active input.
7. Write a concise diagnostic to stderr and exit nonzero for system-property, allocation, malformed-size, or snapshot failures.

The helper must not request PID, bundle ID, process name, device name, microphone samples, or microphone permission. It takes no arguments and has no persistent state.

The build script will use the active macOS SDK and Clang, compile only `arm64`, set `-mmacosx-version-min=26.0`, enable strict warnings, optimize a release build, link CoreAudio, replace the linker-generated UUID with a deterministic content-derived Mach-O UUID, replace the packaged output atomically, mark it executable, and apply an ad-hoc signature with stable identifier `com.gyrozepelix.pi-aware.mic-status` after the final binary is produced. It will not run automatically during package installation.

### Production adapter and output protocol

Add an injected dependency shaped as `detectMicrophoneInUse(): Promise<boolean>`. The production implementation will derive `../bin/pi-aware-mic-status` from `import.meta.url`, convert it to an absolute filesystem path, and invoke it through `execFile` with:

- no shell;
- no arguments;
- UTF-8 stdout;
- a one-second timeout.

Trim stdout and map only `active` to `true` and `inactive` to `false`. Reject every other result. Keep the existing tmux adapter independent so tmux fallback remains silent and detection failures remain visible.

The Bun harness will inject the detector directly. Native command path, architecture, signing, deployment target, linkage, and output are verified through build and host checks rather than real CoreAudio calls in unit tests.

### Announcement flow

For each question or finished event:

1. Apply the current active, shutdown, manual-toggle, and speech-failure gates.
2. Capture the lifecycle generation and resolve the current tmux window index as today.
3. Recheck all existing gates and lifecycle generation.
4. If `suppressWhileMicrophoneInUse` is enabled, await the injected detector.
5. If detection returns `true`, return silently.
6. If detection throws, and the captured lifecycle is still current, show the detection warning only if it has not already been shown, even when `/pi-aware` is now disabled or the speech-failure latch is set; then continue for this event.
7. Recheck all gates and lifecycle generation after detection or its failure, using the current toggle value rather than invalidating the event merely because the value changed while detection was pending.
8. Build the existing speech arguments and launch `/usr/bin/say` exactly as today.

This ordering places the microphone snapshot close to speech launch and preserves the existing per-alert tmux result. It also ensures an event paused in detection cannot speak while `/pi-aware`, shutdown, reload, or a speech failure leaves it ineligible. A completed off-then-on toggle cycle restores eligibility, so the pending event may speak when the microphone result also allows it.

Concurrent alerts keep independent tmux lookups, helper processes, and speech launches. No new queue or lock is introduced.

### Packaging and documentation

Keep `extensions/pi-aware.ts` as the only pi extension entry and the only TypeScript runtime source. The native executable is a bounded platform adapter, not a second extension.

Add package scripts for the existing tests and explicit helper rebuild, and declare Darwin/arm64 compatibility. Confirm `npm pack --dry-run` includes the executable, C source, and build script. README must state that installed users do not compile or install CoreAudio, while contributors rebuilding the helper need Apple's command-line developer tools.

## Decision Log

| ID | Scope | Decision | Rationale | Evidence | Revisit when |
| --- | --- | --- | --- | --- | --- |
| D-001 | User behavior | Suppress both question and finished speech whenever any process has active audio input. | Prevents TTS from interrupting Teams and equivalent calls without an app allowlist. | User confirmation. | Per-event controls or app-specific behavior is requested. |
| D-002 | Configuration | Add `suppressWhileMicrophoneInUse` as a strict boolean defaulting to `true`. | Makes the feature opt-out while preserving the existing reload-based global config model. | User confirmation; current parser in `extensions/pi-aware.ts`. | Configuration naming or persistence changes. |
| D-003 | Detection API | Use CoreAudio process objects and `kAudioProcessPropertyIsRunningInput`. | The property directly represents active input I/O and avoids app-name or output-device heuristics. | Apple CoreAudio documentation linked in Context. | Apple changes or removes the API. |
| D-004 | Platform | Support only macOS 26.0+ on `arm64`; provide no old-macOS or Intel fallback. | This is the explicitly confirmed product boundary and keeps the helper narrow. | User confirmation. | Intel macOS or older macOS becomes a requirement. |
| D-005 | Distribution | Bundle an ad-hoc-signed first-party helper, its C source, and a build script; do not compile on install. | CoreAudio is built into macOS, while a packaged helper avoids third-party tools and end-user compiler requirements. | User confirmation; current dependency-free package contract. | Distribution requires Developer ID signing or source-only artifacts. |
| D-006 | Failure policy | Fail open, warn once per runtime, and retry on future events. | Preserves attention alerts when detection is unavailable while keeping transient recovery possible. | User confirmation. | Repeated failure overhead or privacy policy requires a different latch. |
| D-007 | Timing | Check once per eligible alert immediately before speech, after tmux lookup. | Gives a fresh snapshot without adding a daemon, cache, or continuous polling. | Confirmed scope; current announcement flow. | The snapshot race proves unacceptable. |
| D-008 | Interaction | Keep automatic suppression independent from `/pi-aware` and the speech-failure latch. | Each gate has a distinct purpose and existing warnings and recovery semantics must remain intact. | Current source, tests, and toggle plan. | A unified status or recovery command is requested. |
| D-009 | Verification | Use injected Bun behavior tests plus native build, package, and approved host checks. | Keeps unit tests deterministic while validating the real architecture and CoreAudio boundary separately. | Current test seam; baseline `bun test`. | CI gains a controlled microphone-use fixture. |
| D-010 | Async toggle semantics | Use the final `/pi-aware` state after detection; an off-then-on cycle may allow the pending alert, while detection warnings remain visible during manual disable or a speech-failure latch. | Keeps manual voice preference and microphone diagnostics independent, as explicitly clarified by the user. | User clarification during implementation review. | Pending alerts should instead be invalidated by any toggle transition. |
| D-011 | Reproducible helper | Use a fixed ad-hoc signing identifier and replace the linker-generated UUID with a deterministic content-derived Mach-O UUID before signing. | A fixed signing identifier alone did not make builds byte-identical, while omitting `LC_UUID` caused macOS 26 dyld to abort. A content-derived UUID preserves runtime compatibility and reproducibility. | Focused review finding; repeated SHA-256 comparison; failed no-UUID host execution. | Apple provides a supported deterministic linker-UUID option or the build pipeline changes. |

## Work breakdown

- [x] T01: Add the arm64 CoreAudio microphone-status helper.
  - Depends on: none
  - Scope: Implement the C snapshot protocol, process-race handling, strict output and exit semantics, macOS 26 arm64 build script, executable mode, and ad-hoc-signed packaged binary.
  - Expected areas: `native/pi-aware-mic-status.c`, `scripts/build-mic-status.sh`, `bin/pi-aware-mic-status`
  - Acceptance: The helper builds without warnings, contains only `arm64`, targets macOS 26.0, links only system components, is signed and executable, and emits exactly one valid status token on a successful host query.
  - Verification: Run the build script, architecture, deployment-target, signing, linkage, executable-mode, and output-protocol commands in the Verification plan.

- [x] T02: Integrate default-on microphone suppression into the extension.
  - Depends on: T01
  - Scope: Extend strict config, add the injected and production detector, resolve the helper path, enforce timeout and output parsing, add the warning-once fail-open state, and place lifecycle-safe suppression into the existing announcement flow.
  - Expected areas: `extensions/pi-aware.ts`
  - Acceptance: Active input silently prevents new speech; inactive input and failures preserve speech as specified; config false avoids detection; stale or ineligible events cannot speak or warn.
  - Verification: Run the Bun tests from T03 and inspect production process invocation for absolute path, no shell, no arguments, and one-second timeout.

- [x] T03: Extend deterministic regression coverage.
  - Depends on: T02
  - Scope: Add a fake microphone detector and focused tests for default and explicit config, active/inactive results, disabled checks, invalid booleans, failure warning and retry, session reset, in-flight toggle and shutdown races, concurrent events, and the independent speech-failure latch.
  - Expected areas: `tests/pi-aware.test.ts`
  - Acceptance: New tests fail against the old detector-free runtime, pass after integration, produce no real microphone or speech activity, and retain all existing lifecycle, tmux, config, toggle, concurrency, and failure coverage.
  - Verification: `bun test`

- [x] T04: Align package metadata and user documentation.
  - Depends on: T01, T02, T03
  - Scope: Declare Darwin/arm64 package support, add the helper build script without dependencies or install hooks, document macOS 26, configuration and behavior, explain bundled CoreAudio usage, and add safe manual checks.
  - Expected areas: `package.json`, `README.md`
  - Acceptance: Users understand that suppression defaults on, how to disable it, what counts as active input, how failure behaves, and that no CoreAudio installation or local compiler is needed; contributors can rebuild the helper.
  - Verification: Run metadata, package-content, dependency, documentation, and Markdown checks in the Verification plan.

- [x] T05: Run automated, package, native, and approved host verification.
  - Depends on: T01, T02, T03, T04
  - Scope: Execute all non-side-effecting checks, load the extension without a provider call, and perform real microphone-active or audible checks only after explicit approval. Record failures and skipped checks rather than weakening requirements.
  - Expected areas: no new runtime areas; later lifecycle artifacts under this work item only
  - Acceptance: Every automated check passes and each host, audio, provider, or publication gate is either verified with approval or explicitly recorded as skipped with a reason.
  - Verification: Complete the Verification plan below.

## Acceptance criteria

- AC01: Missing config and config without the new field both enable microphone suppression.
- AC02: `"suppressWhileMicrophoneInUse": false` preserves existing speech and does not invoke the helper.
- AC03: A wrong type for the new field rejects the entire config, warns through the existing invalid-config path, and restores all defaults including suppression enabled.
- AC04: When any process reports active input, both question and finished events launch no `/usr/bin/say` process and show no suppression notification.
- AC05: When no process reports active input, both event paths preserve exact configured speech and tmux window-index behavior.
- AC06: Helper spawn error, timeout, nonzero exit, or invalid output speaks normally, shows the exact warning at most once per runtime, and allows a later event to retry detection.
- AC07: `/pi-aware` manual disable and the speech-failure latch prevent helper invocation. Neither state is cleared or bypassed by microphone results.
- AC08: Shutting down, reloading, or changing lifecycle generation while detection is pending prevents stale speech and stale warnings. A manual toggle uses final-state semantics: remaining disabled prevents speech, an off-then-on cycle may allow speech, and a detection-failure warning remains visible even while manually disabled or speech-disabled.
- AC09: Concurrent alerts remain safe and unqueued. Each eligible alert obtains its own microphone snapshot.
- AC10: The helper reports active input through CoreAudio process objects without collecting audio or process identity and follows the exact stdout and exit protocol.
- AC11: The shipped helper is executable, ad-hoc signed, `arm64` only, and declares macOS 26.0 as its minimum deployment target.
- AC12: Installed users need no compiler, CoreAudio installation, build hook, or third-party utility.
- AC13: `package.json` declares Darwin and arm64, keeps version `0.1.0`, exposes exactly `./extensions/pi-aware.ts`, and has no dependencies or development dependencies.
- AC14: README accurately documents support, configuration, automatic and manual suppression interaction, snapshot limitations, failure behavior, build instructions, and manual verification.
- AC15: `bun test`, native build checks, package checks, documentation checks, `git diff --check`, and an offline `pi -e .` load pass.
- AC16: With approval, a real microphone-active application causes the helper to report `active` and suppresses a new alert; after input stops, the helper reports `inactive` and a later eligible alert can speak.

## Testing decisions and seams

- Extend `PiAwareDependencies` with an asynchronous boolean detector. Unit tests inject it and never launch the packaged helper, access CoreAudio, open microphone input, or produce speech.
- Default the test detector to `false` so current tests retain their behavior unless a case explicitly exercises suppression.
- Count detector calls as well as tmux and speech calls. This proves config false, manual disable, and speech failure return before detection.
- Use deferred detector promises to test manual-disable, off-then-on final-state behavior, shutdown, new-session, and lifecycle-generation races deterministically.
- Simulate repeated detector rejection to prove fail-open speech, one warning, and later retry. Simulate recovery after a failure to prove the detector is not latched off, and prove its warning remains visible when manual or speech-failure state changes while the check is pending.
- Preserve current tests for command registration, config fallback, tmux fallback and refresh, concurrent alerts, speech failure, and stale speech callbacks.
- Verify the native helper at the CLI boundary. Its live `active` or `inactive` value is host-dependent, so automated checks assert protocol validity rather than a fixed state.
- Reserve state-transition proof for an approved manual test using Teams or another known microphone consumer. Do not start a provider request solely to generate an alert without explicit cost approval.

## Verification plan

1. Run focused automated tests:

   ```text
   bun test
   ```

2. Rebuild and inspect the native helper:

   ```text
   npm run build:mic-helper
   test -x bin/pi-aware-mic-status
   file bin/pi-aware-mic-status
   lipo -archs bin/pi-aware-mic-status
   xcrun vtool -show-build bin/pi-aware-mic-status
   codesign --verify --strict --verbose=2 bin/pi-aware-mic-status
   codesign -dvv bin/pi-aware-mic-status
   otool -L bin/pi-aware-mic-status
   ```

   Pass conditions: `lipo` reports only `arm64`; `vtool` reports minimum macOS 26.0; signature verification succeeds with identifier `com.gyrozepelix.pi-aware.mic-status`; linkage contains only Apple system paths; and the file is executable. Run the build twice in the same environment and compare SHA-256 hashes to confirm byte-identical output.

3. Validate the helper output without opening an input stream:

   ```text
   status="$(bin/pi-aware-mic-status)"
   test "$status" = active || test "$status" = inactive
   ```

   Confirm the command exits zero and does not trigger a macOS microphone-permission prompt. A nonzero exit is a failed check to diagnose, not evidence of inactivity.

4. Confirm package metadata and dependency boundaries:

   ```text
   node -e 'const p=require("./package.json"); if (p.version!=="0.1.0" || JSON.stringify(p.os)!==JSON.stringify(["darwin"]) || JSON.stringify(p.cpu)!==JSON.stringify(["arm64"]) || JSON.stringify(p.pi?.extensions)!==JSON.stringify(["./extensions/pi-aware.ts"]) || p.dependencies || p.devDependencies) process.exit(1)'
   npm pack --dry-run
   ```

   Inspect the dry-run list and confirm it contains `bin/pi-aware-mic-status`, `native/pi-aware-mic-status.c`, and `scripts/build-mic-status.sh`, with no generated intermediate objects.

5. Check runtime scope, configuration, documentation, and formatting:

   ```text
   find extensions -maxdepth 2 -type f -print
   rg -n 'suppressWhileMicrophoneInUse|microphone-use detection|macOS 26|arm64|CoreAudio' extensions tests README.md package.json native scripts
   git diff --check
   git status --short
   ```

   Confirm `extensions/pi-aware.ts` remains the only pi extension and review all changed paths against this plan.

6. Load the checkout without a provider call:

   ```text
   pi -e .
   ```

   Confirm the extension loads without error on macOS 26 arm64, then quit without sending a prompt. Running `/pi-aware` twice may verify existing disabled and enabled feedback without audio.

7. With explicit approval for host microphone and audible checks:

   - Run the helper while no application is capturing input and observe `inactive`.
   - Join a Teams call or start another known microphone consumer and observe `active`.
   - While input is active, trigger a no-provider blocking UI and confirm no `/usr/bin/say` process launches and no speech is heard.
   - Stop input, trigger the equivalent UI, and confirm normal speech resumes.
   - Set `suppressWhileMicrophoneInUse` to `false` in an approved temporary or persistent config, reload, and confirm an eligible alert follows existing speech behavior even while input is active.

8. Preserve approval boundaries:

   - Do not modify persistent global config, produce audible speech, initiate a Teams call, or make a provider-backed request without explicit approval at execution time.
   - Do not install dependencies, publish packages, create releases, commit, push, or perform other external writes without explicit approval.

## Risks and blockers

- Microphone state is a snapshot. Input can start after the helper returns or stop immediately before it runs. Checking immediately before speech minimizes but cannot remove this race without out-of-scope monitoring or cancellation.
- Any active input stream suppresses speech, even when it is not a call. This is intentional but may surprise users of dictation, recording, virtual audio, or background capture; config false is the escape hatch.
- CoreAudio process objects can disappear during enumeration. The helper must distinguish harmless stale entries from a systemic failure so it neither crashes nor reports false inactivity.
- The default-on feature adds one short-lived helper process to each otherwise eligible alert. A one-second timeout bounds failure delay, and no continuous process is introduced.
- A missing, quarantined, non-executable, wrongly packaged, or invalidly signed helper causes fail-open speech. Build, signing, package-content, local-load, and warning tests mitigate this risk.
- A checked-in binary can drift from its source. The build script and verification must rebuild the artifact and inspect the resulting diff before completion.
- Ad-hoc signing may be insufficient for a future notarized or differently distributed package. Developer ID signing, notarization, and release infrastructure are not authorized by this plan.
- macOS privacy behavior is expected to permit state inspection without microphone access, but this remains a host-verification item until observed on macOS 26.
- The arm64 and macOS 26 package declarations intentionally prevent supported installation on Intel, Linux, and older macOS. Future Linux x86_64 support requires a separate backend and package decision.
- Real Teams, audio, persistent-config, and provider-backed checks have user-visible side effects or cost and remain explicit approval gates.

## Progress

- [x] Planning complete and confirmed.
- [x] Implementation changes complete.
- [x] Automated, native, package, documentation, and offline no-provider checks passed.
- [x] Independent focused review passed with no findings.
- [ ] Approval-gated Teams, audible, persistent-config, and provider-backed checks were not run and remain documented as unverified.

## Execution handoff

Use PI Agent in a fresh session with this prompt:

```text
Read spec/active/260910-1045-suppress-tts-while-microphone-is-active/plan.md and the adjacent item.yaml completely.
Implement one confirmed task at a time while preserving Requirements, Out of scope, Decision Log, Risks, and Verification plan.
Update Progress and add a confirmed Decision Log entry when implementation changes the approach.
Run focused checks during work and the plan's required verification before reporting completion.
Stop and ask before dependencies, migrations, destructive operations, external writes, commits, pushes, production actions, or scope expansion.
Preserve failures, skipped checks, deviations, and unverified areas instead of claiming completion.
```

## Proposed durable knowledge updates

After implementation and verification establish current behavior, update `wiki/pi-aware.md` with the macOS 26 arm64 support boundary, default-on microphone suppression, config key, CoreAudio helper architecture, fail-open behavior, and interaction with `/pi-aware` and speech failures. Append `wiki/log.md` only when that verified durable wiki update is made. Do not update wiki during planning.

## Notes

- The user confirmed any active audio input, a bundled first-party helper, fail-open warning behavior, macOS 26.0+, and arm64-only support.
- CoreAudio itself ships with macOS and is not installed separately. The bundled artifact is only the package-specific status helper.
- Minor defaults are silent per-event suppression, one-second detection timeout, retry after detection failure, exact config key `suppressWhileMicrophoneInUse`, no cancellation of existing speech, version `0.1.0`, and no unrelated cleanup.
- During focused review, the user clarified that pending alerts use the final `/pi-aware` state and that microphone-detection warnings remain independent from manual and speech-failure gates. Requirements, Design, Decision Log, acceptance, and testing guidance were corrected before implementation resumed.
- A no-UUID reproducible-build attempt failed because macOS 26 dyld requires `LC_UUID`. The user approved replacing the random linker UUID with a deterministic content-derived UUID before signing.
- External planning evidence is limited to Apple's CoreAudio documentation linked in Context. No third-party implementation was adopted as a dependency or authority.
- Baseline `bun test` passed 12 tests with 82 expectations before item creation.
- The worktree was clean before item creation. This planning phase changes only managed files under `spec/` and performs no implementation, build, dependency installation, migration, external write, commit, push, publication, or production action.
