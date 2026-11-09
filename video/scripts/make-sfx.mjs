// Small procedural foley for the workbench: paper landing on the mat, and a marker stroke.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RATE = 48000;

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Seeded noise so every render sounds the same.
let seed = 7;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

function paperDrop() {
  const n = Math.round(RATE * 0.28);
  const out = new Float32Array(n);
  let low = 0, band = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const white = noise();
    low += 0.08 * (white - low);           // soft body of the sheet
    band += 0.45 * (white - band);         // papery crackle
    const thump = Math.sin(2 * Math.PI * 85 * t) * Math.exp(-t * 38);
    out[i] = (low * 1.6 * Math.exp(-t * 22) + (white - band) * 0.25 * Math.exp(-t * 60) + thump * 0.5) * 0.7;
  }
  return out;
}

function markerStroke() {
  const n = Math.round(RATE * 0.75);
  const out = new Float32Array(n);
  let low = 0, high = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const white = noise();
    high += 0.6 * (white - high);
    low += 0.25 * (high - low);
    const bandpassed = high - low;
    const envelope = Math.min(1, t / 0.04) * Math.min(1, (0.75 - t) / 0.12);
    const grain = 0.7 + 0.3 * Math.sin(2 * Math.PI * 23 * t + Math.sin(2 * Math.PI * 3 * t) * 2);
    out[i] = bandpassed * envelope * grain * 0.45;
  }
  return out;
}

await mkdir(path.join(root, "public", "sfx"), { recursive: true });
await writeFile(path.join(root, "public", "sfx", "paper.wav"), wav(paperDrop()));
await writeFile(path.join(root, "public", "sfx", "marker.wav"), wav(markerStroke()));
console.log("효과음 2개를 만들었습니다.");
