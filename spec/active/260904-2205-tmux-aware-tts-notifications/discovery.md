# Discovery: tmux-aware TTS notifications

Work item: `260904-2205-tmux-aware-tts-notifications`
Status: Ready for Spec
Created: 2026-09-04
Updated: 2026-09-04

## Objective

Create an extremely lean pi extension for macOS that audibly tells the user when an interactive pi session needs attention, including the displayed tmux pane number when available.

## Desired outcome

A user can install the `pi-aware` repository through pi's git package mechanism. The installed extension uses macOS text to speech to announce a blocking question or a fully settled agent run, allowing the user to identify the relevant tmux pane without watching every pane.

## Repository and domain context

- `Fact`: The repository currently contains planning and wiki scaffolding only. No extension source or tests exist yet.
- `Fact`: The installed pi version inspected during discovery is `0.85.0`.
- `Fact`: Pi extensions are TypeScript modules and git-installed pi packages can auto-discover conventional `extensions/` directories without a package manifest. Evidence: local pi `README.md` and `docs/extensions.md`.
- `Fact`: Pi provides `ui_prompt_start` for blocking extension UI and `agent_settled` after retries, compaction, tools, and queued continuations are exhausted. Evidence: local pi `docs/extensions.md`, `dist/core/extensions/types.d.ts`, and `dist/core/agent-session.js`.
- `Fact`: The local platform provides `/usr/bin/say` with voice and rate options.
- `Fact`: tmux places a stable pane ID such as `%46` in `TMUX_PANE`; `tmux display-message -p -t "$TMUX_PANE" '#{pane_index}'` resolves the displayed pane index. Evidence: tmux 3.6b manual and a local read-only probe.

## Scope

- macOS text-to-speech announcements.
- Interactive pi TUI sessions only.
- Distinct announcements for blocking UI questions and settled runs.
- tmux pane-index lookup with a no-tmux fallback.
- A public, MIT-licensed, git-installable package with one TypeScript runtime extension file.
- A minimal `package.json` manifest at version `0.1.0`, README, focused tests, and an MIT license naming `GyroZepelix`.
- User configuration through a config file.

## Out of scope

- Notification behavior in pi print, JSON, or RPC modes.
- Text heuristics for classifying ordinary assistant prose as a question.
- Cross-process speech serialization, cancellation, or deduplication.
- Terminal application or tmux pane autofocus.
- Non-macOS speech backends unless later reopened.

## Confirmed facts and evidence

- `Fact`: `ui_prompt_start` is coalesced around nested blocking prompts and includes prompt kind and an optional title.
- `Fact`: A final assistant response containing a prose question has no dedicated question event. It will still be covered by the settled announcement.
- `Fact`: `agent_settled` is the correct completion seam; `agent_end` may precede retry, automatic compaction, or queued follow-up work.
- `Fact`: The official `notify.ts` example uses `agent_settled` for a ready-for-input notification.
- `Fact`: Pane indexes may repeat across tmux windows; pane IDs are unique but do not necessarily match the number displayed to the user.
- `Fact`: Established extensions vary below the agent directory, but consistently use pi's exported `getAgentDir()` so configured and rebranded agent directories are respected.
- `Fact`: Exact terminal-window focus is not portable across macOS terminal applications. A tmux pane may be visible through multiple clients, and terminal-specific AppleScript APIs expose different identifiers.
- `Fact`: `ui_prompt_start` is structural rather than semantic: it fires for every blocking extension `select`, `confirm`, `input`, `editor`, or `custom` UI call. Some custom UIs may be loaders or settings rather than literal questions; the user accepts this breadth.
- `Fact`: `agent_settled` was introduced in pi 0.80.4; `ui_prompt_start` was introduced in pi 0.84.4. Full selected behavior therefore requires pi 0.84.4 or newer.
- `Fact`: Pi git packages may use conventional directories or an explicit `pi` manifest in `package.json`. When a git package contains `package.json`, pi runs `npm install` during reconciliation.
- `Fact`: The repository has no remote configured yet. The user identified the future canonical remote as `git@github.com:GyroZepelix/pi-aware.git`.
- `Fact`: `agent_settled` is emitted from a `finally` block and therefore also follows aborted or unrecoverably failed runs; the event means no automatic continuation remains, not successful completion.

## Constraints and invariants

- The runtime must remain dependency-free beyond pi, Node built-ins, `/usr/bin/say`, and tmux when present.
- Full behavior requires pi 0.84.4 or newer and this requirement is documented rather than checked at runtime.
- Speech must not block pi's interaction loop.
- A missing tmux context must not suppress otherwise valid announcements.
- Concurrent announcements may overlap; the extension must not kill or coordinate unrelated speech processes.
- The implementation must not infer question intent from punctuation or assistant prose.
- External commands must be launched with executable-and-argument APIs, never shell-interpolated strings.
- Omitting `voice` or `rate` must preserve the corresponding macOS system default.
- Config strings are trimmed and must remain non-empty; `rate` must be a positive finite number.

## Domain language

- **Question announcement**: speech triggered by `ui_prompt_start`, meaning pi is blocked on extension-provided UI input.
- **Finished announcement**: speech triggered by `agent_settled`, meaning pi has no automatic continuation left and is ready for user input, regardless of success, abort, or unrecoverable error.
- **Pane index**: tmux's displayed `#{pane_index}`, not its stable `%N` pane ID.
- **Plain prose question**: a question written in a normal final assistant message; it receives a finished announcement because no reliable dedicated event exists.
- **pi-aware**: the user-selected plugin, package, and extension identity.

## Decision tree

- Attention trigger
  - Blocking extension UI -> announce a question.
  - Fully settled run -> announce finished, including after abort or unrecoverable error.
  - Plain prose classification -> use the settled announcement only; no heuristic branch.
- Session label
  - Inside tmux -> use stable `TMUX_PANE` to resolve the current pane index immediately before every announcement.
  - Outside tmux -> speak the event phrase without a number.
- Delivery
  - Install through pi's git package mechanism from `git@github.com:GyroZepelix/pi-aware.git`.
  - Keep runtime implementation in one TypeScript extension file at `extensions/pi-aware.ts`.
  - Include a minimal `package.json` at version `0.1.0` with `pi-package` keyword, explicit `pi.extensions`, MIT metadata, and the pi coding-agent peer declaration recommended by pi package docs.
  - Include README, focused tests, and an MIT license naming `GyroZepelix`.
- Runtime modes
  - TUI -> enabled.
  - Print, JSON, RPC -> disabled.
- Configuration
  - Config file selected.
  - Shape -> optional flat `voice`, `rate`, `finishedPhrase`, and `questionPhrase` fields.
  - Values -> strings must be non-empty; rate must be a positive finite number.
  - Unknown keys -> invalidate the whole config.
  - Missing file -> use defaults without warning.
  - Invalid file or fields -> warn once and use all defaults.
  - Reload -> read at session startup, including the startup caused by `/reload`.
  - Default wording -> `question [pane-index]` and `finished [pane-index]`.
  - Location -> optional global `<getAgentDir()>/extensions/pi-aware/config.json`; no project override.
- Prompt breadth
  - Every `ui_prompt_start` -> announce `question`, including non-question blocking custom UI.
- Failure behavior
  - Non-macOS -> warn once at startup and disable.
  - tmux pane lookup failure -> silently speak without a number.
  - `/usr/bin/say` failure -> warn once and disable speech until reload or session replacement.
- Compatibility
  - Require pi 0.84.4 or newer in README; no runtime version check or package enforcement.
- Focus behavior
  - Exact focus -> requires terminal-specific adapters and tmux client-selection policy.
  - Version 1 -> explicitly out of scope; announcements are auditory only.
- Concurrency
  - Launch announcements independently and allow overlap.
- Verification
  - Focused automated tests for deterministic seams plus a real pi/tmux/`say` smoke test.

## Confirmed decisions

| ID | Status | Scope | Decision | Recommendation | Rationale and evidence | Revisit when |
| --- | --- | --- | --- | --- | --- | --- |
| D-001 | confirmed | Trigger semantics | Use distinct event-based announcements: `question` on every `ui_prompt_start`, `finished` on `agent_settled`. Plain prose questions receive `finished`. | Announce every blocking UI prompt | The hooks are reliable; the user accepts that structural UI prompts include some non-question custom UI. | Pi adds a dedicated semantic event for ordinary assistant questions. |
| D-002 | confirmed | tmux label | Speak the displayed tmux pane index. | Pane index | Matches the user's mental model and example, with less speech than window-plus-pane. | Duplicate pane numbers across windows become materially confusing. |
| D-003 | confirmed | Non-tmux behavior | Speak the event phrase without a pane number. | Speak without number | Preserves the core notification outside tmux with minimal branching. | A different non-tmux identifier is requested. |
| D-004 | confirmed | Delivery | Provide a git-installable pi package whose runtime is one TypeScript extension file. | Single runtime file in a git package | Supports global use and git installation without adding runtime architecture. | Publication requirements demand npm metadata or compiled artifacts. |
| D-005 | confirmed | Runtime modes | Enable speech only in interactive TUI mode. | Interactive only | This is the mode in which pi waits for keyboard input and avoids surprising automation. | A noninteractive completion-alert use case is added. |
| D-006 | confirmed | Configuration | Read user options from a config file. | No configuration was initially recommended | The user explicitly prefers file-based customization despite the extra schema and error-handling surface. | The configuration burden conflicts with the lean-product goal. |
| D-007 | confirmed | Concurrent speech | Allow independent announcements to overlap. | Allow overlap | Avoids locks, global coordinators, and destructive cancellation of unrelated speech. | Overlap proves unusable in normal multi-pane operation. |
| D-008 | confirmed | Config fields | Support optional voice, rate, finished phrase, and question phrase settings in version 1. | Voice, rate, and phrases | Covers useful `/usr/bin/say` customization and event wording without event toggles. | Users need to disable one event independently. |
| D-009 | confirmed | Config errors | Treat a missing file as normal; on invalid JSON or fields, warn once and use all defaults. | Defaults plus warning | Keeps the notification available and makes mistakes visible with simple all-or-nothing validation. | Partial recovery becomes important for a larger schema. |
| D-010 | confirmed | Config lifecycle | Read config at session startup and apply changes after pi `/reload`. | On pi reload | Avoids repeated filesystem I/O and matches pi extension lifecycle conventions. | Immediate config updates become a product requirement. |
| D-011 | confirmed | Default wording | Use short event-first phrases: `question 5` and `finished 5`, or `question` and `finished` outside tmux. | Short event first | Matches the user's example and minimizes speech duration. | More explicit phrasing is needed for accessibility. |
| D-012 | confirmed | Identity | Name the plugin, package, and extension `pi-aware`. | `pi-aware` | The user selected this identity and it matches the repository name. | A naming collision or publication constraint is discovered. |
| D-013 | confirmed | Config location | Use optional global `<getAgentDir()>/extensions/pi-aware/config.json` with no project override. | Global extension path | Follows established extension practice, avoids collisions, and respects configured agent directories. | Project-specific speech preferences become necessary. |
| D-014 | confirmed | Focus behavior | Do not autofocus a terminal application, window, or tmux pane in version 1. | No autofocus | Exact targeting is terminal-specific and app-only activation may raise the wrong window. | Auditory alerts prove insufficient and named terminal support is scoped separately. |
| D-015 | confirmed | Prompt breadth | Treat every blocking extension UI prompt as a question announcement. | All UI prompts | Reliably catches all question tools and attention points despite occasional broad wording for settings or loaders. | Pi exposes semantic purpose or false announcements become disruptive. |
| D-016 | confirmed | Config shape | Use optional flat `voice`, `rate`, `finishedPhrase`, and `questionPhrase` fields. | Flat fields | Four independent values do not justify nested groups. | The schema gains enough related fields to benefit from grouping. |
| D-017 | confirmed | Config values | Require non-empty strings and a positive finite numeric rate. | Basic strict | Rejects unusable values without inventing a macOS speech-rate ceiling. | `/usr/bin/say` documents or enforces narrower requirements. |
| D-018 | confirmed | Unknown config keys | Treat any unknown property as invalid, warn once, and use all defaults. | Reject config | Catches misspellings and follows all-or-nothing invalid-config behavior. | Schema evolution needs forward compatibility. |
| D-019 | confirmed | Unsupported platform | On non-macOS, warn once at session startup and disable speech behavior. | Warn then disable | Makes the platform boundary clear without attempting undefined backends. | A supported non-macOS backend is added. |
| D-020 | confirmed | tmux lookup failure | If `TMUX_PANE` exists but pane-index lookup fails, speak without a number and do not warn. | Speak without number | Preserves the primary alert and treats the pane label as optional context. | Lookup failures become frequent enough to require diagnostics. |
| D-021 | confirmed | Speech failure | If `/usr/bin/say` fails, warn once and disable speech for the rest of that session runtime. | Warn then disable | Avoids invisible or repeated failures; `/reload` or session replacement provides recovery. | Transient failures are observed in practice. |
| D-022 | confirmed | Pi compatibility | Document pi 0.84.4 or newer in README without runtime checking or package enforcement. | README requirement | Keeps runtime and git package structure lean while naming the verified hook boundary. | Compatibility failures show documentation is insufficient. |
| D-023 | confirmed | Verification | Require focused automated tests for config, phrase, tmux fallback, and process arguments, plus manual smoke testing in real pi, tmux, and macOS speech. | Focused tests plus smoke | Covers deterministic regressions and the host integration without a disproportionate terminal matrix. | Autofocus or cross-platform support is added. |
| D-024 | confirmed | Pane resolution | Resolve the current tmux pane index before every announcement using stable `TMUX_PANE`. | Every announcement | Prevents stale spoken indexes after pane renumbering or swaps for one small process per alert. | tmux lookup overhead becomes measurable. |
| D-025 | confirmed | Package layout | Include a minimal `package.json` with an explicit pi extension manifest rather than relying only on directory convention. | Convention-only was recommended | The user prefers explicit package metadata despite the small npm-install cost on git reconciliation. | npm publication or a compiled build is introduced. |
| D-026 | confirmed | Install source | Document the future canonical SSH remote `git@github.com:GyroZepelix/pi-aware.git` and the corresponding pi git-install command. | Generic syntax was recommended until a remote exists | The user supplied the intended canonical remote; the repository currently has no configured remote. | The actual configured or published remote differs. |
| D-027 | confirmed | Distribution | Publish as an open-source package under the MIT license. | Public MIT | Grants clear reuse rights and matches the intended git-installable package. | The distribution model changes. |
| D-028 | confirmed | Settled outcomes | Announce `finished` for every `agent_settled`, including aborted and unrecoverably failed runs. | Still say finished | The phrase means automatic work stopped and attention is needed, preserving error visibility without outcome tracking. | Users require success, abort, and error to sound different. |
| D-029 | confirmed | Initial version | Declare package version `0.1.0`. | `0.1.0` | Signals an initial usable release while allowing its small public interface to evolve. | A different release history exists before publication. |
| D-030 | confirmed | License attribution | Name `GyroZepelix` as the MIT copyright holder. | `GyroZepelix` | Matches the supplied GitHub repository owner without requiring a personal legal name. | Repository ownership or attribution requirements change. |

## Rejected alternatives

- A generic `needs input` phrase was rejected in favor of distinct question and finished announcements.
- Final-text question heuristics were rejected because they add complexity and produce false classifications.
- Window-plus-pane and stable pane-ID labels were rejected in favor of the displayed pane index.
- Silence outside tmux and use of pi session names were rejected.
- Project-local-only delivery and a multi-file runtime architecture were rejected.
- Speech in all pi modes was rejected.
- Environment-only and zero-configuration designs were rejected in favor of a config file.
- Voice-and-rate-only configuration and first-version event toggles were rejected.
- Per-field recovery from invalid config and disable-on-error behavior were rejected.
- Per-alert config reads and file watching were rejected in favor of `/reload`.
- Longer default phrases were rejected.
- Top-level global config and project overrides were rejected in favor of one extension-specific global path.
- App-level activation and exact pane focus were rejected for version 1.
- Restricting question announcements to known tool names and changing the UI phrase to `input` were rejected.
- Nested config groups, arbitrary speech-rate bounds, and type-only config checks were rejected.
- Unknown-key tolerance was rejected in favor of typo detection and all-default fallback.
- Silent or PATH-based non-macOS behavior was rejected.
- Warnings or dropped alerts on tmux lookup failure were rejected.
- Retrying or silently ignoring `/usr/bin/say` failures was rejected.
- Runtime pi-version checks and package-level compatibility metadata were rejected.
- Manual-only verification and a broad terminal/application matrix were rejected.
- Once-per-session pane resolution was rejected because pane indexes can change.
- Convention-only and compiled package layouts were rejected in favor of a minimal explicit manifest.
- Generic or deferred install-source documentation was rejected after the canonical SSH remote was supplied.
- Public-unlicensed and private-package distribution were rejected in favor of public MIT licensing.
- Suppressing abort/error alerts and adding a separate `stopped` outcome were rejected.
- Initial versions `1.0.0` and `0.0.1` were rejected in favor of `0.1.0`.
- `pi-aware contributors` and no-holder MIT attribution were rejected in favor of `GyroZepelix`.
- Global queuing and newest-wins cancellation were rejected; overlap is accepted.

## Open questions and prerequisites

No blocking design questions remain.

Explicit non-blocking unknowns:

- `Unknown`: The supplied canonical remote is not configured or published in the current checkout. Owner: user, before validating installation from GitHub.
- `Unknown`: Installed macOS voices vary by host. Invalid configured voice names are delegated to `/usr/bin/say` and follow the confirmed speech-failure policy.

## Current frontier

Empty. Awaiting final shared-understanding confirmation.

## Research index

- [Research index](./research/index.md)
- [Pi extension configuration conventions](./research/config-conventions.md)
- [macOS terminal focus behavior](./research/focus-behavior.md)
- [Pi lifecycle-hook compatibility](./research/pi-compatibility.md)

## Proposed test seams and acceptance evidence

- Proposed seam: pure phrase construction from event type and optional pane index.
- Proposed seam: strict all-or-default config parsing independent of filesystem I/O.
- Proposed seam: tmux pane-index lookup behind an injected command runner.
- Proposed seam: `/usr/bin/say` argument construction and launch behind an injected process runner.
- Automated evidence must cover defaults, every valid field, malformed JSON, invalid and unknown fields, phrase construction with and without pane index, tmux lookup success/failure, mode/platform gating, `say` arguments, and disable-after-failure behavior.
- Manual evidence must demonstrate `question 5` from a blocking extension UI, `finished 5` only after a settled run (including the accepted stop semantics), no-number fallback outside tmux or after lookup failure, config application after `/reload`, and one-warning disable behavior for invalid config and speech failure where practical.
- Package evidence must show the manifest exposes exactly `extensions/pi-aware.ts`, `pi -e .` or an equivalent local load succeeds, and the documented SSH install syntax matches `git@github.com:GyroZepelix/pi-aware.git`.
- Security evidence must show custom config text is passed as process arguments without shell interpolation.

## Proposed wiki updates after implementation

None currently proposed. The repository has no durable implementation knowledge yet, and discovery state must remain in this dossier.

## Resume state

Rounds 1 through 8 are persisted, the consequential frontier is empty, and the user confirmed the shared-understanding synthesis. Transition to `ready_for_spec`, validate the dossier, and hand off to `/skill:to-spec 260904-2205-tmux-aware-tts-notifications`.

## Readiness for To Spec

- [x] Every consequential branch is resolved or explicitly out of scope.
- [x] Facts are distinguished from user decisions and hypotheses.
- [x] Requirements, constraints, and non-goals are clear.
- [x] Acceptance evidence and proposed test seams are defined.
- [x] Contradictions are resolved or listed as blockers.
- [x] Current source and installed pi APIs were checked during discovery.
- [x] The user confirmed shared understanding.
