# Airwaves Studio editor UI mapping

The current Airwaves language uses an acid-green/black/paper palette, condensed display typography, ruled panels, compact uppercase labels, offset shadows, horizontal tool strips, right-side inspectors, modal dialogs, and bottom-sheet-like stacking at mobile breakpoints. The rebuild maps every editor group into those patterns and does not reproduce Songsterr styling.

| Editor group | Existing UI component/pattern | Desktop placement | Mobile placement | Shortcut | Selection scope | Implemented | Verified |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Transport and audition | Compact ruled button strip | Sticky workspace header | Horizontally scrolling top strip | Space | Cursor/selection | Yes | No |
| Undo/redo | Document action buttons | Header actions | Sticky action strip | Ctrl/Cmd Z, Shift Z | Arrangement | Yes | Yes — source-fed model test |
| Note/fret entry | Semantic score cells + status readout | Center score canvas | Full-width canvas | 0–9 | Cursor/note | Yes | No |
| Duration and rhythm | Primary segmented toolbar | Above score | Horizontal tool tray | — | Beat/range | Yes | Yes — exact-tick model test |
| Tuplets | Grouped command menu | Rhythm overflow | Dialog | — | Beat | Yes | Yes — serializer/model test |
| Dynamics/hairpins | Inspector segmented buttons | Right inspector | Stacked inspector | — | Beat | Yes | No |
| Articulation/sustain | Inspector grouped buttons | Right inspector | Stacked inspector | — | Note/beat | Yes | No |
| Fretted effects | Grouped effect drawer | Right inspector | Stacked inspector | — | Note(s) | Yes; curve presets only | No |
| Picking/brush/arpeggio | Grouped command drawer | Right inspector | Stacked inspector | — | Beat | Yes | No |
| Percussive techniques | Instrument-aware inspector | Right inspector | Stacked inspector | — | Note | Yes | No |
| Grace/tremolo/vibrato | Grouped command drawer | Right inspector | Stacked inspector | — | Note/beat | Yes | No |
| Golpe/wah | Grouped command drawer | Right inspector | Stacked inspector | — | Note(s) | Yes | No |
| Measure/repeat structure | Measure inspector | Right inspector | Stacked inspector | — | Measure | Yes | Yes — aligned-bar model test |
| Feel interpretation | Measure inspector select | Right inspector | Stacked inspector | — | Measure | Yes | No |
| Insert beat/bar | Primary structural toolbar | Above score | Horizontal tool tray | — | Beat/measure | Yes | Yes — aligned-bar model test |
| Sections/annotations/chords | Labeled form controls | Right inspector | Stacked inspector | — | Measure/beat | Yes | No |
| Pitch/string movement | Inspector fields + arrows | Inspector/canvas | Stacked inspector | Arrows | Note(s) | Yes | No |
| Voices 1–4 | Segmented tab pattern | Score header | Scrolling segmented strip | — | Active voice | Yes | Yes — model test |
| Clipboard | Document action group | Primary toolbar | Horizontal tool tray | — | Beat range | Yes | No |
| Track operations | Track rail/card pattern | Left rail | Stacked drawer | — | Track | Yes | No |
| Song metadata/draft | Page-header forms/status | Studio header | Stacked header | Ctrl/Cmd S | Arrangement | Yes | No |
| Validation/submission | Acid status band | Below score | Below score | — | Voice/measure | Yes | Yes — model test |
| Help/command search | Modal/card language | Centered command dialog | Full-screen dialog | Ctrl/Cmd K | Global | Yes | No |

Browser-level verification remains `No` where the required in-app browser was unavailable during this rebuild. Static module syntax, DOM contracts, and the score-model cases called out above were executed successfully.
