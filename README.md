# Airwaves Official Site

The Airwaves band site includes public news, media, releases, show information, profiles, and contact pages plus a protected **Backstage Pass** containing the Next Set calculator and Airwaves Studio.

## Pages

- `index.html` — AIRWAVES / landing page
- `news.html`, `media.html`, `releases.html` — animated content-card pages
- `next-show.html` — next live date and lineup
- `about.html`, `contact.html` — members and contact
- `detail.html` — detail page used by news, media, releases, and member cards
- `backstage.html` — protected crew-tool launcher
- `next-set.html` — protected set calculator
- `studio.html` — protected notation and tablature workspace

Every section is a real HTML page and works from a user/organization Pages site or a project Pages subdirectory because all site paths are relative.

## Edit public content

Routine content updates happen in `site.config.js`. It contains the navigation, next-show details and lineup, news cards, media cards, releases, members, contact email, and introductory copy.

To add a card or member, duplicate an object in the relevant array and give it a unique lowercase `slug`. A detail page and back button are generated automatically. Images are optional; add a relative property such as `image: "images/show-photo.jpg"`.

## Backstage Pass

Backstage access covers `backstage.html`, `next-set.html`, and `studio.html`, including direct visits to either tool. A successful login lasts for the current browser tab. **Lock Backstage Pass** in the main menu clears that session.

Airwaves Studio is temporarily unlisted from the Backstage Pass launcher (`backstage.html`) during a rehaul — only the Next Set calculator is shown there. `studio.html`/`studio-app.mjs`/`studio-core.mjs`/`studio-synth.mjs` are untouched and still protected by the same login; only its launcher card was removed. Restore the `<a class="backstage-card ...">AIRWAVES STUDIO...</a>` block (and the `single` class on `.backstage-grid`) to bring it back.

The password is processed with PBKDF2-SHA-256 in the browser. Only its derived verifier is stored in `site.js`; neither the plain password nor an entered password is written to browser storage. See `SECURITY.md` for the production security boundary.

> GitHub Pages is static public hosting. This client-side gate discourages casual access but cannot provide true server-side security: repository files and downloaded assets remain public. Never store unreleased audio, personal data, API keys, or other secrets in this repository. For real access control, put the deployed site behind Cloudflare Access or move the protected area to a host with server-side authentication.

## Airwaves Studio

Studio's tab rendering and audio playback are in-house: the editable score grid and the synth (`studio-synth.mjs`, built on the standard Web Audio API — oscillators and filtered noise, no samples) are Airwaves' own code, not a third-party notation engine. The single tab view doubles as the playback surface, with the playing beat highlighted directly in place — there is no separate preview panel. [alphaTab](https://www.alphatab.net/) (pinned to `1.8.4` from jsDelivr) is still loaded, but only as a file-format library for Guitar Pro import/export conversion; it never renders or plays anything. An internet connection is only needed for that GP conversion path (and for MusicXML/Capella import, which alphaTab's importer also handles) — everything else works offline once the page has loaded.

The Studio is editor-first and has no accounts, subscriptions, upgrade prompts, marketplace, or locked editing tools. Its native Airwaves project model stores tracks, measures, four voices per measure, beats, notes, rests, tuplets, effects, and timing at 960 PPQ. Changes run through an undoable command history and autosave locally after editing.

Core workflows:

- create guitar, bass, drum, and pitched-instrument tracks; rename or remove tracks; edit tuning and capo
- edit bars, time signatures, four voices, beat durations from whole notes to 1/64 notes, rests, dots, triplets, chords, dynamics, tab positions, MIDI pitches, and drum articulations
- apply ties, accents, staccato, let ring, palm mute, ghost notes, harmonics, hammer-ons/pull-offs, slides, bends, and vibrato
- see exact underfull/overfull bar validation and fit the active voice to its bar with rests
- use structural copy/paste, keyboard note entry, and undo/redo command history
- import Guitar Pro (`.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`), MusicXML, Capella, AlphaTex, and Airwaves JSON backups into the editable model
- play, pause, stop, loop a bar range, adjust playback speed/volume/pitch, metronome and count-in, via the in-house synth
- save and autosave versioned projects in local browser storage, with named local snapshots
- export AlphaTex, Guitar Pro 7, or a complete Airwaves JSON project backup
- open a print-optimized score and choose **Save as PDF** in the system print window

Projects are local to the current browser profile and device; browser data clearing removes them. Export AlphaTex or a project backup for portable copies. Guitar Pro and MusicXML imports are conversions, so review complex articulations, automation, and page layout before sharing the chart.

## Next Set calculator

Paste one or more YouTube URLs. The calculator reads public metadata and duration, keeps a running set total, reports how far under or over the limit the set is, and chooses the mathematically closest single-song cut.

Metadata is read through YouTube oEmbed with a Noembed fallback. Duration first uses the optional secure endpoint configured in `site.config.js`; the deployable implementation is in `airwaves-api/`. Without that endpoint, the calculator creates an identified HTTPS YouTube iframe with explicit origin, widget referrer, and iframe referrer policy. Opening the HTML directly through `file://`, privacy software that removes referrers, current Safari/WebKit failures, non-embeddable videos, and YouTube-side player regressions can still block iframe duration. In those cases the secure endpoint is the reliable path; retry, open-video and manual-duration controls remain available.

## Run locally

```powershell
py -m http.server 4173
```

Open `http://127.0.0.1:4173`. Opening the HTML files directly with `file://` can prevent IndexedDB, Web Crypto, playback workers, or external metadata requests from working correctly.

The full-screen AIRWAVES intro plays only on the home page (`index.html`), and only the first time a given browser profile lands there — visiting other pages first doesn't consume it. To test it again, delete the `aw-intro-seen-v1` local-storage item in browser developer tools.

## Publish on GitHub Pages

For the current account:

1. Create a repository owned by `blxchen` named exactly `airwaves.github.io`.
2. Push these files to its `main` branch.
3. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
4. The included workflow deploys every push to `main`.
5. The site will be available at `https://blxchen.github.io/`.

For another account, create `<username>.github.io` under that account and push the same files. No code changes are needed. The repository is prepared locally but has not been created or published automatically.
