# Airwaves Studio parity checklist

Status values: `not started`, `partial`, `verified`, `excluded: AI`, or `blocked: backend`.

This checklist tracks behavioral coverage from the reconstruction specification. Songsterr is a behavior reference only; Airwaves branding and interaction patterns remain authoritative. Every Songsterr Plus (paid) feature is a target for the free build here — there is no entitlement layer, and AI-generated transcription is excluded on principle, not gated by payment.

## 2026-08-21 re-audit against songsterr.com

Confirmed current Songsterr Plus-gated features (all to be implemented here as free, always-on): pause-free original-audio sync, playback speed control, high-contrast print, per-tab MIDI/Guitar Pro/MP3/WAV download, per-track solo/mute, loop, audio pitch shift (for alternate tunings, independent of notation), and an ad-free view. Confirmed free-tier baseline: account creation/sync, sheet-view toggle (web only), tuner, metronome, count-in. Confirmed excluded-by-policy: AI YouTube/audio-to-tab transcription. Confirmed default editor shortcuts (E activate editor, T tracks, S speed, L loop, N metronome, C count-in, M mute, Alt+M solo, P print, Space play/pause, arrow keys navigate/shift pitch, 0–9 fret entry) — Airwaves keeps its own shortcut set (`⌘K` command palette, `Ctrl+Z`/`Shift+Z` undo/redo, arrows for cursor + pitch nudge) rather than remapping to Songsterr's single-letter scheme, since the two already collide (e.g. Shift+Arrow is beat-range selection here vs. loop-boundary resize there).

## Gap matrix after the clean rebuild

| Product area | Baseline before rebuild | Target for this rebuild | Status |
| --- | --- | --- | --- |
| Editable score model | Rebuilt from scratch | Stable tick-based arrangement, four voices, rich metadata/effects, normalization | verified |
| Selection | Rebuilt from scratch | Cursor, note/chord selection and beat-range extension | partial |
| Command history | Rebuilt from scratch | Atomic before/after commands with exact selection restoration and dirty baseline | verified |
| Direct entry | Rebuilt from scratch | Multi-digit fret entry, pitch movement and chord-note entry | partial |
| Rhythm | Durations, dots, triplet, rests | 1/64–whole, dots, ties, tuplets 2–9, exact validation and repair | partial |
| Effects | Small quick-effect list | Explicit commands for every Section 15 effect group | partial |
| Structure | Per-track bar insert/delete | Aligned cross-track bars, repeats/endings, tempo/signature, pickup and feel | partial |
| Tracks | Add, rename, delete | Duplicate/reorder, instrument metadata, tuning/capo, mixer and visibility | partial |
| Renderer | Semantic edit grid + alphaTab preview | Shared model for Tab/Sheet, selection/cursor/loop overlays, multi-track view | partial |
| Playback/practice | Synth playback, speed, metronome, per-track mute/solo/volume mixer, bar-range loop, playback pitch shift | Selection playback, count-in policy, transpose/pitch state, track autoswitch | partial |
| Persistence | Local IndexedDB autosave | Versioned drafts, recovery, selection/preferences, conflict guard | partial |
| Import/export | alphaTab import and GP/AlphaTex/JSON/print | Previewed import, warnings, clean round-trip paths and progress states | partial |
| Revisions | Rebuilt from scratch | Named local snapshots and restore | partial |
| Search/library | Rebuilt from scratch | Local title/artist search and draft loading | partial |
| Chords workspace | None | Structured chord/lyric editing and autoscroll | not started |
| Accounts/cross-device sync | No backend | Real authenticated persistence services | blocked: backend |
| Moderated publication | No backend | Submission, moderation, audit and permissions | blocked: backend |
| AI functionality | Not present | Remain absent | excluded: AI |
| Paid functionality | Not present | All controls free; no entitlement layer | verified |

## Editor foundation

- [x] Versioned arrangement model separated from player/editor state — `verified`
- [x] PPQ/tick timing and measure tempo events — `verified`
- [x] Four independent voices — `verified`
- [ ] Explicit note/chord and beat-range selection — `partial`
- [x] Atomic command history and exact selection restore — `verified`
- [x] Dirty baseline, local save and delayed autosave — `verified`
- [x] Blank score with guitar, bass, drums, keys, voice and winds — `verified`
- [ ] Guitar Pro/AlphaTex/JSON import into editable structure — `partial`

## Section 15 command inventory

- Duration/rest/dot/tie — `partial`
- Tuplets 2–9 and remove — `verified`
- Dynamics and hairpins — `partial`
- Articulation and sustain — `partial`
- Fretted effects and curve editors — `partial`
- Picking/scrape/arpeggio/brush — `partial`
- Percussive techniques — `partial`
- Grace notes — `partial`
- Tremolo picking — `partial`
- Vibrato variants — `partial`
- Golpe and wah — `partial`
- Repeats/endings/tempo/signature/pickup/half-time/double-time — `partial`
- Feel interpretation — `partial`
- Beat/bar insertions — `partial`
- Sections/annotations/chords/slash/lyrics — `partial`
- Pitch/string movement and transpose — `partial`
- Voices and move/copy between voices — `partial`
- Clipboard and aligned cross-track operations — `partial`

## Player and practice

- Tab/Sheet shared position — `partial`
- Synth transport — `partial`
- Original-audio sync anchors — `not started`
- Speed 15–175% and BPM fine adjustment — `partial`
- Loop range and keyboard boundary movement — `not started`
- Solo/mute/track volume mixer — `verified` (per-track M/S buttons in the track rail and inspector, wired live to the alphaTab synth via `changeTrackMute`/`changeTrackSolo`/`changeTrackVolume`, persisted with the project and undoable); master mixer view/pan — `not started`
- Count-in and metronome volume — `partial`
- Loop range — `verified` (LOOP ◀/▶ set start/end to the selected bar, LOOP × clears back to full-song, range highlighted in the score map, applied to the alphaTab synth via `playbackRange` and reapplied on every score reload; session-only like Songsterr's own loop, not saved with the project)
- Audio pitch shift — `verified` (±12 semitone transport control; transposes track tuning/MIDI pitch in a preview-only clone of the arrangement so the synth sounds shifted — e.g. for alternate tunings — while the saved tab and displayed notation are untouched); notation transpose (permanently changing the authored notes) remains `partial`, covered by existing pitch/string movement commands
- Track autoswitch and multi-display — `not started`
- MIDI/GP/synth audio/print exports — `partial`

## Supporting product surfaces

- Local project search/filter — `partial`
- Favorites/playlists/contributions — `blocked: backend`
- Revision list and restore — `partial`; musical diff remains `not started`
- Chord/lyric editor and autoscroll — `not started`
- Searchable help and full shortcut reference — `partial`
- Responsive/mobile editor controls — `partial`
- Keyboard and screen-reader coverage — `partial`

## Verification gate

Nothing is marked `verified` merely because a control is visible. Verification requires a state change, persistence where applicable, undo/redo coverage for edits, and a test or documented manual scenario.
