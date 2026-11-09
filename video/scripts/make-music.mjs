// "Workbench Loop": a small lo-fi bed written in code so the video has music with no licence strings.
// Electric-piano chords, a round bass, soft brushed drums and a little vinyl dust.
// The drums drop out when the credits start, and the length follows the timeline.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const timeline = JSON.parse(await readFile(path.join(root, "public", "data", "timeline.json"), "utf8"));
const RATE = 44100;
const seconds = timeline.totalFrames / timeline.fps + 0.5;
const creditsAt = (timeline.scenes.find((s) => s.id === "outro")?.blurAt ?? timeline.totalFrames) / timeline.fps;
const N = Math.ceil(seconds * RATE);
const mix = new Float32Array(N);

const BPM = 92;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

let seed = 11;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rand() * 2 - 1;

function add(start, samples, gain = 1) {
  const s0 = Math.round(start * RATE);
  for (let i = 0; i < samples.length && s0 + i < N; i++) if (s0 + i >= 0) mix[s0 + i] += samples[i] * gain;
}

// Electric piano: a few harmonics, a bell-like tine at the attack, slow decay.
function epiano(note, dur, vel) {
  const f = midi(note);
  const n = Math.round((dur + 1.2) * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.006) * Math.exp(-t * 1.1) * (t > dur ? Math.exp(-(t - dur) * 5) : 1);
    const body = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * 2 * f * t) + 0.12 * Math.sin(2 * Math.PI * 3.01 * f * t);
    const tine = 0.18 * Math.sin(2 * Math.PI * 7.02 * f * t) * Math.exp(-t * 14);
    out[i] = (body + tine) * env * vel;
  }
  return out;
}

function bass(note, dur) {
  const f = midi(note);
  const n = Math.round((dur + 0.3) * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.01) * Math.exp(-t * 1.6) * (t > dur ? Math.exp(-(t - dur) * 12) : 1);
    out[i] = Math.tanh(1.4 * (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(4 * Math.PI * f * t))) * env;
  }
  return out;
}

function kick() {
  const n = Math.round(0.35 * RATE);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * (48 + 90 * Math.exp(-t * 28))) / RATE;
    out[i] = Math.sin(phase) * Math.exp(-t * 9);
  }
  return out;
}

function brush(len, bright) {
  const n = Math.round(len * RATE);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const w = noise();
    lp += bright * (w - lp);
    out[i] = (w - lp) * Math.exp(-t * (len < 0.1 ? 60 : 16));
  }
  return out;
}

// Fmaj7 – Em7 – Dm7 – Cmaj7, voiced low and close.
const chords = [
  { root: 41, notes: [57, 60, 64, 67] },
  { root: 40, notes: [55, 59, 62, 67] },
  { root: 38, notes: [53, 57, 60, 65] },
  { root: 36, notes: [52, 55, 59, 64] },
];

const K = kick(), HAT = brush(0.06, 0.5), SNARE = brush(0.22, 0.25);
const bars = Math.ceil(seconds / BAR);
for (let b = 0; b < bars; b++) {
  const t0 = b * BAR;
  const chord = chords[b % chords.length];
  const drums = b >= 2 && t0 < creditsAt - 0.2;
  const human = () => (rand() - 0.5) * 0.018;

  // Chord on beat 1 (slightly strummed), a softer push on the "and" of 2.
  chord.notes.forEach((note, i) => add(t0 + i * 0.014 + human(), epiano(note, BEAT * 2.2, 0.11 - i * 0.008)));
  chord.notes.slice(1).forEach((note, i) => add(t0 + BEAT * 2.5 + i * 0.012 + human(), epiano(note, BEAT * 1.2, 0.06)));
  // A short melodic answer every other bar.
  if (b % 2 === 1) add(t0 + BEAT * 3.5 + human(), epiano(chord.notes[3] + 12, BEAT * 0.8, 0.05));

  add(t0 + human(), bass(chord.root, BEAT * 1.6), 0.32);
  add(t0 + BEAT * 2.75 + human(), bass(chord.root + 7, BEAT * 0.9), 0.22);

  if (drums) {
    add(t0, K, 0.5);
    add(t0 + BEAT * 2.5, K, 0.35);
    add(t0 + BEAT + human(), SNARE, 0.16);
    add(t0 + BEAT * 3 + human(), SNARE, 0.16);
    for (let e = 0; e < 8; e++) {
      const swing = e % 2 === 1 ? BEAT * 0.12 : 0;
      add(t0 + e * BEAT * 0.5 + swing + human(), HAT, e % 2 === 0 ? 0.05 : 0.03);
    }
  }
}

// Vinyl dust and a warm low-pass over the whole bed.
let lp = 0;
for (let i = 0; i < N; i++) {
  if (rand() < 0.00025) mix[i] += noise() * 0.12;
  mix[i] += noise() * 0.0025;
  lp += 0.35 * (mix[i] - lp);
  mix[i] = Math.tanh(lp * 1.3);
}
const fadeIn = RATE * 1.5, fadeOut = RATE * 3;
let peak = 0;
for (let i = 0; i < N; i++) {
  mix[i] *= Math.min(1, i / fadeIn, (N - i) / fadeOut);
  peak = Math.max(peak, Math.abs(mix[i]));
}

const data = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) data.writeInt16LE(Math.round((mix[i] / peak) * 0.85 * 32767), i * 2);
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write("data", 36); header.writeUInt32LE(data.length, 40);
await mkdir(path.join(root, "public", "music"), { recursive: true });
await writeFile(path.join(root, "public", "music", "workbench-loop.wav"), Buffer.concat([header, data]));
console.log(`배경음악 ${seconds.toFixed(1)}초를 만들었습니다 (${BPM} BPM).`);
