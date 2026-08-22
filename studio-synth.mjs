import { PPQ, durationTicks, measureTicks, noteNameToMidi } from "./studio-core.mjs";

const WAVE_BY_FAMILY = { guitar: "sawtooth", bass: "triangle", keys: "triangle", voice: "sine", winds: "sine" };

function noteFrequency(note, track, pitchShift) {
  let midi;
  if (track.family === "guitar" || track.family === "bass") {
    const openMidi = noteNameToMidi(track.tuning[(note.string || 1) - 1] ?? track.tuning[0]);
    midi = openMidi + (note.fret || 0) + (track.capoFret || 0);
  } else if (track.family === "drums") {
    return null;
  } else {
    midi = note.midiPitch;
  }
  if (!Number.isFinite(midi)) return null;
  midi += pitchShift || 0;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function drumProfile(articulation) {
  const name = String(articulation || "").toLowerCase();
  if (name.includes("kick")) return { type: "tone", freq: 60, decay: 0.22 };
  if (name.includes("snare")) return { type: "noise", decay: 0.16, tone: 1800 };
  if (name.includes("hat") || name.includes("cymbal") || name.includes("crash") || name.includes("ride")) return { type: "noise", decay: name.includes("closed") ? 0.06 : 0.4, tone: 8000 };
  if (name.includes("tom")) return { type: "tone", freq: 140, decay: 0.28 };
  return { type: "noise", decay: 0.12, tone: 3000 };
}

function buildSchedule(arrangement, pitchShift) {
  const events = [];
  const metronomeBeats = [];
  if (!arrangement?.tracks?.length) return { events, duration: 0, metronomeBeats };
  const reference = arrangement.tracks[0].measures;
  let bpm = arrangement.tempo || 120;
  const measureStarts = []; const measureBpms = [];
  let t = 0;
  reference.forEach((measure) => {
    if (measure.tempoEvents?.[0]?.bpm) bpm = measure.tempoEvents[0].bpm;
    measureStarts.push(t); measureBpms.push(bpm);
    const durSec = measureTicks(measure) * (60 / bpm / PPQ);
    const beatCount = measure.timeSignature?.numerator || 4;
    for (let i = 0; i < beatCount; i++) metronomeBeats.push({ time: t + (durSec / beatCount) * i, accent: i === 0 });
    t += durSec;
  });
  const duration = t;
  const anySolo = arrangement.tracks.some((track) => track.solo);
  arrangement.tracks.forEach((track) => {
    if (track.muted) return;
    if (anySolo && !track.solo) return;
    const gain = Math.max(0, Math.min(1, Number.isFinite(track.volume) ? track.volume : 0.85)) * 0.5;
    const wave = WAVE_BY_FAMILY[track.family] || "sine";
    track.measures.forEach((measure, mi) => {
      const bpmHere = measureBpms[mi] || bpm;
      const secondsPerTick = 60 / bpmHere / PPQ;
      const voice = measure.voices[0];
      if (!voice) return;
      let cursor = 0;
      voice.beats.forEach((beat) => {
        const beatStart = measureStarts[mi] + cursor * secondsPerTick;
        const beatDur = durationTicks(beat) * secondsPerTick;
        cursor += durationTicks(beat);
        if (beat.rest || !beat.notes.length) return;
        beat.notes.forEach((note) => {
          if (track.family === "drums") {
            const profile = drumProfile(note.articulation);
            events.push({ time: beatStart, duration: Math.min(beatDur, profile.decay), gain: gain * 1.2, tone: profile.tone, freq: profile.type === "tone" ? profile.freq : null });
          } else {
            const freq = noteFrequency(note, track, pitchShift);
            if (!freq) return;
            const sustainScale = note.effects?.staccato ? 0.4 : note.effects?.letRing ? 1.4 : 1;
            events.push({ time: beatStart, duration: Math.max(0.05, beatDur * sustainScale), gain, freq, wave });
          }
        });
      });
    });
  });
  return { events, duration, metronomeBeats };
}

export class TabSynth {
  constructor() {
    this.ctx = null; this.masterGain = null;
    this.playing = false; this.offset = 0; this.startedAt = 0;
    this.speed = 1; this.masterVolume = 0.85;
    this.metronomeOn = false; this.countInOn = false;
    this.loopRange = null; this.isLooping = false;
    this.onPosition = null; this.onStateChange = null;
    this.arrangement = null; this.pitchShift = 0;
    this.events = []; this.metronomeBeats = []; this.duration = 0;
    this.activeNodes = []; this.rafId = 0;
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  setMasterVolume(v) { this.masterVolume = v; if (this.masterGain) this.masterGain.gain.value = v; }
  setLoop(range) { this.loopRange = range; }
  setLooping(on) { this.isLooping = on; }
  setMetronome(on) { this.metronomeOn = on; }
  setCountIn(on) { this.countInOn = on; }

  load(arrangement) {
    this.arrangement = arrangement;
    const { events, duration, metronomeBeats } = buildSchedule(arrangement, this.pitchShift);
    this.events = events; this.duration = duration; this.metronomeBeats = metronomeBeats;
    if (this.offset > duration) this.offset = 0;
  }

  setSpeed(rate) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.speed = Math.max(0.1, rate);
    if (wasPlaying) this.play();
  }

  setPitchShift(semitones) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.pitchShift = semitones;
    this.load(this.arrangement);
    if (wasPlaying) this.play();
  }

  getPosition() {
    if (!this.playing || !this.ctx) return this.offset;
    return this.offset + (this.ctx.currentTime - this.startedAt) * this.speed;
  }

  _countInInfo() {
    const bpm = this.arrangement?.tracks?.[0]?.measures?.[0]?.tempoEvents?.[0]?.bpm || this.arrangement?.tempo || 120;
    const numerator = this.arrangement?.tracks?.[0]?.measures?.[0]?.timeSignature?.numerator || 4;
    return { duration: (60 / bpm) * numerator, numerator };
  }

  play() {
    if (this.playing || !this.arrangement) return;
    this.ensureContext();
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (this.offset >= this.duration) this.offset = 0;
    const countIn = this.countInOn && this.offset === 0 ? this._countInInfo() : null;
    const delay = countIn ? countIn.duration : 0;
    this.startedAt = this.ctx.currentTime + delay;
    this.playing = true;
    if (countIn) {
      const beatDur = countIn.duration / countIn.numerator;
      for (let i = 0; i < countIn.numerator; i++) this._scheduleClick(this.ctx.currentTime + beatDur * i, i === 0);
    }
    this._scheduleFrom(this.offset);
    this.onStateChange?.(true);
    this._tick();
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.getPosition();
    this.playing = false;
    this._stopNodes();
    cancelAnimationFrame(this.rafId);
    this.onStateChange?.(false);
  }

  stop() {
    this.playing = false; this.offset = 0;
    this._stopNodes();
    cancelAnimationFrame(this.rafId);
    this.onStateChange?.(false);
    this.onPosition?.(0, this.duration);
  }

  seek(sec) {
    const wasPlaying = this.playing;
    if (wasPlaying) this._stopNodes();
    this.offset = Math.max(0, Math.min(this.duration, sec));
    if (wasPlaying) { this.ensureContext(); this.startedAt = this.ctx.currentTime; this._scheduleFrom(this.offset); }
    this.onPosition?.(this.offset, this.duration);
  }

  _stopNodes() { this.activeNodes.forEach((node) => { try { node.stop(); } catch { /* already stopped */ } }); this.activeNodes = []; }

  _scheduleFrom(offsetSeconds) {
    this._stopNodes();
    const base = this.startedAt;
    const lookaheadEnd = this.loopRange && this.isLooping ? this.loopRange.end : this.duration;
    this.events.forEach((event) => {
      if (event.time < offsetSeconds || event.time >= lookaheadEnd) return;
      this._scheduleEvent(event, base + (event.time - offsetSeconds) / this.speed);
    });
    if (this.metronomeOn) this.metronomeBeats.forEach((beat) => {
      if (beat.time < offsetSeconds || beat.time >= lookaheadEnd) return;
      this._scheduleClick(base + (beat.time - offsetSeconds) / this.speed, beat.accent);
    });
  }

  _scheduleEvent(event, when) {
    const ctx = this.ctx;
    const gainNode = ctx.createGain();
    gainNode.connect(this.masterGain);
    const dur = Math.max(0.05, event.duration / this.speed);
    gainNode.gain.setValueAtTime(0, when);
    gainNode.gain.linearRampToValueAtTime(event.gain, when + Math.min(0.01, dur * 0.2));
    gainNode.gain.linearRampToValueAtTime(0, when + dur);
    if (event.freq) {
      const osc = ctx.createOscillator();
      osc.type = event.wave; osc.frequency.setValueAtTime(event.freq, when);
      osc.connect(gainNode); osc.start(when); osc.stop(when + dur + 0.02);
      this.activeNodes.push(osc);
    } else {
      const noise = this._noiseSource();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass"; filter.frequency.value = event.tone || 2000;
      noise.connect(filter); filter.connect(gainNode);
      noise.start(when); noise.stop(when + dur + 0.02);
      this.activeNodes.push(noise);
    }
  }

  _scheduleClick(when, accent) {
    const ctx = this.ctx;
    const gainNode = ctx.createGain();
    gainNode.connect(this.masterGain);
    gainNode.gain.setValueAtTime(accent ? 0.5 : 0.3, when);
    gainNode.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    const osc = ctx.createOscillator();
    osc.type = "square"; osc.frequency.value = accent ? 1500 : 1000;
    osc.connect(gainNode); osc.start(when); osc.stop(when + 0.06);
    this.activeNodes.push(osc);
  }

  _noiseSource() {
    const ctx = this.ctx;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  _tick() {
    if (!this.playing) return;
    let pos = this.getPosition();
    if (this.loopRange && this.isLooping && pos >= this.loopRange.end) { this.seek(this.loopRange.start); pos = this.loopRange.start; }
    else if (!this.loopRange && this.isLooping && pos >= this.duration) { this.seek(0); pos = 0; }
    else if (pos >= this.duration) { this.stop(); return; }
    this.onPosition?.(Math.max(0, pos), this.duration);
    this.rafId = requestAnimationFrame(() => this._tick());
  }
}
