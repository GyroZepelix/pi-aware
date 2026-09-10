# pi-aware

`pi-aware` is a lean macOS extension for [pi](https://github.com/badlogic/pi-mono) that speaks when pi needs attention. Inside tmux, each announcement includes the current displayed window index.

Examples:

```text
question 5
finished 5
```

Outside tmux, or when tmux lookup fails, it says only `question` or `finished`.

Before speaking, `pi-aware` checks whether any process is actively using audio input. New speech is silently suppressed during calls, recordings, dictation, and other microphone use. Run `/pi-aware` to disable or re-enable all voice notifications for the current Pi session. The command reports the new state in the UI without speaking it.

## Requirements

- macOS 26.0 or newer
- Apple Silicon (`arm64`)
- pi 0.84.4 or newer
- Interactive TUI mode
- tmux only when window indexes are wanted

The extension uses macOS `/usr/bin/say` and a bundled first-party helper that reads the system CoreAudio state. CoreAudio is part of macOS and does not need to be installed separately. Installed users do not need compiler tools or third-party runtime or development dependencies.

## Install

Install from the SSH git source:

```sh
pi install git:git@github.com:GyroZepelix/pi-aware.git
```

Then start or reload pi. At the initial implementation point, remote installation remains unverified until that GitHub repository is published. To load the current checkout directly instead:

```sh
pi -e .
```

## Behavior

- Every blocking extension UI prompt starts a `question` announcement.
- Every `agent_settled` event starts a `finished` announcement.
- `finished` means pi has stopped automatic work. It also applies after aborts and unrecoverable failures; it does not mean success.
- `ui_prompt_start` includes select, confirm, input, editor, and custom blocking UI. Some of those interfaces may not be literal questions.
- Ordinary questions in assistant prose are not detected separately. A final prose question receives only the normal `finished` announcement.
- Each alert targets the current pane through `TMUX_PANE` and queries its tmux window index with `#{window_index}`.
- Automatic microphone suppression starts enabled. Each otherwise eligible alert takes a CoreAudio snapshot immediately before speech and stays silent when any process has active audio input.
- The snapshot identifies only whether input is active. It does not capture audio, identify the process, or show a per-event notification. Input can change in the brief interval between the snapshot and speech launch.
- Detection failures warn once per runtime and fail open, so the alert speaks normally. Later alerts retry detection.
- Speech starts without waiting for earlier announcements, so overlapping alerts may overlap.
- Voice notifications start enabled. `/pi-aware` toggles both question and finished speech for the current in-memory session and displays the new state as an informational UI message.
- The toggle does not suppress extension warnings or cancel speech that is already playing. `/reload`, `/new`, `/resume`, and `/fork` reset it to enabled.
- Print, JSON, and RPC modes are silent.
- Interactive non-macOS sessions receive one warning and remain disabled.
- A `/usr/bin/say` failure warns once and disables speech until `/reload` or session replacement. Toggling `/pi-aware` cannot clear that failure state.

The extension does not focus a terminal, window, tab, or pane. It does not coordinate speech across pi sessions.

## Configuration

Configuration is optional. Create `extensions/pi-aware/config.json` inside pi's global agent directory. The default location is:

```text
~/.pi/agent/extensions/pi-aware/config.json
```

Pi can use a different agent directory, and `pi-aware` follows the directory reported by pi rather than hardcoding this path.

All fields are optional:

```json
{
  "voice": "Samantha",
  "rate": 200,
  "finishedPhrase": "finished",
  "questionPhrase": "question",
  "suppressWhileMicrophoneInUse": true
}
```

- `voice`: A non-empty macOS voice name. Omit it for the system default.
- `rate`: A positive finite number. Omit it for the system default.
- `finishedPhrase`: A non-empty string, default `finished`.
- `questionPhrase`: A non-empty string, default `question`.
- `suppressWhileMicrophoneInUse`: A boolean, default `true`. Set it to `false` to skip microphone checks and preserve the existing speech flow.

Strings are trimmed. Unknown fields, malformed JSON, wrong types, empty strings, and invalid rates reject the entire file. The extension warns once and uses all defaults, including microphone suppression enabled. A missing file silently uses defaults.

Run `/reload` after creating or changing the file. Configuration is loaded at session startup and is not watched.

## Development

Run the dependency-free test suite with Bun:

```sh
bun test
```

The packaged microphone helper is already built. Contributors with Apple's Command Line Tools can rebuild and ad-hoc sign the macOS 26 arm64 binary from source:

```sh
npm run build:mic-helper
```

Check the package contents without publishing:

```sh
npm pack --dry-run
```

## Manual smoke test

On macOS 26 or newer on Apple Silicon:

1. Run `pi -e .` and confirm pi starts without an extension error or microphone-permission prompt.
2. Run `bin/pi-aware-mic-status` while no application is capturing input and confirm it prints `inactive`. Start a known microphone consumer such as a Teams call and confirm it prints `active`.
3. Without sending a provider prompt, run `/pi-aware` twice. Confirm the UI reports disabled and then enabled, with no spoken command confirmation.
4. Inside tmux, trigger a blocking extension UI while the microphone is inactive and listen for `question <window-index>`.
5. While the microphone is active, trigger the same UI and confirm no speech starts. Stop microphone use and confirm a later alert can speak.
6. Set `suppressWhileMicrophoneInUse` to `false`, run `/reload`, and confirm eligible speech is no longer suppressed by active input.
7. Run `/pi-aware` to disable notifications, trigger the same UI, and confirm it stays silent without a microphone check. Run `/pi-aware` again to re-enable notifications.
8. Finish and abort separate agent runs and listen for `finished <window-index>` after each settles.
9. Change or renumber the window index and confirm the next alert uses the new number. Run outside tmux and confirm phrases omit the number.
10. Add valid and invalid config in turn, using `/reload` after each. Confirm valid values apply and invalid config warns once before using all defaults.
11. Where safe, induce a `say` failure, confirm one warning and no later speech, and confirm toggling `/pi-aware` does not bypass the failure. Repair the config and run `/reload` to recover.

Provider-backed prompts may incur provider costs. Remote installation and provider-backed smoke tests should be run only after their prerequisites are approved.

## License

MIT, see [LICENSE](./LICENSE).
