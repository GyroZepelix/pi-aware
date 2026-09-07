# Wiki Log

Curated append-only timeline of durable wiki maintenance events. This is not a codebase changelog, commit log, or session transcript.

Use this shape for new entries:

- Heading: `## [YYYY-MM-DD] <kind> | <short title>`.
- Trigger: why the wiki was updated.
- Inputs: source paths, commit ranges, specs, verification, outcomes, URLs, or raw files used as evidence.
- Wiki pages changed: wiki files changed.
- Verification: checks or source verification.
- Notes: gaps, conflicts, stale areas, or exceptions.

## [2026-09-04] install | repo wiki template

- Trigger: user requested installation from `https://git.dgjalic.com/dgjalic/repo-wiki-template`.
- Inputs: protocol version 1 payload from `https://git.dgjalic.com/dgjalic/repo-wiki-template/install/template/`.
- Wiki pages changed: `wiki/AGENTS.md`, `wiki/index.md`, `wiki/log.md`, `wiki/state.md`, `wiki/raw/README.md`.
- Verification: required files and managed regions exist; existing files were preserved or merged; protocol validation result was recorded.
- Notes: installed payload may also create or merge root and spec files; initial codebase ingest is still needed.

## [2026-09-04] dream | pi-aware implementation and window index

- Trigger: `/dream` run after implementing and verifying the initial extension and its window-index refinement.
- Inputs: `extensions/pi-aware.ts`, `tests/pi-aware.test.ts`, `README.md`, `package.json`, and active plans `260904-2205-tmux-aware-tts-notifications` and `260904-2305-speak-tmux-window-index`.
- Wiki pages changed: `wiki/pi-aware.md`, `wiki/dreams/2026-09-04-2314-completed-session.md`, `wiki/dreams/MEMORY.md`, `wiki/index.md`, `wiki/log.md`.
- Verification: re-read changed files, checked links, ran memory safety scans, confirmed the memory pointer budget, and checked that all Dream changes stayed under `wiki/`.
- Notes: remote installation, persistent host config/reload, real speech-failure recovery, and provider-backed settled behavior remain unverified; no observation entry was needed.

## [2026-09-07] update | session-local voice toggle

- Trigger: implementation and verification of the `/pi-aware` current-session voice-notification toggle.
- Inputs: `extensions/pi-aware.ts`, `tests/pi-aware.test.ts`, `README.md`, and active plan `260907-1141-toggle-per-session-voice-notifications`.
- Wiki pages changed: `wiki/pi-aware.md`, `wiki/log.md`.
- Verification: `bun test` passed 12 tests with 82 expectations; package, documentation, runtime-scope, and diff checks passed; a no-provider TUI smoke loaded the extension and showed disabled then enabled command feedback without audio.
- Notes: audible suppression and provider-backed `agent_settled` smoke checks were not run because they remain approval-gated; automated tests cover both event paths and the asynchronous disable race.
