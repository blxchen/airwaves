import {
  clone, CommandHistory, createArrangement, createBeat, createMeasure, createNote, createTrack,
  deleteAlignedMeasure, duplicateAlignedMeasure, fitVoiceToMeasure, getBeat, getMeasure, getNotes,
  getTrack, getVoice, insertAlignedMeasure, midiName, normalizeArrangement, normalizeSelection,
  PPQ, reflowMeasure, reflowVoice, toAlphaTex, validateArrangement, validateMeasure,
} from "./studio-core.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE = "airwaves-studio-v4";
const PREFS = "airwaves-studio-prefs-v4";
const EFFECTS = ["ghost", "accent", "heavyAccent", "staccato", "letRing", "palmMute", "dead", "naturalHarmonic", "artificialHarmonic", "hammerPull", "legatoSlide", "shiftSlide", "slideInBelow", "slideInAbove", "slideOutDown", "slideOutUp", "bend", "trill", "tapping", "slapping", "popping", "pickScrapeDown", "pickScrapeUp", "vibrato", "wideVibrato", "tremoloVibrato", "wideTremoloVibrato", "golpeFinger", "golpeThumb", "wahOpen", "wahClosed"];
const BEAT_EFFECTS = ["hairpin", "brush", "arpeggio", "pickStroke", "grace", "tremoloPicking", "sustainPedal"];
const QUICK_EFFECTS = ["hammerPull", "legatoSlide", "bend", "vibrato", "palmMute", "letRing"];
const NOTE_INDEX = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const state = {
  arrangement: createArrangement(), selection: null, history: new CommandHistory(), clipboard: null,
  display: "tab", inspector: "selection", drafts: [], snapshots: [], alpha: null, preview: false,
  renderTimer: 0, fretBuffer: "", fretTimer: 0, pitchShift: 0, loop: { startMeasure: null, endMeasure: null }, playbackMeasure: -1, popoverOpen: false,
};

function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function readStore() { try { return JSON.parse(localStorage.getItem(STORAGE)) || { drafts: [], snapshots: [] }; } catch { return { drafts: [], snapshots: [] }; } }
function writeStore() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ drafts: state.drafts.slice(0, 50), snapshots: state.snapshots.slice(0, 100) })); return true; }
  catch { toast("BROWSER STORAGE IS FULL — DOWNLOAD A PROJECT JSON BACKUP", true); return false; }
}
function formatDate(value) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatTime(ms) { const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function toast(message, error = false) { const node = $("#studio-toast"); node.textContent = message; node.classList.toggle("error", error); node.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("show"), 2600); }

function activeTrack() { return getTrack(state.arrangement, state.selection?.trackId); }
function activeMeasure() { return getMeasure(state.arrangement, state.selection); }
function activeVoice() { return getVoice(state.arrangement, state.selection); }
function activeBeat() { return getBeat(state.arrangement, state.selection); }
function editableBeat(arrangement, selection) {
  const voice = getVoice(arrangement, selection);
  if (!voice.beats.length) voice.beats.push(createBeat(getTrack(arrangement, selection.trackId).family, { rest: true }));
  selection.beatIndex = Math.max(0, Math.min(selection.beatIndex, voice.beats.length - 1));
  return getBeat(arrangement, selection);
}
function touchStatus(message = "CHANGES NOT SAVED") { $("#score-status").textContent = message; $("#studio-save-state").textContent = state.history.isDirty(state.arrangement) ? "UNSAVED" : "SAVED LOCAL"; }

function run(type, label, mutate, payload = null) {
  const result = state.history.run({ type, label, payload, arrangement: state.arrangement, selection: state.selection, mutate });
  if (!result.command) return;
  state.arrangement = result.arrangement; state.selection = result.selection;
  touchStatus(label.toUpperCase()); render(); schedulePreview();
  queueAutosave();
}

function setSelection(next, options = {}) {
  const prior = state.selection;
  state.selection = normalizeSelection(state.arrangement, { ...prior, ...next });
  if (options.range && prior?.measureIndex === state.selection.measureIndex && prior?.trackId === state.selection.trackId) {
    state.selection.rangeStart = Math.min(prior.beatIndex, state.selection.beatIndex);
    state.selection.rangeEnd = Math.max(prior.beatIndex, state.selection.beatIndex);
  }
  render(false);
}

function render(full = true) {
  state.selection = normalizeSelection(state.arrangement, state.selection || { trackId: state.arrangement.tracks[0]?.id });
  if (full) { renderFields(); renderLibrary(); renderTracks(); renderMap(); renderScore(); }
  else { renderTracks(); renderMap(); renderScore(); }
  renderInspector(); renderValidation(); renderButtons(); renderLoopReadout(); renderNotePopover();
}

function effectAbbr(effect) { return effect.replace(/([A-Z])/g, " $1").trim().split(" ").map((word) => word[0]).join("").toUpperCase(); }
function renderNotePopover() {
  const popover = $("#note-popover");
  if (!state.popoverOpen) { popover.hidden = true; return; }
  const cell = $(".s3-beat.selected");
  if (!cell) { state.popoverOpen = false; popover.hidden = true; return; }
  const track = activeTrack(), note = getNotes(state.arrangement, state.selection)[0];
  let fieldHtml;
  if (note && ["guitar", "bass"].includes(track.family)) fieldHtml = field("FRET", "note.fret", note.fret, "number", `min="0" max="${track.maxFret}"`);
  else if (note && track.family === "drums") fieldHtml = field("HIT", "note.articulation", note.articulation);
  else if (note) fieldHtml = field("PITCH", "note.midiPitch", note.midiPitch, "number", 'min="0" max="127"');
  else fieldHtml = `<span class="s3-popover-rest">REST — PRESS 0–9 TO ENTER A NOTE</span>`;
  const effectButtons = note ? QUICK_EFFECTS.map((effect) => `<button type="button" data-effect="${effect}" class="${note.effects?.[effect] ? "active" : ""}" title="${effect}">${effectAbbr(effect)}</button>`).join("") : "";
  const tieButton = note ? `<button type="button" data-command="tie" class="${note.tieFromPrevious ? "active" : ""}" title="Tie">TIE</button>` : "";
  popover.innerHTML = `<button type="button" class="s3-popover-close" data-popover-close aria-label="Close">×</button>${fieldHtml}<div class="s3-popover-effects">${effectButtons}${tieButton}</div>`;
  popover.hidden = false;
  const rect = cell.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - popover.offsetWidth - 8, rect.left));
  const top = Math.max(8, rect.top - popover.offsetHeight - 10);
  popover.style.left = `${left}px`; popover.style.top = `${top}px`;
}

function renderFields() {
  $("#project-title").value = state.arrangement.metadata.title; $("#project-artist").value = state.arrangement.metadata.artist;
  $("#project-arrangement").value = state.arrangement.metadata.arrangementTitle; $("#project-tempo").value = state.arrangement.tempo;
}

function renderLibrary() {
  const query = $("#library-search").value.trim().toLowerCase();
  const drafts = state.drafts.filter(({ arrangement }) => !query || `${arrangement.metadata.title} ${arrangement.metadata.artist}`.toLowerCase().includes(query));
  $("#project-library").innerHTML = drafts.length ? drafts.map((draft) => `<button type="button" data-load-draft="${esc(draft.arrangement.id)}"><strong>${esc(draft.arrangement.metadata.title)}</strong><span>${esc(draft.arrangement.metadata.artist)}</span><small>${formatDate(draft.savedAt)}</small></button>`).join("") : `<p>NO MATCHING LOCAL TABS.</p>`;
}

function renderTracks() {
  $("#track-list").innerHTML = state.arrangement.tracks.map((track, index) => `<div class="s3-track-row"><button type="button" class="s3-track-select ${track.id === state.selection.trackId ? "active" : ""}" data-track-id="${track.id}"><i>${String(index + 1).padStart(2, "0")}</i><span><strong>${esc(track.name)}</strong><small>${esc(track.family)} / ${esc(track.notation)}</small></span></button><div class="s3-track-mix"><button type="button" class="${track.muted ? "active" : ""}" data-track-mix="muted" data-track-id="${track.id}" aria-pressed="${Boolean(track.muted)}" title="Mute">M</button><button type="button" class="${track.solo ? "active" : ""}" data-track-mix="solo" data-track-id="${track.id}" aria-pressed="${Boolean(track.solo)}" title="Solo">S</button></div></div>`).join("");
}

function renderMap() {
  const track = activeTrack(); if (!track) return;
  const bounds = loopBounds();
  $("#score-map-count").textContent = `${track.measures.length} BARS`;
  $("#score-map").innerHTML = track.measures.map((measure, index) => {
    const report = validateMeasure(measure).voices[state.selection.voice - 1];
    const inLoop = bounds && index >= bounds.start && index <= bounds.end;
    return `<button type="button" class="${index === state.selection.measureIndex ? "active" : ""} ${report.status} ${inLoop ? "in-loop" : ""}" data-bar="${index}"><b>${index + 1}</b><span>${measure.timeSignature.numerator}/${measure.timeSignature.denominator}</span><i>${report.status}</i></button>`;
  }).join("");
}

function noteLabel(note, track) {
  if (!note) return "·";
  if (track.family === "drums") return String(note.articulation || "HIT").replace(/[a-z]/g, "").slice(0, 4);
  if (["guitar", "bass"].includes(track.family)) return note.effects?.dead ? "×" : String(note.fret ?? 0);
  return midiName(note.midiPitch);
}

function noteLane(note, track) {
  if (["guitar", "bass"].includes(track.family)) return Math.max(1, Math.min(track.stringCount, Number(note?.string) || 1));
  if (track.family === "drums") {
    const name = String(note?.articulation || "").toLowerCase();
    if (name.includes("cymbal") || name.includes("crash")) return 1;
    if (name.includes("hat")) return 2;
    if (name.includes("tom")) return 3;
    if (name.includes("snare")) return 4;
    return 5;
  }
  return Math.max(1, Math.min(5, 5 - Math.round(((Number(note?.midiPitch) || 60) - 48) / 12)));
}

function renderScore() {
  const track = activeTrack(); if (!track) return;
  const voiceIndex = state.selection.voice - 1;
  $("#active-track-label").textContent = `${track.name} / ${track.family}`.toUpperCase();
  $("#active-score-label").textContent = `VOICE ${state.selection.voice} / ${state.display.toUpperCase()}`;
  $("#selection-readout").textContent = `BAR ${state.selection.measureIndex + 1} / BEAT ${state.selection.beatIndex + 1}`;
  $("#semantic-score").className = `s3-score is-${state.display} family-${track.family}`;
  $("#semantic-score").innerHTML = track.measures.map((measure, measureIndex) => {
    const voice = measure.voices[voiceIndex];
    const laneCount = ["guitar", "bass"].includes(track.family) ? track.stringCount : 5;
    const beats = voice.beats.length ? voice.beats : [createBeat(track.family, { rest: true })];
    const beatHtml = beats.map((beat, beatIndex) => {
      const selected = measureIndex === state.selection.measureIndex && beatIndex === state.selection.beatIndex;
      const inRange = measureIndex === state.selection.measureIndex && beatIndex >= state.selection.rangeStart && beatIndex <= state.selection.rangeEnd;
      const labels = beat.rest || !beat.notes.length ? `<em>REST</em>` : beat.notes.map((note, noteIndex) => `<i class="${selected && state.selection.noteIndices.includes(noteIndex) ? "note-selected" : ""}" style="--lane-top:${((noteLane(note, track) - 1) / Math.max(1, laneCount - 1)) * 100}%" data-note="${noteIndex}">${esc(noteLabel(note, track))}</i>`).join("");
      return `<button type="button" class="s3-beat ${selected ? "selected" : ""} ${inRange ? "in-range" : ""}" data-measure="${measureIndex}" data-beat="${beatIndex}" aria-label="Bar ${measureIndex + 1}, beat ${beatIndex + 1}"><span>${labels}</span><small>${beat.duration}${beat.dots ? ".".repeat(beat.dots) : ""}${beat.tuplet ? ` / ${beat.tuplet.enters}:${beat.tuplet.times}` : ""}</small></button>`;
    }).join("");
    return `<article class="s3-measure ${measureIndex === state.selection.measureIndex ? "active" : ""}" style="--lanes:${laneCount}"><header><b>${measureIndex + 1}</b><span>${measure.timeSignature.numerator}/${measure.timeSignature.denominator}</span>${measure.sectionLabel ? `<strong>${esc(measure.sectionLabel)}</strong>` : ""}</header><div class="s3-strings" aria-hidden="true">${Array.from({ length: laneCount }, () => "<i></i>").join("")}</div><div class="s3-beats">${beatHtml}</div></article>`;
  }).join("");
  requestAnimationFrame(() => $(".s3-beat.selected")?.scrollIntoView({ block: "nearest", inline: "nearest" }));
}

function field(label, name, value, type = "text", extra = "") { return `<label>${label}<input data-field="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`; }
function selectField(label, name, value, options) { return `<label>${label}<select data-field="${name}">${options.map((option) => `<option value="${option}" ${String(option) === String(value) ? "selected" : ""}>${String(option).toUpperCase()}</option>`).join("")}</select></label>`; }

function renderInspector() {
  const track = activeTrack(), measure = activeMeasure(), beat = activeBeat(), note = getNotes(state.arrangement, state.selection)[0];
  let html = "";
  if (state.inspector === "selection") {
    html = `<header><span>${note ? "NOTE" : "BEAT"}</span><b>BAR ${state.selection.measureIndex + 1}.${state.selection.beatIndex + 1}</b></header>`;
    if (note && ["guitar", "bass"].includes(track.family)) html += field("FRET", "note.fret", note.fret, "number", `min="0" max="${track.maxFret}"`) + field("STRING", "note.string", note.string, "number", `min="1" max="${track.stringCount}"`);
    else if (note && track.family === "drums") html += field("ARTICULATION", "note.articulation", note.articulation);
    else if (note) html += field("MIDI PITCH", "note.midiPitch", note.midiPitch, "number", `min="0" max="127"`);
    html += selectField("DURATION", "beat.duration", beat?.duration || 4, [64, 32, 16, 8, 4, 2, 1]) + selectField("DYNAMIC", "beat.dynamic", beat?.dynamic || "mf", ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"]);
    html += field("CHORD SYMBOL", "beat.chordSymbol", beat?.chordSymbol || "") + field("LYRICS", "beat.lyrics", beat?.lyrics || "") + field("BEAT TEXT", "beat.text", beat?.text || "");
    html += `<div class="s3-inspector-actions"><button data-command="add-note">+ CHORD NOTE</button><button data-command="delete-note">DELETE NOTE</button></div>`;
  } else if (state.inspector === "effects") {
    html = `<header><span>NOTE EFFECTS</span><b>${getNotes(state.arrangement, state.selection).length || 0} SELECTED</b></header><div class="s3-effect-grid">${EFFECTS.map((effect) => `<button data-effect="${effect}" class="${note?.effects?.[effect] ? "active" : ""}">${effect.replace(/([A-Z])/g, " $1")}</button>`).join("")}</div><header><span>BEAT EFFECTS</span></header><div class="s3-effect-grid">${BEAT_EFFECTS.map((effect) => `<button data-cycle-effect="${effect}" class="${beat?.effects?.[effect] !== "none" ? "active" : ""}">${effect}: ${beat?.effects?.[effect] || "none"}</button>`).join("")}</div>`;
  } else if (state.inspector === "structure") {
    html = `<header><span>BAR ${state.selection.measureIndex + 1}</span><b>ALL TRACKS ALIGN</b></header>${field("BEATS", "measure.numerator", measure.timeSignature.numerator, "number", 'min="1" max="32"')}${selectField("BEAT UNIT", "measure.denominator", measure.timeSignature.denominator, [2, 4, 8, 16])}${field("KEY", "measure.keySignature", measure.keySignature)}${field("SECTION", "measure.sectionLabel", measure.sectionLabel)}${field("ANNOTATION", "measure.annotation", measure.annotation)}${field("TEMPO CHANGE", "measure.tempo", measure.tempoEvents?.[0]?.bpm || "", "number", 'min="20" max="400"')}${field("REPEAT END", "measure.repeatEnd", measure.repeatEnd, "number", 'min="0" max="16"')}<label class="s3-check"><input data-field="measure.repeatStart" type="checkbox" ${measure.repeatStart ? "checked" : ""}>REPEAT START</label><label class="s3-check"><input data-field="measure.pickup" type="checkbox" ${measure.pickup ? "checked" : ""}>PICKUP BAR</label>${selectField("FEEL", "measure.feel", measure.feel, ["off", "triplet-8", "triplet-16", "dotted-8", "dotted-16", "scottish-8", "scottish-16"])} `;
  } else {
    html = `<header><span>TRACK</span><b>${esc(track.family)}</b></header>${field("NAME", "track.name", track.name)}${field("PERFORMER", "track.performer", track.performer)}${field("MUSICAL ROLE", "track.musicalRole", track.musicalRole)}${selectField("NOTATION", "track.notation", track.notation, ["tab+score", "tab", "score", "drums"])}${selectField("CLEF", "track.clef", track.clef, ["treble", "bass", "neutral"])}${field("CAPO", "track.capoFret", track.capoFret, "number", 'min="0" max="24"')}${field("MAX FRET", "track.maxFret", track.maxFret, "number", 'min="1" max="36"')}${field("TUNING (HIGH TO LOW)", "track.tuning", track.tuning.join(" "))}${field("GEAR / TONE NOTES", "track.gearDescription", track.gearDescription)}${field("MIXER VOLUME", "track.volume", track.volume, "range", 'min="0" max="1" step="0.01"')}<div class="s3-inspector-actions"><button type="button" class="${track.muted ? "active" : ""}" data-track-mix="muted" data-track-id="${track.id}">MUTE</button><button type="button" class="${track.solo ? "active" : ""}" data-track-mix="solo" data-track-id="${track.id}">SOLO</button></div>`;
  }
  $("#selection-inspector").innerHTML = html;
}

function renderValidation() {
  const report = validateMeasure(activeMeasure()).voices[state.selection.voice - 1];
  const beats = report.used / 960;
  $("#measure-validation").className = report.status;
  $("#measure-validation").innerHTML = `<b>${report.status.toUpperCase()}</b><span>${beats.toFixed(2)} quarter-note beats / ${(report.capacity / 960).toFixed(2)}</span>${report.status === "over" ? `<strong>OVER BY ${(report.delta / 960).toFixed(2)}</strong>` : report.status === "under" ? `<strong>UNDER BY ${(-report.delta / 960).toFixed(2)}</strong>` : ""}`;
}

function renderButtons() {
  $$("[data-display]").forEach((button) => button.classList.toggle("active", button.dataset.display === state.display));
  $$("[data-voice]").forEach((button) => button.classList.toggle("active", Number(button.dataset.voice) === state.selection.voice));
  $$("[data-inspector]").forEach((button) => button.classList.toggle("active", button.dataset.inspector === state.inspector));
  $("#undo-editor").disabled = !state.history.undoStack.length; $("#redo-editor").disabled = !state.history.redoStack.length;
  $("#studio-save-state").textContent = state.history.isDirty(state.arrangement) ? "UNSAVED" : "SAVED LOCAL";
}

function command(name) {
  const beat = activeBeat(), voice = activeVoice();
  if (name === "tuplet") return $("#tuplet-dialog").showModal();
  if (["copy", "cut"].includes(name)) {
    state.clipboard = clone(voice.beats.slice(state.selection.rangeStart, state.selection.rangeEnd + 1));
    if (name === "copy") return toast(`${state.clipboard.length} BEAT${state.clipboard.length > 1 ? "S" : ""} COPIED`);
    return run("cut-beats", "Cut beats", (arr, sel) => { const v = getVoice(arr, sel); v.beats.splice(sel.rangeStart, sel.rangeEnd - sel.rangeStart + 1); if (!v.beats.length) v.beats.push(createBeat(getTrack(arr, sel.trackId).family, { rest: true })); reflowVoice(v); sel.beatIndex = Math.min(sel.beatIndex, v.beats.length - 1); });
  }
  if (name === "paste" && !state.clipboard) return toast("COPY A BEAT FIRST", true);
  const handlers = {
    rest(arr, sel) { const v = getVoice(arr, sel); if (!v.beats.length) { v.beats.push(createBeat(getTrack(arr, sel.trackId).family, { rest: true })); return; } const b = getBeat(arr, sel); b.rest = !b.rest; b.notes = b.rest ? [] : [createNote(getTrack(arr, sel.trackId).family)]; },
    dot(arr, sel) { const b = editableBeat(arr, sel); b.dots = b.dots === 1 ? 0 : 1; reflowVoice(getVoice(arr, sel)); },
    "double-dot"(arr, sel) { const b = editableBeat(arr, sel); b.dots = b.dots === 2 ? 0 : 2; reflowVoice(getVoice(arr, sel)); },
    tie(arr, sel) { getNotes(arr, sel).forEach((note) => { note.tieFromPrevious = !note.tieFromPrevious; }); },
    "beat-before"(arr, sel) { getVoice(arr, sel).beats.splice(sel.beatIndex, 0, createBeat(getTrack(arr, sel.trackId).family, { rest: true })); reflowVoice(getVoice(arr, sel)); },
    "beat-after"(arr, sel) { getVoice(arr, sel).beats.splice(sel.beatIndex + 1, 0, createBeat(getTrack(arr, sel.trackId).family, { rest: true })); sel.beatIndex += 1; reflowVoice(getVoice(arr, sel)); },
    "delete-beat"(arr, sel) { const v = getVoice(arr, sel); v.beats.splice(sel.rangeStart, sel.rangeEnd - sel.rangeStart + 1); if (!v.beats.length) v.beats.push(createBeat(getTrack(arr, sel.trackId).family, { rest: true })); sel.beatIndex = Math.min(sel.rangeStart, v.beats.length - 1); reflowVoice(v); },
    paste(arr, sel) { const v = getVoice(arr, sel); v.beats.splice(sel.beatIndex + 1, 0, ...clone(state.clipboard)); sel.beatIndex += 1; reflowVoice(v); },
    clone(arr, sel) { const v = getVoice(arr, sel); const copy = clone(v.beats.slice(sel.rangeStart, sel.rangeEnd + 1)); v.beats.splice(sel.rangeEnd + 1, 0, ...copy); sel.beatIndex = sel.rangeEnd + 1; reflowVoice(v); },
    clear(arr, sel) { const b = editableBeat(arr, sel); b.rest = true; b.notes = []; },
    "bar-before"(arr, sel) { insertAlignedMeasure(arr, sel.measureIndex, sel.trackId); },
    "bar-after"(arr, sel) { insertAlignedMeasure(arr, sel.measureIndex + 1, sel.trackId); sel.measureIndex += 1; },
    "duplicate-bar"(arr, sel) { duplicateAlignedMeasure(arr, sel.measureIndex); sel.measureIndex += 1; },
    "delete-bar"(arr, sel) { if (!deleteAlignedMeasure(arr, sel.measureIndex)) return; sel.measureIndex = Math.min(sel.measureIndex, getTrack(arr, sel.trackId).measures.length - 1); },
    "add-note"(arr, sel) { const b = editableBeat(arr, sel); b.rest = false; b.notes.push(createNote(getTrack(arr, sel.trackId).family, b.notes.length)); sel.noteIndex = b.notes.length - 1; sel.noteIndices = [sel.noteIndex]; },
    "delete-note"(arr, sel) { const b = getBeat(arr, sel); if (!b) return; [...sel.noteIndices].sort((a, b2) => b2 - a).forEach((index) => b.notes.splice(index, 1)); if (!b.notes.length) b.rest = true; sel.noteIndex = 0; sel.noteIndices = []; },
  };
  if (handlers[name]) run(name, name.replaceAll("-", " "), handlers[name]);
}

function noteGlyph(duration) {
  const hollow = duration === 1 || duration === 2;
  const stemmed = duration !== 1;
  const flags = duration === 8 ? 1 : duration === 16 ? 2 : duration === 32 ? 3 : duration === 64 ? 4 : 0;
  const head = hollow
    ? `<ellipse cx="7" cy="21" rx="5.2" ry="3.6" transform="rotate(-18 7 21)" fill="none" stroke="currentColor" stroke-width="1.6"/>`
    : `<ellipse cx="7" cy="21" rx="5.2" ry="3.6" transform="rotate(-18 7 21)" fill="currentColor"/>`;
  const stem = stemmed ? `<line x1="12" y1="21" x2="12" y2="3" stroke="currentColor" stroke-width="1.6"/>` : "";
  const flagMarks = Array.from({ length: flags }, (_, i) => `<path d="M12 ${3 + i * 5} q7 2 6 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`).join("");
  return `<svg viewBox="0 0 22 28" width="16" height="20" aria-hidden="true" focusable="false">${head}${stem}${flagMarks}</svg>`;
}
function setDuration(duration) { run("duration", `Set 1/${duration} duration`, (arr, sel) => { const b = editableBeat(arr, sel); b.duration = duration; reflowVoice(getVoice(arr, sel)); }); }
function toggleEffect(effect) { run("note-effect", `Toggle ${effect}`, (arr, sel) => getNotes(arr, sel).forEach((note) => { note.effects[effect] = !note.effects[effect]; })); }
const CYCLE = { hairpin: ["none", "crescendo", "diminuendo"], brush: ["none", "up", "down"], arpeggio: ["none", "up", "down"], pickStroke: ["none", "up", "down"], grace: ["none", "before", "on"], tremoloPicking: ["none", "8", "16", "32"], sustainPedal: ["none", "down", "up"] };
function cycleBeatEffect(effect) { run("beat-effect", `Cycle ${effect}`, (arr, sel) => { const b = editableBeat(arr, sel); const values = CYCLE[effect]; b.effects[effect] = values[(values.indexOf(b.effects[effect]) + 1) % values.length]; }); }

function updateField(target) {
  const path = target.dataset.field, value = target.type === "checkbox" ? target.checked : target.type === "number" || target.type === "range" ? Number(target.value) : target.value;
  run("property", `Change ${path}`, (arr, sel) => {
    const track = getTrack(arr, sel.trackId), measure = getMeasure(arr, sel), beat = path.startsWith("beat.") ? editableBeat(arr, sel) : getBeat(arr, sel), note = getNotes(arr, sel)[0];
    if (path.startsWith("note.") && note) note[path.split(".")[1]] = value;
    if (path.startsWith("beat.")) { beat[path.split(".")[1]] = value; reflowVoice(getVoice(arr, sel)); }
    if (path === "measure.numerator") measure.timeSignature.numerator = value;
    if (path === "measure.denominator") measure.timeSignature.denominator = value;
    if (path === "measure.tempo") measure.tempoEvents = value ? [{ tick: 0, bpm: value }] : [];
    if (path.startsWith("measure.") && !["measure.numerator", "measure.denominator", "measure.tempo"].includes(path)) measure[path.split(".")[1]] = value;
    if (path === "track.tuning") { track.tuning = String(value).trim().split(/\s+/).filter(Boolean); track.stringCount = track.tuning.length; }
    else if (path.startsWith("track.")) track[path.split(".")[1]] = value;
    reflowMeasure(measure);
  });
}

function changeMetadata(key, value) { run("metadata", `Change ${key}`, (arr) => { if (key === "tempo") arr.tempo = Math.max(20, Math.min(400, Number(value) || 120)); else arr.metadata[key] = value; }); }

function saveProject(silent = false) {
  state.arrangement.updatedAt = new Date().toISOString();
  const record = { arrangement: clone(state.arrangement), savedAt: state.arrangement.updatedAt };
  const index = state.drafts.findIndex((draft) => draft.arrangement.id === state.arrangement.id);
  if (index >= 0) state.drafts[index] = record; else state.drafts.unshift(record);
  if (!writeStore()) return;
  state.history.setBaseline(state.arrangement); renderLibrary(); renderButtons(); touchStatus("SAVED TO THIS BROWSER"); if (!silent) toast("TAB SAVED LOCALLY");
}

function loadProject(id) { const draft = state.drafts.find((item) => item.arrangement.id === id); if (!draft) return; state.arrangement = normalizeArrangement(draft.arrangement); state.selection = normalizeSelection(state.arrangement); state.history.clear(state.arrangement); state.loop = { startMeasure: null, endMeasure: null }; render(); schedulePreview(); toast("LOCAL TAB OPENED"); }
function newProject(form) { const data = new FormData(form); state.arrangement = createArrangement({ title: data.get("title"), artist: data.get("artist"), name: data.get("trackName"), family: data.get("family"), measureCount: Number(data.get("measureCount")), numerator: Number(data.get("numerator")), denominator: Number(data.get("denominator")), tempo: Number(data.get("tempo")) }); state.selection = normalizeSelection(state.arrangement); state.history.clear(); state.loop = { startMeasure: null, endMeasure: null }; render(); schedulePreview(); toast("NEW TAB READY"); }

function addTrack(form) { const data = new FormData(form); run("add-track", "Add track", (arr, sel) => { const measureCount = arr.tracks[0].measures.length; const source = arr.tracks[0].measures[0]; const track = createTrack({ name: data.get("trackName"), family: data.get("family"), measureCount, numerator: source.timeSignature.numerator, denominator: source.timeSignature.denominator }); arr.tracks.push(track); sel.trackId = track.id; sel.measureIndex = 0; sel.beatIndex = 0; }); }
function toggleTrackMix(trackId, prop) { run(`track-${prop}`, `Toggle ${prop}`, (arr) => { const track = arr.tracks.find((item) => item.id === trackId); if (track) track[prop] = !track[prop]; }); }
function trackCommand(name) { run(`track-${name}`, `${name} track`, (arr, sel) => { const index = arr.tracks.findIndex((track) => track.id === sel.trackId); if (name === "up" && index > 0) [arr.tracks[index - 1], arr.tracks[index]] = [arr.tracks[index], arr.tracks[index - 1]]; if (name === "down" && index < arr.tracks.length - 1) [arr.tracks[index + 1], arr.tracks[index]] = [arr.tracks[index], arr.tracks[index + 1]]; if (name === "duplicate") { const copy = clone(arr.tracks[index]); copy.id = `${copy.id}-copy-${Date.now()}`; copy.name += " Copy"; arr.tracks.splice(index + 1, 0, copy); sel.trackId = copy.id; } if (name === "delete" && arr.tracks.length > 1) { arr.tracks.splice(index, 1); sel.trackId = arr.tracks[Math.min(index, arr.tracks.length - 1)].id; } arr.tracks.forEach((track, order) => { track.order = order; }); }); }

function download(name, body, type = "text/plain") { const url = URL.createObjectURL(new Blob([body], { type })); const link = Object.assign(document.createElement("a"), { href: url, download: name }); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function safeName() { return state.arrangement.metadata.title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "airwaves-tab"; }
function exportGp() {
  if (!window.alphaTab?.exporter?.Gp7Exporter || !window.alphaTab?.importer?.ScoreLoader) return toast("GP7 EXPORT NEEDS THE NOTATION ENGINE — CHECK YOUR CONNECTION", true);
  try {
    const settings = state.alpha?.settings || new window.alphaTab.Settings();
    const score = state.alpha?.score || window.alphaTab.importer.ScoreLoader.loadAlphaTex(toAlphaTex(state.arrangement), settings);
    const bytes = new window.alphaTab.exporter.Gp7Exporter().export(score, settings);
    download(`${safeName()}.gp`, bytes, "application/octet-stream");
  } catch { toast("THIS SCORE COULD NOT BE EXPORTED AS GP7. JSON AND ALPHATEX ARE AVAILABLE.", true); }
}

function scoreToArrangement(score, fileName) {
  const tracks = (score.tracks || []).slice(0, 64).map((sourceTrack, trackIndex) => {
    const staff = sourceTrack.staves?.[0], tuning = staff?.stringTuning?.tunings?.map((pitch) => midiName(pitch)).reverse() || [];
    const family = sourceTrack.isPercussion ? "drums" : tuning.length <= 5 && tuning.length ? "bass" : tuning.length ? "guitar" : "keys";
    const track = createTrack({ family, name: sourceTrack.name || `Track ${trackIndex + 1}`, measureCount: Math.max(1, staff?.bars?.length || 1), beatCount: 0, tuning: tuning.length ? tuning : undefined });
    track.measures = (staff?.bars || []).slice(0, 2048).map((bar) => {
      const master = bar.masterBar || {}, measure = createMeasure(family, { beatCount: 0, numerator: master.timeSignatureNumerator || 4, denominator: master.timeSignatureDenominator || 4 });
      measure.voices = [1, 2, 3, 4].map((index) => ({ index, beats: (bar.voices?.[index - 1]?.beats || []).slice(0, 1024).map((sourceBeat) => {
        const beat = createBeat(family, { rest: sourceBeat.isRest, duration: sourceBeat.duration || 4 }); beat.dots = sourceBeat.dots || 0; beat.notes = (sourceBeat.notes || []).slice(0, 32).map((sourceNote) => ({ ...createNote(family), ...(family === "drums" ? { articulation: sourceNote.percussionArticulation || "SnareHit" } : tuning.length ? { fret: sourceNote.fret || 0, string: sourceNote.string || 1 } : { midiPitch: sourceNote.realValue || 60 }) })); beat.rest = !beat.notes.length; return beat;
      }) })); return reflowMeasure(measure);
    }); return track;
  });
  const arrangement = createArrangement({ title: score.title || fileName.replace(/\.[^.]+$/, ""), artist: score.artist || "Unknown Artist", tempo: score.tempo || 120 }); arrangement.tracks = tracks.length ? tracks : arrangement.tracks; return normalizeArrangement(arrangement);
}

async function importFile(file) {
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error("Files larger than 8 MB are blocked. Export a smaller score or split the arrangement.");
    if (/\.json$/i.test(file.name)) state.arrangement = normalizeArrangement(JSON.parse(await file.text()));
    else if (/\.(atex|txt)$/i.test(file.name)) {
      if (!window.alphaTab?.importer?.ScoreLoader) throw new Error("The notation importer did not load. Check your connection and retry.");
      const score = window.alphaTab.importer.ScoreLoader.loadAlphaTex(await file.text(), new window.alphaTab.Settings());
      state.arrangement = scoreToArrangement(score, file.name);
    }
    else {
      if (!window.alphaTab?.importer?.ScoreLoader) throw new Error("The notation importer did not load. Check your connection and retry.");
      const score = window.alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(await file.arrayBuffer()), new window.alphaTab.Settings());
      state.arrangement = scoreToArrangement(score, file.name);
    }
    state.selection = normalizeSelection(state.arrangement); state.history.clear(); render(); schedulePreview(); toast("TAB IMPORTED — REVIEW TUNING AND EFFECTS BEFORE SAVING");
  } catch (error) { toast(error.message || "THIS FILE COULD NOT BE IMPORTED", true); }
  finally { $("#tab-upload").value = ""; }
}

function ensureAlpha() {
  if (state.alpha || !window.alphaTab?.AlphaTabApi) return state.alpha;
  try {
    state.alpha = new window.alphaTab.AlphaTabApi($("#alpha-tab"), { core: { tex: true }, display: { scale: Number($("#score-zoom").value) / 100 }, player: { enablePlayer: true, soundFont: "https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.4/dist/soundfont/sonivox.sf2" } });
    state.alpha.playerPositionChanged?.on((event) => {
      $("#player-position").textContent = formatTime(event.currentTime); $("#player-duration").textContent = formatTime(event.endTime);
      if (!Number.isFinite(event.currentTick)) return;
      const track = activeTrack(); if (!track) return;
      const index = tickToMeasureIndex(track, event.currentTick);
      if (index === state.playbackMeasure) return;
      state.playbackMeasure = index;
      $(`.s3-beat[data-measure="${index}"][data-beat="0"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
    state.alpha.playerStateChanged?.on((event) => { $("#play-toggle").textContent = event.state === 1 ? "Ⅱ" : "▶"; });
    state.alpha.scoreLoaded?.on(() => { applyMixToAlpha(); applyLoopRangeToAlpha(); state.playbackMeasure = -1; });
  } catch (error) { toast(`PREVIEW UNAVAILABLE: ${error.message}`, true); }
  return state.alpha;
}
function applyMixToAlpha() {
  const tracks = state.alpha?.score?.tracks; if (!state.alpha || !tracks) return;
  state.arrangement.tracks.forEach((track, index) => {
    const alphaTrack = tracks[index]; if (!alphaTrack) return;
    try {
      state.alpha.changeTrackVolume([alphaTrack], Number.isFinite(track.volume) ? track.volume : 0.85);
      state.alpha.changeTrackMute([alphaTrack], Boolean(track.muted));
      state.alpha.changeTrackSolo([alphaTrack], Boolean(track.solo));
    } catch { /* preview engine does not support live mixer updates */ }
  });
}

function measureTicks(measure) { return Math.round((measure.timeSignature.numerator * 4 / measure.timeSignature.denominator) * PPQ); }
function measureStartTick(track, measureIndex) { let tick = 0; for (let i = 0; i < measureIndex; i++) tick += measureTicks(track.measures[i]); return tick; }
function tickToMeasureIndex(track, tick) {
  let cursor = 0;
  for (let i = 0; i < track.measures.length; i++) {
    const length = measureTicks(track.measures[i]);
    if (tick < cursor + length) return i;
    cursor += length;
  }
  return Math.max(0, track.measures.length - 1);
}
function loopBounds() {
  const { startMeasure, endMeasure } = state.loop; if (startMeasure == null || endMeasure == null) return null;
  return { start: Math.min(startMeasure, endMeasure), end: Math.max(startMeasure, endMeasure) };
}
function applyLoopRangeToAlpha() {
  if (!state.alpha) return;
  const track = activeTrack(); const bounds = track && loopBounds();
  const clamped = bounds && track.measures.length ? { start: Math.min(bounds.start, track.measures.length - 1), end: Math.min(bounds.end, track.measures.length - 1) } : null;
  try { state.alpha.playbackRange = clamped ? { startTick: measureStartTick(track, clamped.start), endTick: measureStartTick(track, clamped.end) + measureTicks(track.measures[clamped.end]) } : null; }
  catch { /* preview engine does not support loop ranges */ }
}
function renderLoopReadout() { const bounds = loopBounds(); $("#loop-readout").textContent = bounds ? `BAR ${bounds.start + 1}–${bounds.end + 1}` : "FULL SONG"; }
function setLoopBoundary(edge) {
  state.loop[edge] = state.selection.measureIndex;
  if (state.loop.startMeasure == null) state.loop.startMeasure = state.selection.measureIndex;
  if (state.loop.endMeasure == null) state.loop.endMeasure = state.selection.measureIndex;
  renderLoopReadout(); renderMap(); applyLoopRangeToAlpha();
}

function noteNameToMidi(name) { const match = /^([A-G]#?)(-?\d+)$/.exec(String(name).trim()); return match ? (Number(match[2]) + 1) * 12 + NOTE_INDEX[match[1]] : 60; }
function transposeArrangement(arrangement, semitones) {
  if (!semitones) return arrangement;
  const shifted = clone(arrangement);
  shifted.tracks.forEach((track) => {
    if (["guitar", "bass"].includes(track.family)) track.tuning = track.tuning.map((name) => midiName(noteNameToMidi(name) + semitones));
    else track.measures.forEach((measure) => measure.voices.forEach((voice) => voice.beats.forEach((beat) => beat.notes.forEach((note) => { if (Number.isFinite(note.midiPitch)) note.midiPitch = Math.max(0, Math.min(127, note.midiPitch + semitones)); }))));
  });
  return shifted;
}
function schedulePreview() { if (!state.preview) return; clearTimeout(state.renderTimer); state.renderTimer = setTimeout(() => { const api = ensureAlpha(); if (!api) return; try { api.tex(toAlphaTex(transposeArrangement(state.arrangement, state.pitchShift))); } catch { toast("ENGRAVED PREVIEW COULD NOT RENDER THIS EFFECT COMBINATION", true); } }, 180); }

function showCommands(filter = "") {
  const commands = [{ n: "Undo", k: "Ctrl Z", a: () => undo() }, { n: "Redo", k: "Ctrl Shift Z", a: () => redo() }, { n: "Insert beat after", k: "", a: () => command("beat-after") }, { n: "Delete beat", k: "Backspace", a: () => command("delete-beat") }, { n: "Toggle rest", k: "R", a: () => command("rest") }, { n: "Add chord note", k: "", a: () => command("add-note") }, { n: "Duplicate bar", k: "", a: () => command("duplicate-bar") }, { n: "Fit bar with rests", k: "", a: repair }, { n: "Save locally", k: "Ctrl S", a: saveProject }, { n: "Toggle preview", k: "P", a: togglePreview }, { n: "Set loop start to selected bar", k: "", a: () => setLoopBoundary("startMeasure") }, { n: "Set loop end to selected bar", k: "", a: () => setLoopBoundary("endMeasure") }, { n: "Clear loop range", k: "", a: () => $("#loop-clear").click() }];
  state.commandItems = commands.filter((item) => item.n.toLowerCase().includes(filter.toLowerCase()));
  $("#command-list").innerHTML = state.commandItems.map((item, index) => `<button type="button" data-command-index="${index}"><span>${item.n}</span><kbd>${item.k}</kbd></button>`).join("");
}
function queueAutosave() { clearTimeout(state.autosaveTimer); state.autosaveTimer = setTimeout(() => saveProject(true), 1400); }
function undo() { const result = state.history.undo(state.arrangement, state.selection); if (!result.command) return; state.arrangement = result.arrangement; state.selection = result.selection; touchStatus(`UNDO: ${result.command.label}`); render(); schedulePreview(); queueAutosave(); }
function redo() { const result = state.history.redo(state.arrangement, state.selection); if (!result.command) return; state.arrangement = result.arrangement; state.selection = result.selection; touchStatus(`REDO: ${result.command.label}`); render(); schedulePreview(); queueAutosave(); }
function repair() { run("fit-measure", "Fit bar with rests", (arr, sel) => fitVoiceToMeasure(getMeasure(arr, sel), getVoice(arr, sel), getTrack(arr, sel.trackId).family)); }
function togglePreview() { state.preview = !state.preview; $("#render-preview").hidden = !state.preview; $("#toggle-preview").classList.toggle("active", state.preview); if (state.preview) schedulePreview(); }

function moveSelection(deltaBar, deltaBeat, shift = false) {
  const track = activeTrack(); let measureIndex = state.selection.measureIndex + deltaBar, beatIndex = state.selection.beatIndex + deltaBeat;
  if (beatIndex < 0 && measureIndex > 0) { measureIndex -= 1; beatIndex = track.measures[measureIndex].voices[state.selection.voice - 1].beats.length - 1; }
  const currentLength = track.measures[Math.max(0, Math.min(track.measures.length - 1, measureIndex))].voices[state.selection.voice - 1].beats.length;
  if (beatIndex >= currentLength && measureIndex < track.measures.length - 1) { measureIndex += 1; beatIndex = 0; }
  setSelection({ measureIndex, beatIndex }, { range: shift });
}
function enterFret(digit) { const track = activeTrack(); if (!["guitar", "bass"].includes(track.family)) return; clearTimeout(state.fretTimer); state.fretBuffer = `${state.fretBuffer}${digit}`.slice(-2); const fret = Math.min(track.maxFret, Number(state.fretBuffer)); run("fret-entry", `Enter fret ${fret}`, (arr, sel) => { const beat = editableBeat(arr, sel); if (!beat.notes.length) { beat.rest = false; beat.notes = [createNote(track.family)]; } getNotes(arr, sel).forEach((note) => { note.fret = fret; }); }); state.fretTimer = setTimeout(() => { state.fretBuffer = ""; }, 700); }

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, [data-load-draft], [data-track-id]"); if (!target) return;
  if (target.dataset.measure != null) {
    const noteIndex = Number(event.target.dataset.note || 0);
    const sameBeat = state.selection.measureIndex === Number(target.dataset.measure) && state.selection.beatIndex === Number(target.dataset.beat);
    const noteIndices = (event.ctrlKey || event.metaKey) && sameBeat
      ? [...new Set([...state.selection.noteIndices, noteIndex])]
      : [noteIndex];
    state.popoverOpen = true;
    setSelection({ measureIndex: Number(target.dataset.measure), beatIndex: Number(target.dataset.beat), noteIndex, noteIndices }, { range: event.shiftKey });
  }
  else if (target.dataset.trackMix) toggleTrackMix(target.dataset.trackId, target.dataset.trackMix);
  else if (target.dataset.trackId) setSelection({ trackId: target.dataset.trackId, measureIndex: 0, beatIndex: 0 });
  else if (target.dataset.bar != null) setSelection({ measureIndex: Number(target.dataset.bar), beatIndex: 0 });
  else if (target.dataset.loadDraft) loadProject(target.dataset.loadDraft);
  else if (target.dataset.duration) setDuration(Number(target.dataset.duration));
  else if (target.dataset.command) command(target.dataset.command);
  else if (target.dataset.effect) toggleEffect(target.dataset.effect);
  else if (target.dataset.cycleEffect) cycleBeatEffect(target.dataset.cycleEffect);
  else if (target.dataset.trackCommand) trackCommand(target.dataset.trackCommand);
  else if (target.dataset.display) { state.display = target.dataset.display; renderScore(); renderButtons(); schedulePreview(); }
  else if (target.dataset.voice) setSelection({ voice: Number(target.dataset.voice), beatIndex: 0 });
  else if (target.dataset.inspector) { state.inspector = target.dataset.inspector; renderInspector(); renderButtons(); }
  else if (target.dataset.commandIndex != null) { state.commandItems[Number(target.dataset.commandIndex)]?.a(); $("#command-dialog").close(); }
});
document.addEventListener("change", (event) => { if (event.target.dataset.field) updateField(event.target); });
[$("#project-title"), $("#project-artist"), $("#project-arrangement"), $("#project-tempo")].forEach((input) => input.addEventListener("change", () => changeMetadata(input.id === "project-title" ? "title" : input.id === "project-artist" ? "artist" : input.id === "project-arrangement" ? "arrangementTitle" : "tempo", input.value)));
$("#library-search").addEventListener("input", renderLibrary); $("#refresh-library").addEventListener("click", () => { const stored = readStore(); state.drafts = stored.drafts; state.snapshots = stored.snapshots; renderLibrary(); });
$("#new-project").addEventListener("click", () => $("#new-project-dialog").showModal()); $("#add-track").addEventListener("click", () => $("#add-track-dialog").showModal());
$("#new-project-form").addEventListener("submit", (event) => { if (event.submitter?.value === "create") newProject(event.currentTarget); }); $("#add-track-form").addEventListener("submit", (event) => { if (event.submitter?.value === "create") addTrack(event.currentTarget); });
$("#tuplet-form").addEventListener("submit", (event) => { const remove = event.submitter?.value === "remove", data = new FormData(event.currentTarget); run("tuplet", remove ? "Remove tuplet" : "Apply tuplet", (arr, sel) => { editableBeat(arr, sel).tuplet = remove ? null : { enters: Number(data.get("enters")), times: Number(data.get("times")) }; reflowVoice(getVoice(arr, sel)); }); });
$("#save-project").addEventListener("click", () => saveProject()); $("#tab-upload").addEventListener("change", (event) => event.target.files[0] && importFile(event.target.files[0]));
$("#export-menu-toggle").addEventListener("click", () => $(".s3-export").classList.toggle("open"));
$("#snapshot-project").addEventListener("click", () => { renderSnapshots(); $("#snapshot-dialog").showModal(); });
$("#snapshot-form").addEventListener("submit", (event) => { if (event.submitter?.value !== "save") return; const label = new FormData(event.currentTarget).get("label"); state.snapshots.unshift({ id: `${Date.now()}`, projectId: state.arrangement.id, label, savedAt: new Date().toISOString(), arrangement: clone(state.arrangement) }); writeStore(); toast("SNAPSHOT SAVED"); });
function renderSnapshots() { const items = state.snapshots.filter((item) => item.projectId === state.arrangement.id); $("#snapshot-list").innerHTML = items.length ? items.map((item) => `<button type="button" data-snapshot="${item.id}"><strong>${esc(item.label)}</strong><span>${formatDate(item.savedAt)}</span></button>`).join("") : "<p>NO SNAPSHOTS FOR THIS TAB.</p>"; }
$("#snapshot-list").addEventListener("click", (event) => { const button = event.target.closest("[data-snapshot]"); if (!button) return; const item = state.snapshots.find((snapshot) => snapshot.id === button.dataset.snapshot); if (!item) return; state.arrangement = normalizeArrangement(item.arrangement); state.selection = normalizeSelection(state.arrangement); state.history.clear(); state.loop = { startMeasure: null, endMeasure: null }; $("#snapshot-dialog").close(); render(); schedulePreview(); toast("SNAPSHOT RESTORED — SAVE TO KEEP IT"); });
$("#command-search").addEventListener("click", () => { showCommands(); $("#command-dialog").showModal(); $("#command-filter").focus(); }); $("#command-filter").addEventListener("input", (event) => showCommands(event.target.value));
$("#undo-editor").addEventListener("click", undo); $("#redo-editor").addEventListener("click", redo); $("#repair-measure").addEventListener("click", repair); $("#toggle-preview").addEventListener("click", togglePreview);
$("#export-atex").addEventListener("click", () => download(`${safeName()}.atex`, toAlphaTex(state.arrangement))); $("#export-json").addEventListener("click", () => download(`${safeName()}.airwaves.json`, JSON.stringify(state.arrangement, null, 2), "application/json")); $("#export-gp").addEventListener("click", exportGp); $("#export-pdf").addEventListener("click", () => state.alpha?.print ? state.alpha.print() : window.print());
$(".s3-export").addEventListener("click", (event) => { if (event.target.closest("button")) $(".s3-export").classList.remove("open"); });
$("#score-zoom").addEventListener("input", (event) => { $("#zoom-output").value = `${event.target.value}%`; if (state.alpha) { state.alpha.settings.display.scale = Number(event.target.value) / 100; state.alpha.updateSettings(); state.alpha.render(); } });
$("#playback-speed").addEventListener("input", (event) => { $("#speed-output").value = `${event.target.value}%`; if (ensureAlpha()) state.alpha.playbackSpeed = Number(event.target.value) / 100; }); $("#master-volume").addEventListener("input", (event) => { $("#volume-output").value = `${event.target.value}%`; if (ensureAlpha()) state.alpha.masterVolume = Number(event.target.value) / 100; });
$("#play-toggle").addEventListener("click", () => { state.preview = true; $("#render-preview").hidden = false; schedulePreview(); setTimeout(() => state.alpha?.playPause(), 250); }); $("#stop-player").addEventListener("click", () => state.alpha?.stop()); $("#go-start").addEventListener("click", () => { if (state.alpha) state.alpha.tickPosition = 0; });
[["#loop-toggle", "isLooping"], ["#metronome-toggle", "metronomeVolume"], ["#count-in-toggle", "countInVolume"]].forEach(([selector, property]) => $(selector).addEventListener("click", (event) => { const api = ensureAlpha(); const on = event.currentTarget.getAttribute("aria-pressed") !== "true"; event.currentTarget.setAttribute("aria-pressed", String(on)); if (api) api[property] = property === "isLooping" ? on : on ? 1 : 0; }));
$("#loop-set-start").addEventListener("click", () => setLoopBoundary("startMeasure")); $("#loop-set-end").addEventListener("click", () => setLoopBoundary("endMeasure"));
$("#loop-clear").addEventListener("click", () => { state.loop = { startMeasure: null, endMeasure: null }; renderLoopReadout(); renderMap(); applyLoopRangeToAlpha(); });
$("#pitch-shift").addEventListener("input", (event) => { const value = Number(event.target.value); state.pitchShift = value; $("#pitch-output").textContent = `${value > 0 ? "+" : ""}${value} ST`; schedulePreview(); });
$("#note-popover").addEventListener("click", (event) => { if (event.target.closest("[data-popover-close]")) { state.popoverOpen = false; renderNotePopover(); } });
document.addEventListener("click", (event) => {
  if (!state.popoverOpen) return;
  if (event.target.closest("#note-popover") || event.target.closest(".s3-beat")) return;
  state.popoverOpen = false; renderNotePopover();
});
window.addEventListener("scroll", () => { if (state.popoverOpen) renderNotePopover(); }, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.popoverOpen) { state.popoverOpen = false; renderNotePopover(); return; }
  if (event.target.matches("input, textarea, select") || $("dialog[open]")) return;
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === "k") { event.preventDefault(); $("#command-search").click(); }
  else if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); saveProject(); }
  else if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  else if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
  else if (/^[0-9]$/.test(event.key)) enterFret(event.key);
  else if (event.key === "ArrowRight") { event.preventDefault(); moveSelection(0, 1, event.shiftKey); }
  else if (event.key === "ArrowLeft") { event.preventDefault(); moveSelection(0, -1, event.shiftKey); }
  else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); const delta = event.key === "ArrowUp" ? 1 : -1; run("move-note", "Move note", (arr, sel) => getNotes(arr, sel).forEach((note) => { if (note.fret != null) note.fret = Math.max(0, Math.min(getTrack(arr, sel.trackId).maxFret, note.fret + delta)); else note.midiPitch = Math.max(0, Math.min(127, note.midiPitch + delta)); })); }
  else if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); command("delete-note"); }
  else if (event.key.toLowerCase() === "r") command("rest");
  else if (event.key.toLowerCase() === "p") togglePreview();
  else if (event.key === " ") { event.preventDefault(); $("#play-toggle").click(); }
});
window.addEventListener("beforeunload", (event) => { if (state.history.isDirty(state.arrangement)) { event.preventDefault(); event.returnValue = ""; } });

const stored = readStore(); state.drafts = stored.drafts || []; state.snapshots = stored.snapshots || [];
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; } })(); state.display = prefs.display || "tab";
state.selection = normalizeSelection(state.arrangement); state.history.setBaseline(state.arrangement); render();
$$("[data-duration]").forEach((button) => { const duration = Number(button.dataset.duration); button.innerHTML = noteGlyph(duration); button.title = `1/${duration} note`; button.setAttribute("aria-label", `1/${duration} note`); });
