export const PPQ = 960;
export const SCHEMA_VERSION = 4;
export const DURATIONS = [64, 32, 16, 8, 4, 2, 1];
export const VOICES = [1, 2, 3, 4];
export const FAMILIES = ["guitar", "bass", "drums", "keys", "voice", "winds"];

let idSequence = 0;
export function makeId(prefix = "aw") {
  idSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}`;
}

export function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function noteEffects() {
  return {
    ghost: false, accent: false, heavyAccent: false, staccato: false, letRing: false,
    palmMute: false, dead: false, naturalHarmonic: false, artificialHarmonic: false,
    hammerPull: false, legatoSlide: false, shiftSlide: false, slideInBelow: false,
    slideInAbove: false, slideOutDown: false, slideOutUp: false, bend: false,
    trill: false, tapping: false, slapping: false, popping: false, pickScrapeDown: false,
    pickScrapeUp: false, vibrato: false, wideVibrato: false, tremoloVibrato: false,
    wideTremoloVibrato: false, golpeFinger: false, golpeThumb: false, wahOpen: false,
    wahClosed: false,
  };
}

export function beatEffects() {
  return {
    hairpin: "none", brush: "none", arpeggio: "none", rasgueado: false,
    pickStroke: "none", deadSlap: false, grace: "none", tremoloPicking: "none",
    sustainPedal: "none", slash: false,
  };
}

const GUITAR_TUNING = ["E4", "B3", "G3", "D3", "A2", "E2"];
const BASS_TUNING = ["G2", "D2", "A1", "E1"];

export function createNote(family = "guitar", index = 0) {
  const note = {
    id: makeId("note"), tieFromPrevious: false, effects: noteEffects(),
    bend: { amount: 4, points: [0, 4], release: false },
    trill: { target: 1, rate: 16 },
  };
  if (family === "drums") return { ...note, articulation: ["KickHit", "HiHatClosed", "SnareHit", "HiHatClosed"][index % 4] };
  if (["guitar", "bass"].includes(family)) return { ...note, string: family === "bass" ? 2 : 3, fret: [3, 5, 7, 5][index % 4] };
  return { ...note, midiPitch: [60, 62, 64, 67][index % 4] };
}

export function measureTicks(measure) { return Math.round((measure.timeSignature.numerator * 4 / measure.timeSignature.denominator) * PPQ); }

export function durationTicks(beat) {
  const denominator = DURATIONS.includes(Number(beat.duration)) ? Number(beat.duration) : 4;
  const base = (PPQ * 4) / denominator;
  const dots = Math.max(0, Math.min(2, Number(beat.dots) || 0));
  const dotted = dots === 1 ? 1.5 : dots === 2 ? 1.75 : 1;
  const tuplet = beat.tuplet?.enters > 1 && beat.tuplet?.times > 0 ? beat.tuplet.times / beat.tuplet.enters : 1;
  return Math.round(base * dotted * tuplet);
}

export function createBeat(family = "guitar", options = {}) {
  const rest = Boolean(options.rest);
  return {
    id: makeId("beat"), startTick: 0, duration: Number(options.duration) || 4,
    durationTicks: 0, dots: Number(options.dots) || 0, tuplet: options.tuplet || null,
    rest, notes: rest ? [] : [createNote(family, Number(options.index) || 0)],
    dynamic: options.dynamic || "mf", text: options.text || "", lyrics: options.lyrics || "",
    chordSymbol: options.chordSymbol || "", effects: beatEffects(),
  };
}

export function createMeasure(family = "guitar", options = {}) {
  const numerator = Math.max(1, Number(options.numerator) || 4);
  const denominator = [2, 4, 8, 16].includes(Number(options.denominator)) ? Number(options.denominator) : 4;
  const beatCount = Number.isFinite(options.beatCount) ? Number(options.beatCount) : numerator;
  const measure = {
    id: makeId("bar"), timeSignature: { numerator, denominator }, keySignature: options.keySignature || "C",
    tempoEvents: [], sectionLabel: "", annotation: "", repeatStart: false, repeatEnd: 0,
    alternateEndings: [], pickup: false, feel: "off",
    voices: VOICES.map((index) => ({
      index,
      beats: index === 1 ? Array.from({ length: beatCount }, (_, beatIndex) => createBeat(family, { duration: denominator, index: beatIndex, rest: options.rest !== false })) : [],
    })),
  };
  return reflowMeasure(measure);
}

export function createTrack(options = {}) {
  const family = FAMILIES.includes(options.family) ? options.family : "guitar";
  const tuning = options.tuning || (family === "guitar" ? GUITAR_TUNING : family === "bass" ? BASS_TUNING : []);
  return {
    id: makeId("track"), order: Number(options.order) || 0,
    name: options.name || ({ guitar: "Electric Guitar", bass: "Bass", drums: "Drums", keys: "Keys", voice: "Voice", winds: "Winds" }[family]),
    family, instrumentProgram: Number.isFinite(options.instrumentProgram) ? options.instrumentProgram : family === "bass" ? 33 : family === "guitar" ? 29 : 0,
    performer: "", gearDescription: "", musicalRole: family === "drums" ? "rhythm" : "lead",
    notation: family === "drums" ? "drums" : ["guitar", "bass"].includes(family) ? "tab+score" : "score",
    clef: family === "bass" ? "bass" : family === "drums" ? "neutral" : "treble",
    tuning: clone(tuning), stringCount: tuning.length, capoFret: 0, maxFret: 24,
    volume: Number.isFinite(options.volume) ? options.volume : 0.85, pan: Number(options.pan) || 0,
    muted: Boolean(options.muted), solo: Boolean(options.solo), autoswitchGroup: "", visible: true,
    measures: Array.from({ length: Math.max(1, Number(options.measureCount) || 8) }, () => createMeasure(family, options)),
  };
}

export function createArrangement(options = {}) {
  const track = createTrack(options);
  return {
    schemaVersion: SCHEMA_VERSION, id: options.id || makeId("arrangement"), revision: 1,
    metadata: {
      title: options.title || "Untitled Airwaves Tab", artist: options.artist || "Airwaves",
      arrangementTitle: options.arrangementTitle || "Complete Score", type: "score",
      composer: "", album: "", difficulty: "intermediate", description: "",
    },
    tempo: Math.max(20, Math.min(400, Number(options.tempo) || 120)), ppq: PPQ,
    tracks: [track], syncAnchors: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

export function reflowVoice(voice) {
  let cursor = 0;
  voice.beats.forEach((beat) => {
    beat.startTick = cursor;
    beat.durationTicks = durationTicks(beat);
    cursor += beat.durationTicks;
  });
  return voice;
}

export function reflowMeasure(measure) {
  measure.voices.forEach(reflowVoice);
  return measure;
}

export function measureCapacity(measure) {
  const { numerator = 4, denominator = 4 } = measure.timeSignature || {};
  return Math.round(Math.max(1, numerator) * ((PPQ * 4) / Math.max(1, denominator)));
}

export function validateMeasure(measure) {
  const capacity = measureCapacity(measure);
  const voices = measure.voices.map((voice) => {
    const used = voice.beats.reduce((sum, beat) => sum + durationTicks(beat), 0);
    return { index: voice.index, used, capacity, delta: used - capacity, status: used === capacity ? "exact" : used > capacity ? "over" : "under" };
  });
  return { capacity, voices, valid: voices.every((voice) => voice.status !== "over") };
}

export function validateArrangement(arrangement) {
  const issues = [];
  if (!arrangement.metadata.title.trim()) issues.push({ type: "metadata", message: "Song title is required." });
  if (!arrangement.tracks.length) issues.push({ type: "tracks", message: "Add at least one track." });
  const measureCounts = new Set(arrangement.tracks.map((track) => track.measures.length));
  if (measureCounts.size > 1) issues.push({ type: "alignment", message: "Track measure counts are not aligned." });
  arrangement.tracks.forEach((track) => track.measures.forEach((measure, measureIndex) => {
    validateMeasure(measure).voices.forEach((voice) => {
      if (voice.status === "over") issues.push({ type: "rhythm", trackId: track.id, measureIndex, voice: voice.index, ticks: voice.delta, message: `${track.name}, bar ${measureIndex + 1}, voice ${voice.index} is overfull.` });
    });
  }));
  return issues;
}

export function getTrack(arrangement, trackId) {
  return arrangement.tracks.find((track) => track.id === trackId) || arrangement.tracks[0] || null;
}

export function getMeasure(arrangement, selection) {
  return getTrack(arrangement, selection.trackId)?.measures?.[selection.measureIndex] || null;
}

export function getVoice(arrangement, selection) {
  return getMeasure(arrangement, selection)?.voices?.[Math.max(0, (selection.voice || 1) - 1)] || null;
}

export function getBeat(arrangement, selection) {
  return getVoice(arrangement, selection)?.beats?.[selection.beatIndex] || null;
}

export function getNotes(arrangement, selection) {
  const notes = getBeat(arrangement, selection)?.notes || [];
  const indices = selection.noteIndices?.length ? selection.noteIndices : [selection.noteIndex || 0];
  return indices.map((index) => notes[index]).filter(Boolean);
}

export function normalizeSelection(arrangement, selection = {}) {
  const track = getTrack(arrangement, selection.trackId) || arrangement.tracks[0];
  if (!track) return null;
  const measureIndex = Math.max(0, Math.min(track.measures.length - 1, Number(selection.measureIndex) || 0));
  const voice = Math.max(1, Math.min(4, Number(selection.voice) || 1));
  const beats = track.measures[measureIndex].voices[voice - 1].beats;
  const beatIndex = Math.max(0, Math.min(Math.max(0, beats.length - 1), Number(selection.beatIndex) || 0));
  const notes = beats[beatIndex]?.notes || [];
  const noteIndex = Math.max(0, Math.min(Math.max(0, notes.length - 1), Number(selection.noteIndex) || 0));
  const noteIndices = [...new Set((selection.noteIndices || [noteIndex]).map(Number).filter((index) => index >= 0 && index < notes.length))];
  const rangeStart = Math.max(0, Math.min(beatIndex, Number(selection.rangeStart ?? beatIndex)));
  const rangeEnd = Math.max(rangeStart, Math.min(Math.max(0, beats.length - 1), Number(selection.rangeEnd ?? beatIndex)));
  return { scope: selection.scope || (notes.length ? "note" : "beat"), trackId: track.id, measureIndex, voice, beatIndex, noteIndex, noteIndices, rangeStart, rangeEnd };
}

export function normalizeArrangement(input) {
  if (!input || typeof input !== "object") return createArrangement();
  const arrangement = clone(input);
  arrangement.schemaVersion = SCHEMA_VERSION;
  arrangement.revision = Number(arrangement.revision) || 1;
  arrangement.ppq = PPQ;
  arrangement.metadata = { ...createArrangement().metadata, ...(arrangement.metadata || {}) };
  arrangement.tracks = (arrangement.tracks || []).slice(0, 64).map((track, trackIndex) => {
    const normalized = { ...createTrack({ family: track.family, measureCount: 1 }), ...track, order: trackIndex };
    normalized.measures = (track.measures || []).slice(0, 2048).map((measure) => {
      const base = createMeasure(normalized.family, { beatCount: 0 });
      const next = { ...base, ...measure, timeSignature: { ...base.timeSignature, ...(measure.timeSignature || {}) } };
      next.voices = VOICES.map((voiceIndex) => {
        const source = measure.voices?.find((voice) => voice.index === voiceIndex) || measure.voices?.[voiceIndex - 1];
        return { index: voiceIndex, beats: (source?.beats || []).slice(0, 1024).map((beat, beatIndex) => ({
          ...createBeat(normalized.family, { rest: true }), ...beat,
          id: beat.id || makeId("beat"), effects: { ...beatEffects(), ...(beat.effects || {}) },
          notes: (beat.notes || []).slice(0, 32).map((note) => ({ ...createNote(normalized.family, beatIndex), ...note, id: note.id || makeId("note"), effects: { ...noteEffects(), ...(note.effects || {}) } })),
        })) };
      });
      return reflowMeasure(next);
    });
    if (!normalized.measures.length) normalized.measures = [createMeasure(normalized.family)];
    return normalized;
  });
  if (!arrangement.tracks.length) arrangement.tracks = [createTrack()];
  arrangement.updatedAt = arrangement.updatedAt || new Date().toISOString();
  return arrangement;
}

export function insertAlignedMeasure(arrangement, index, sourceTrackId = null) {
  arrangement.tracks.forEach((track) => {
    const source = sourceTrackId ? getTrack(arrangement, sourceTrackId)?.measures?.[Math.max(0, index - 1)] : null;
    const measure = source
      ? createMeasure(track.family, { numerator: source.timeSignature.numerator, denominator: source.timeSignature.denominator })
      : createMeasure(track.family);
    track.measures.splice(index, 0, measure);
  });
}

export function deleteAlignedMeasure(arrangement, index) {
  if (arrangement.tracks.some((track) => track.measures.length <= 1)) return false;
  arrangement.tracks.forEach((track) => track.measures.splice(index, 1));
  return true;
}

export function duplicateAlignedMeasure(arrangement, index) {
  arrangement.tracks.forEach((track) => {
    const measure = clone(track.measures[index]);
    measure.id = makeId("bar");
    measure.voices.forEach((voice) => voice.beats.forEach((beat) => {
      beat.id = makeId("beat");
      beat.notes.forEach((note) => { note.id = makeId("note"); });
    }));
    track.measures.splice(index + 1, 0, measure);
  });
}

export function fitVoiceToMeasure(measure, voice, family) {
  const capacity = measureCapacity(measure);
  while (voice.beats.length && voice.beats.reduce((sum, beat) => sum + durationTicks(beat), 0) > capacity) voice.beats.pop();
  let remaining = capacity - voice.beats.reduce((sum, beat) => sum + durationTicks(beat), 0);
  const choices = DURATIONS.flatMap((duration) => [0, 1, 2].map((dots) => ({ duration, dots, ticks: durationTicks({ duration, dots }) }))).sort((a, b) => b.ticks - a.ticks);
  while (remaining > 0) {
    const choice = choices.find((item) => item.ticks <= remaining);
    if (!choice) break;
    voice.beats.push(createBeat(family, { duration: choice.duration, dots: choice.dots, rest: true }));
    remaining -= choice.ticks;
  }
  reflowVoice(voice);
  return remaining;
}

export class CommandHistory {
  constructor(limit = 150) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.baseline = "";
  }
  setBaseline(arrangement) { this.baseline = JSON.stringify(arrangement); }
  isDirty(arrangement) { return JSON.stringify(arrangement) !== this.baseline; }
  run({ type, label, payload = null, arrangement, selection, mutate }) {
    const before = clone(arrangement);
    const selectionBefore = clone(selection);
    const after = clone(arrangement);
    const draftSelection = clone(selection);
    mutate(after, draftSelection);
    const selectionAfter = normalizeSelection(after, draftSelection);
    if (JSON.stringify(before) === JSON.stringify(after)) return { arrangement, selection, command: null };
    after.updatedAt = new Date().toISOString();
    const command = { id: makeId("cmd"), type, label, payload: clone(payload), before, after: clone(after), selectionBefore, selectionAfter: clone(selectionAfter), timestamp: Date.now() };
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    return { arrangement: after, selection: selectionAfter, command };
  }
  undo(arrangement, selection) {
    const command = this.undoStack.pop();
    if (!command) return { arrangement, selection, command: null };
    this.redoStack.push(command);
    return { arrangement: clone(command.before), selection: clone(command.selectionBefore), command };
  }
  redo(arrangement, selection) {
    const command = this.redoStack.pop();
    if (!command) return { arrangement, selection, command: null };
    this.undoStack.push(command);
    return { arrangement: clone(command.after), selection: clone(command.selectionAfter), command };
  }
  clear(arrangement = null) { this.undoStack = []; this.redoStack = []; if (arrangement) this.setBaseline(arrangement); }
}

export function midiName(value) {
  const midi = Math.max(0, Math.min(127, Number(value) || 60));
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

const NOTE_INDEX = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
export function noteNameToMidi(name) {
  const match = /^([A-G]#?)(-?\d+)$/.exec(String(name).trim());
  return match ? (Number(match[2]) + 1) * 12 + NOTE_INDEX[match[1]] : 60;
}

const NOTE_EFFECT_TEX = {
  ghost: "g", accent: "ac", heavyAccent: "hac", staccato: "st", letRing: "lr", palmMute: "pm",
  naturalHarmonic: "nh", artificialHarmonic: "ah 12", hammerPull: "h",
  legatoSlide: "sl", shiftSlide: "ss", slideInBelow: "sib", slideInAbove: "sia",
  slideOutDown: "sod", slideOutUp: "sou", tapping: "lht", pickScrapeDown: "psd",
  pickScrapeUp: "psu", vibrato: "v", wideVibrato: "vw", golpeFinger: "glpf", golpeThumb: "glpt",
};

function noteTex(note, track) {
  let value;
  if (track.family === "drums") value = note.articulation || "SnareHit";
  else if (["guitar", "bass"].includes(track.family)) value = note.effects?.dead ? `x.${Math.max(1, Number(note.string) || 1)}` : `${Math.max(0, Number(note.fret) || 0)}.${Math.max(1, Number(note.string) || 1)}`;
  else value = midiName(note.midiPitch);
  const properties = Object.entries(note.effects || {}).filter(([, enabled]) => enabled).map(([effect]) => NOTE_EFFECT_TEX[effect]).filter(Boolean);
  if (note.effects?.bend) properties.push(`b (0 ${Number(note.bend?.amount) || 4})`);
  if (note.effects?.trill) properties.push(`tr ${Number(note.trill?.target) || 1} ${Number(note.trill?.rate) || 16}`);
  if (note.tieFromPrevious) properties.push("t");
  return `${value}${properties.length ? `{${properties.join(" ")}}` : ""}`;
}

function beatTex(beat, track) {
  const value = beat.rest || !beat.notes.length ? "r" : beat.notes.length > 1 ? `(${beat.notes.map((note) => noteTex(note, track)).join(" ")})` : noteTex(beat.notes[0], track);
  const props = [];
  if (beat.dots === 1) props.push("d");
  if (beat.dots === 2) props.push("dd");
  if (beat.tuplet) props.push(`tu ${beat.tuplet.enters}${beat.tuplet.times === 2 ? "" : ` ${beat.tuplet.times}`}`);
  if (beat.dynamic) props.push(`dy ${beat.dynamic}`);
  if (beat.text) props.push(`txt "${cleanTex(beat.text)}"`);
  if (beat.effects?.hairpin === "crescendo") props.push("cre");
  if (beat.effects?.hairpin === "diminuendo") props.push("dec");
  if (beat.effects?.brush === "up") props.push("au");
  if (beat.effects?.brush === "down") props.push("ad");
  if (beat.effects?.arpeggio === "up") props.push("au");
  if (beat.effects?.arpeggio === "down") props.push("ad");
  if (beat.effects?.pickStroke === "up") props.push("su");
  if (beat.effects?.pickStroke === "down") props.push("sd");
  if (beat.effects?.deadSlap) props.push("ds");
  if (beat.effects?.grace === "before") props.push("gr bb");
  if (beat.effects?.grace === "on") props.push("gr ob");
  if (beat.effects?.tremoloPicking !== "none") props.push(`tp ${beat.effects.tremoloPicking === "8" ? 1 : beat.effects.tremoloPicking === "16" ? 2 : 3}`);
  if (beat.effects?.slash) props.push("slashed");
  return `${value}.${beat.duration}${props.length ? `{${props.join(" ")}}` : ""}`;
}

function cleanTex(value) { return String(value || "").replace(/["\\]/g, ""); }

function trackTex(track, includeMaster) {
  const setup = track.family === "drums"
    ? "\\staff{score} \n\\instrument percussion\n\\clef neutral\n\\articulation defaults"
    : ["guitar", "bass"].includes(track.family)
      ? `\\staff{score tabs}\n\\instrument ${track.instrumentProgram}\n\\tuning (${track.tuning.join(" ")})${track.capoFret ? `\n\\capo ${track.capoFret}` : ""}`
      : `\\staff{score}\n\\instrument ${track.instrumentProgram}\n\\tuning piano\n\\clef ${track.clef}`;
  const voices = VOICES.map((voiceIndex) => {
    const present = track.measures.some((measure) => measure.voices[voiceIndex - 1].beats.length);
    if (!present) return "";
    const bars = track.measures.map((measure, measureIndex) => {
      const voice = measure.voices[voiceIndex - 1];
      const previous = track.measures[measureIndex - 1];
      const addMaster = includeMaster && voiceIndex === 1;
      const meta = [];
      if (addMaster && (!previous || previous.timeSignature.numerator !== measure.timeSignature.numerator || previous.timeSignature.denominator !== measure.timeSignature.denominator)) meta.push(`\\ts (${measure.timeSignature.numerator} ${measure.timeSignature.denominator})`);
      if (addMaster && measure.tempoEvents?.[0]?.bpm) meta.push(`\\tempo ${measure.tempoEvents[0].bpm}`);
      if (addMaster && measure.sectionLabel) meta.push(`\\section "${cleanTex(measure.sectionLabel)}"`);
      if (addMaster && measure.repeatStart) meta.push("\\ro");
      if (addMaster && measure.repeatEnd) meta.push(`\\rc ${measure.repeatEnd}`);
      if (addMaster && measure.alternateEndings?.length) meta.push(`\\ae (${measure.alternateEndings.join(" ")})`);
      return `${meta.join(" ")} ${voice.beats.map((beat) => beatTex(beat, track)).join(" ")} |`.trim();
    }).join("\n");
    return `${voiceIndex > 1 ? "\\voice\n" : ""}${bars}`;
  }).filter(Boolean).join("\n");
  return `\\track "${cleanTex(track.name)}"\n${setup}\n${voices}`;
}

export function toAlphaTex(arrangement, trackIds = null) {
  const tracks = trackIds?.length ? arrangement.tracks.filter((track) => trackIds.includes(track.id)) : arrangement.tracks;
  return `\\title "${cleanTex(arrangement.metadata.title)}"\n\\artist "${cleanTex(arrangement.metadata.artist)}"\n\\album "${cleanTex(arrangement.metadata.album)}"\n\\music "${cleanTex(arrangement.metadata.composer)}"\n\\tempo ${arrangement.tempo}\n.\n${tracks.map((track, index) => trackTex(track, index === 0)).join("\n")}`;
}
