# macOS terminal focus behavior

Status: Complete
Source date: 2026-09-04

## Question

Can a lean pi extension reliably focus the exact terminal window and tmux pane that requested attention?

## Findings

- `Fact`: A process inside tmux sees `TERM_PROGRAM=tmux` in the inspected environment, not the outer terminal application. The tmux client reported `xterm-ghostty`, which is descriptive but not a portable application identifier.
- `Fact`: A tmux pane identifies a server-side pane. The same session or window may be attached to multiple terminal clients, so a pane does not always identify one physical macOS window.
- `Fact`: tmux can select a target window and pane, but doing so changes tmux state and still does not foreground the corresponding macOS application window.
- `Fact`: macOS `open -a <application>` can bring an application forward, but it cannot select the exact terminal window or tmux client.
- `Fact`: Exact window or session focusing is terminal-specific. Terminal.app and iTerm2 can map TTYs through distinct AppleScript APIs. Ghostty can focus a terminal by a previously captured terminal UUID, but its stable API does not provide a general tmux-pane-to-window mapping.
- `Fact`: macOS may require Automation permissions for AppleScript control, introducing setup and failure modes beyond text-to-speech.

## Interpretation

Reliable exact focus is not a generic macOS or tmux operation. A version that merely activates a terminal application may raise the wrong window. A version that targets the exact pane requires terminal-specific adapters, client selection policy, permission handling, and potentially tmux state mutation. This conflicts with the stated extremely lean, simple, terminal-agnostic first version.

## Recommendation

Keep version 1 auditory only and explicitly exclude autofocus. Revisit focus as a separate feature with a named set of supported terminal applications if sound alone proves insufficient.

## Sources

- [Ghostty AppleScript API](https://ghostty.org/docs/features/applescript)
- [tmux manual source](https://raw.githubusercontent.com/tmux/tmux/master/tmux.1)
- [TTY lookup discussion for Terminal.app](https://stackoverflow.com/questions/45765827/how-to-return-the-tty-of-the-frontmost-raised-focused-terminal-window)
- Local read-only evidence: `open(1)` manual, tmux 3.6b formats/client output, and the current environment variables.
