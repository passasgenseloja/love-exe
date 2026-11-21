/* LOVE.exe — gerador do instrumental (~7 min, rock/rap, sem letra)
   Uso:  node tools/make-music.mjs
   Sai:  audio/love-rap.mp3
   Tudo é sintetizado aqui do zero (nada copiado de lugar nenhum). */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Mp3Encoder } from "@breezystack/lamejs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "audio", "love-rap.mp3");

/* ------------------------------------------------------------ tempo/estrutura */
const SR = 44100;
const BPM = 85;
const SPB = 60 / BPM;          /* segundos por tempo */
const BAR = SPB * 4;           /* segundos por compasso */
const SLOT = SPB / 2;          /* colcheia */

const SECTIONS = [
  { name: "intro",     bars: 8,  drums: "none",   bass: false, riff: "none",  pad: true,  lead: false, hats: false, riser: "intro" },
  { name: "verse 1",   bars: 16, drums: "sparse", bass: true,  riff: "none",  pad: true,  lead: false, hats: true,  riser: null },
  { name: "chorus 1",  bars: 16, drums: "full",   bass: true,  riff: "hard",  pad: true,  lead: true,  hats: true,  riser: null },
  { name: "verse 2",   bars: 16, drums: "full",   bass: true,  riff: "soft",  pad: true,  lead: false, hats: true,  riser: null },
  { name: "chorus 2",  bars: 16, drums: "full",   bass: true,  riff: "hard",  pad: true,  lead: true,  hats: true,  riser: null },
  { name: "breakdown", bars: 8,  drums: "none",   bass: true,  riff: "none",  pad: true,  lead: false, hats: false, riser: "break" },
  { name: "verse 3",   bars: 16, drums: "full",   bass: true,  riff: "soft",  pad: true,  lead: false, hats: true,  riser: null },
  { name: "chorus 3",  bars: 16, drums: "full",   bass: true,  riff: "hard",  pad: true,  lead: true,  hats: true,  riser: null },
  { name: "outro",     bars: 37, drums: "fade",   bass: true,  riff: "hard",  pad: true,  lead: false, hats: true,  riser: null }
];

const TOTAL_BARS = SECTIONS.reduce((a, s) => a + s.bars, 0);
const DURATION = TOTAL_BARS * BAR + 4;   /* + cauda de eco */
const N = Math.ceil(DURATION * SR);

/* ------------------------------------------------------------ progressão */
/* Am  F  C  G  — grave e menor, repetindo compasso a compasso */
const CHORDS = [
  { bass: 33, guitar: 45, pad: [57, 60, 64] },   /* Am */
  { bass: 29, guitar: 41, pad: [53, 57, 60] },   /* F  */
  { bass: 36, guitar: 48, pad: [55, 60, 64] },   /* C  */
  { bass: 31, guitar: 43, pad: [55, 59, 62] }    /* G  */
];

const HOOK_A = [[1, 69, 0.9], [2, 72, 0.9], [4, 74, 1.0], [6, 72, 0.8]];   /* A C D C */
const HOOK_B = [[1, 76, 1.0], [3, 74, 0.85], [5, 72, 0.8], [7, 69, 0.9]];   /* E D C A */

/* ------------------------------------------------------------ helpers */
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0x5150E);       /* seed fixo = arquivo sempre igual */
const noise = () => rnd() * 2 - 1;

function env(t, dur, atk, dec, sus, rel) {
  /* atk/dec em seg, sus = nível, rel em seg contando do fim */
  if (t < 0 || t > dur) return 0;
  if (t < atk) return t / atk;
  const afterAtk = t - atk;
  if (afterAtk < dec) return 1 + (sus - 1) * (afterAtk / dec);
  const relStart = dur - rel;
  if (t > relStart) return sus * Math.max(0, (dur - t) / rel);
  return sus;
}

function write(buf, start, mono, pan, gain) {
  const p = (pan * 0.5 + 0.5) * Math.PI * 0.5;   /* -1..1 -> 0..pi/2 */
  const gl = Math.cos(p);
  const gr = Math.sin(p);
  const i0 = Math.max(0, Math.round(start * SR));
  for (let i = 0; i < mono.length; i++) {
    const idx = i0 + i;
    if (idx >= N) break;
    buf.L[idx] += mono[i] * gl * gain;
    buf.R[idx] += mono[i] * gr * gain;
  }
}

function writeSend(send, start, mono, gain) {
  const i0 = Math.max(0, Math.round(start * SR));
  for (let i = 0; i < mono.length; i++) {
    const idx = i0 + i;
    if (idx >= N) break;
    send[idx] += mono[i] * gain;
  }
}

/* low-pass de 1 polo (retorna novo array) */
function lp(arr, cutoff) {
  const a = Math.exp(-2 * Math.PI * cutoff / SR);
  const out = new Float32Array(arr.length);
  let z = 0;
  for (let i = 0; i < arr.length; i++) {
    z = (1 - a) * arr[i] + a * z;
    out[i] = z;
  }
  return out;
}

function hp(arr, cutoff) {
  const a = Math.exp(-2 * Math.PI * cutoff / SR);
  const out = new Float32Array(arr.length);
  let z = 0, prev = 0;
  for (let i = 0; i < arr.length; i++) {
    z = a * (z + arr[i] - prev);
    prev = arr[i];
    out[i] = z;
  }
  return out;
}

/* ------------------------------------------------------------ vozes */
function kick() {
  const dur = 0.45;
  const out = new Float32Array(Math.ceil(dur * SR));
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = 46 + 120 * Math.exp(-t * 34);          /* sweep grave */
    ph += (2 * Math.PI * f) / SR;
    const body = Math.sin(ph) * Math.exp(-t * 7.5);
    const click = noise() * Math.exp(-t * 260) * 0.4;
    out[i] = Math.tanh((body + click) * 1.6) * 0.95;
  }
  return out;
}

function snare() {
  const dur = 0.3;
  const out = new Float32Array(Math.ceil(dur * SR));
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const n = noise() * Math.exp(-t * 17);
    ph += (2 * Math.PI * (185 - 60 * t)) / SR;
    const tone = Math.sin(ph) * Math.exp(-t * 26) * 0.7;
    out[i] = n * 0.8 + tone;
  }
  return hp(lp(out, 7200), 260);
}

function hat(open) {
  const dur = open ? 0.22 : 0.055;
  const out = new Float32Array(Math.ceil(dur * SR));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = noise() * Math.exp(-t * (open ? 16 : 90));
  }
  return hp(out, 6500);
}

function bass(freq, dur) {
  const total = Math.ceil((dur + 0.06) * SR);
  const out = new Float32Array(total);
  let ph = 0, ph2 = 0;
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * freq) / SR;
    ph2 += (2 * Math.PI * freq * 2) / SR;
    const e = env(t, dur, 0.012, 0.08, 0.82, 0.05);
    out[i] = (Math.sin(ph) + 0.28 * Math.sin(ph2) + 0.1 * Math.sin(ph * 3)) * e;
  }
  return lp(out, 900).map((v) => Math.tanh(v * 1.35));
}

function riff(root, dur, palm) {
  const freqs = [root, root * 1.4983, root * 2];     /* 1 5 8 */
  const total = Math.ceil((dur + 0.1) * SR);
  const out = new Float32Array(total);
  const a = palm ? 0.004 : 0.01;
  const d = palm ? 0.9 : 1.6;
  const r = palm ? 0.04 : 0.09;
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    let s = 0;
    for (let k = 0; k < freqs.length; k++) {
      const det = 1 + (k === 0 ? 0.003 : -0.002);
      s += saw(freqs[k] * det, t) * (k === 0 ? 1 : 0.72);
      s += saw(freqs[k] * (2 - det), t) * (k === 0 ? 0.5 : 0.35);
    }
    const e = env(t, dur, a, d * 0.06, palm ? 0.72 : 0.6, r);
    out[i] = Math.tanh(s * e * (palm ? 2.4 : 3.1)) * 0.62;
  }
  return lp(out, palm ? 4200 : 5200);
}

function saw(freq, t) {
  /* fase senoidal virtual via tabela simples de 256 pontos */
  const f = (freq * t) % 1;
  return 2 * f - 1;
}

function pad(freqs, dur) {
  const total = Math.ceil((dur + 0.35) * SR);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    let s = 0;
    for (let k = 0; k < freqs.length; k++) {
      const f = mtof(freqs[k]);
      s += saw(f * 1.004, t) * 0.5;
      s += saw(f * 0.996, t) * 0.5;
      s += Math.sin(2 * Math.PI * f * t) * 0.6;
    }
    const e = env(t, dur, 0.5, 0.4, 0.85, 0.9);
    out[i] = (s / freqs.length) * e;
  }
  return lp(out, 1500).map((v) => v * 0.85);
}

function lead(freq, dur) {
  const total = Math.ceil((dur + 0.12) * SR);
  const out = new Float32Array(total);
  let ph = 0;
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t);
    ph += (freq * vib) / SR;
    const sq = (ph % 1) < 0.5 ? 1 : -1;
    const sa = 2 * ((ph * 1.005) % 1) - 1;
    const e = env(t, dur, 0.02, 0.1, 0.7, 0.12);
    out[i] = (sq * 0.55 + sa * 0.45) * e;
  }
  return lp(out, 3400).map((v) => Math.tanh(v * 1.8) * 0.5);
}

function riser(dur) {
  const total = Math.ceil(dur * SR);
  const out = new Float32Array(total);
  let ph = 0;
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    const p = t / dur;
    const f = 160 + 900 * p * p;
    ph += (2 * Math.PI * f) / SR;
    const n = noise() * (0.15 + 0.85 * p) * 0.5;
    out[i] = (Math.sin(ph) * 0.35 + n) * p * p;
  }
  return hp(out, 400);
}

function boom() {
  const dur = 2.4;
  const out = new Float32Array(Math.ceil(dur * SR));
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = 34 + 70 * Math.exp(-t * 4);
    ph += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 1.5) * 0.9;
  }
  return out;
}

/* ------------------------------------------------------------ render */
const buf = { L: new Float32Array(N), R: new Float32Array(N) };
const send = new Float32Array(N);

const K = kick(), SN = snare(), H = hat(false), HO = hat(true), BOM = boom();

let t = 0;
for (const sec of SECTIONS) {
  console.log(`  ${sec.name.padEnd(9)} ${sec.bars} compassos`);
  for (let b = 0; b < sec.bars; b++) {
    const barT = t + b * BAR;
    const chord = CHORDS[(b + SECTIONS.indexOf(sec) * 2) % CHORDS.length];
    const barNumInSec = b;
    const lastBarOfSec = b === sec.bars - 1;

    /* --- pad --- */
    if (sec.pad) write(buf, barT, pad(chord.pad, BAR * 1.02), 0, 0.5);

    /* --- bateria --- */
    if (sec.drums !== "none") {
      const fade = sec.drums === "fade";
      let g = 1;
      if (fade) {
        if (barNumInSec >= 30) g = 0;
        else if (barNumInSec >= 22) g = 0.45;
        else if (barNumInSec >= 16) g = 0.7;
      }
      if (g > 0) {
        const sparse = sec.drums === "sparse";
        const kicks = sparse ? [0, 5] : [0, 5, 6].filter((s, i) => i < 2 || (barNumInSec % 4 === 3));
        for (const s of kicks) write(buf, barT + s * SLOT, K, 0, 1.0 * g);
        write(buf, barT + 4 * SLOT, SN, 0.05, 0.85 * g);
        writeSend(send, barT + 4 * SLOT, SN, 0.3 * g);
        /* fill de fim de frase */
        if (barNumInSec % 4 === 3 && !fade) {
          write(buf, barT + 6.5 * SLOT, SN, -0.1, 0.5 * g);
          write(buf, barT + 7.5 * SLOT, SN, 0.1, 0.75 * g);
        }
        if (sec.hats && g > 0) {
          for (let s = 0; s < 8; s++) {
            const v = [0.8, 0.4, 0.55, 0.4, 0.75, 0.42, 0.55, 0.45][s];
            write(buf, barT + s * SLOT, s === 7 ? HO : H, s % 2 ? 0.35 : -0.3, v * 0.42 * g);
            /* semicolcheias de 16th nas verses cheias */
            if (sec.drums === "full" && s % 2 === 1 && (barNumInSec + s) % 3 !== 0) {
              write(buf, barT + (s + 0.5) * SLOT, H, s % 2 ? -0.3 : 0.3, 0.22 * g);
            }
          }
        }
      }
    }

    /* --- baixo --- */
    if (sec.bass) {
      const g = sec.drums === "fade" && barNumInSec >= 30 ? 0 : 1;
      if (g) {
        write(buf, barT, bass(mtof(chord.bass), BAR * 0.46), 0, 0.95);
        write(buf, barT + 5 * SLOT, bass(mtof(chord.bass), BAR * 0.3), 0, 0.8);
        if (barNumInSec % 4 === 3) {
          write(buf, barT + 7 * SLOT, bass(mtof(chord.bass + 12), SLOT * 1.6), 0, 0.6);
        }
      }
    }

    /* --- riff --- */
    if (sec.riff !== "none") {
      const root = mtof(chord.guitar);
      let g = 1;
      if (sec.riff === "soft") g = 0.42;
      if (sec.drums === "fade") {
        if (barNumInSec >= 30) g = 0;
        else if (barNumInSec >= 22) g *= 0.5;
      }
      if (g > 0) {
        if (sec.riff === "hard") {
          const pat = [1, 1, 0, 1, 1, 1, 0, 1];
          for (let s = 0; s < 8; s++) {
            if (!pat[s]) continue;
            const accent = s === 0 || s === 4;
            const dur = accent ? SLOT * 0.85 : SLOT * 0.42;
            const r = riff(root, dur, !accent);
            write(buf, barT + s * SLOT, r, s % 2 ? -0.12 : 0.12, (accent ? 1 : 0.7) * g);
            writeSend(send, barT + s * SLOT, r, 0.16 * g);
          }
        } else {
          const r1 = riff(root, BAR * 0.45, false);
          write(buf, barT, r1, -0.1, 0.55 * g);
          write(buf, barT + 5 * SLOT, riff(root, SLOT * 1.4, true), 0.1, 0.5 * g);
          writeSend(send, barT, r1, 0.2);
        }
      }
    }

    /* --- hook (só nos refrões) --- */
    if (sec.lead && barNumInSec % 4 < 2) {
      const hook = barNumInSec % 4 === 0 ? HOOK_A : HOOK_B;
      for (const [slot, note, vel] of hook) {
        const l = lead(mtof(note), SLOT * 0.95);
        write(buf, barT + slot * SLOT, l, 0, 0.5 * vel);
        writeSend(send, barT + slot * SLOT, l, 0.3 * vel);
      }
    }

    /* --- risers --- */
    if (sec.riser && lastBarOfSec) {
      const dur = sec.riser === "break" ? BAR * 2 : BAR;
      const start = barT - (sec.riser === "break" ? BAR : 0);
      const r = riser(dur);
      write(buf, start, r, 0, 0.5);
      writeSend(send, start, r, 0.3);
    }
  }
  t += sec.bars * BAR;
}

/* impacto grave no primeiro susto (fim do intro) */
write(buf, SECTIONS[0].bars * BAR - 0.05, BOM, 0, 0.55);

/* ------------------------------------------------------------ eco (delay) */
console.log("  eco...");
const D = Math.round(0.37 * SR);
const fb = 0.42;
const bufRegen = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const d = i >= D ? bufRegen[i - D] : 0;
  const v = send[i] + fb * d;
  bufRegen[i] = v;
  const wet = d * 0.5;
  buf.L[i] += wet;
  buf.R[i] += wet;
}

/* ------------------------------------------------------------ master */
console.log("  master...");
const fadeIn = Math.round(2 * SR);
const fadeOut = Math.round(6 * SR);
for (let i = 0; i < N; i++) {
  let g = 1;
  if (i < fadeIn) g = i / fadeIn;
  if (i > N - fadeOut) g = Math.min(g, (N - i) / fadeOut);
  buf.L[i] = Math.tanh(buf.L[i] * 0.62) * g;
  buf.R[i] = Math.tanh(buf.R[i] * 0.62) * g;
}
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf.L[i]), Math.abs(buf.R[i]));
const norm = peak > 0 ? 0.94 / peak : 1;
console.log(`  peak=${peak.toFixed(3)} -> normalizado x${norm.toFixed(3)}`);

/* ------------------------------------------------------------ mp3 */
console.log("  codificando mp3...");
const enc = new Mp3Encoder(2, SR, 112);
const CHUNK = 1152 * 128;
const left = new Int16Array(CHUNK);
const right = new Int16Array(CHUNK);
const parts = [];

for (let i = 0; i < N; i += CHUNK) {
  const len = Math.min(CHUNK, N - i);
  for (let j = 0; j < len; j++) {
    left[j] = Math.max(-32768, Math.min(32767, Math.round(buf.L[i + j] * norm * 32767)));
    right[j] = Math.max(-32768, Math.min(32767, Math.round(buf.R[i + j] * norm * 32767)));
  }
  const l = left.subarray(0, len);
  const r = right.subarray(0, len);
  const mp3 = enc.encodeBuffer(l, r);
  if (mp3.length) parts.push(Buffer.from(mp3));
}
const end = enc.flush();
if (end.length) parts.push(Buffer.from(end));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat(parts));
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`ok: ${OUT}  (${kb} KB, ${Math.round(DURATION / 60)}:${String(Math.round(DURATION % 60)).padStart(2, "0")})`);
