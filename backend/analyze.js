import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import NodeID3 from 'node-id3';
import Pitchfinder from 'pitchfinder';

function which(cmd) {
  const SEP = process.platform === 'win32' ? ';' : ':';
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '').split(';') : [''];
  const paths = (process.env.PATH || '').split(SEP);
  for (const p of paths) {
    const fulls = exts.map((e) => path.join(p, cmd + e));
    for (const full of fulls) {
      if (existsSync(full)) return full;
    }
  }
  return null;
}

function decodeToPCMFloat32(inputPath) {
  return new Promise((resolve, reject) => {
    // ffmpeg -i input -ac 1 -ar 44100 -f f32le -
    const ffmpeg = which('ffmpeg');
    if (!ffmpeg) return reject(new Error('FFmpeg no está instalado o no está en PATH.'));

    const args = ['-i', inputPath, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'];
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'inherit'] });

    const chunks = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg salió con código ${code}`));
      const buf = Buffer.concat(chunks);
      // Float32 little-endian
      const floatArray = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
      resolve({ samples: floatArray, sampleRate: 44100 });
    });
  });
}

function lowpass(prev, x, alpha) {
  return prev + alpha * (x - prev);
}

function computeBPM(samples, sampleRate) {
  // Build amplitude envelope at lower rate (200 Hz) for efficiency
  const targetRate = 200;
  const hop = Math.max(1, Math.floor(sampleRate / targetRate));
  const env = [];
  let lp = 0;
  const alpha = 0.2; // smoothing
  for (let i = 0; i < samples.length; i += hop) {
    const v = Math.abs(samples[i]);
    lp = lowpass(lp, v, alpha);
    env.push(lp);
  }
  // Normalize
  const max = env.reduce((m, v) => (v > m ? v : m), 1e-6);
  for (let i = 0; i < env.length; i++) env[i] /= max;

  // Autocorrelation over BPM range 60-200
  const minBPM = 60, maxBPM = 200;
  const minLag = Math.floor((60 / maxBPM) * targetRate);
  const maxLag = Math.floor((60 / minBPM) * targetRate);
  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < env.length; i++) {
      sum += env[i] * env[i + lag];
    }
    if (sum > bestScore) { bestScore = sum; bestLag = lag; }
  }
  if (bestLag <= 0) return null;
  let bpm = Math.round((60 * targetRate) / bestLag);
  // Adjust to common tempo range by halving/doubling heuristics
  while (bpm > 190) bpm /= 2;
  while (bpm < 70) bpm *= 2;
  return Math.round(bpm);
}

function estimateKeyFromPitches(samples, sampleRate) {
  // Take pitch every 2048 samples hop (~46ms @44.1k)
  const detectPitch = Pitchfinder.YIN({ sampleRate });
  const hop = 2048;
  const pitches = [];
  for (let i = 0; i + hop < samples.length; i += hop) {
    const frame = samples.subarray(i, i + hop);
    const freq = detectPitch(frame);
    if (freq && isFinite(freq) && freq > 20) pitches.push(freq);
  }
  if (!pitches.length) return { key: null, scale: null, confidence: 0 };

  const A4 = 440;
  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const counts = new Array(12).fill(0);
  for (const f of pitches) {
    const n = Math.round(12 * Math.log2(f / A4)) + 69; // MIDI
    const pc = ((n % 12) + 12) % 12;
    counts[pc] += 1;
  }
  let maxIdx = 0; let max = -1;
  counts.forEach((c, i) => { if (c > max) { max = c; maxIdx = i; } });
  const key = noteNames[maxIdx];
  // Very naive: choose major by default; refine later
  return { key, scale: 'major', confidence: max / pitches.length };
}

export async function analyzeAudio(filePath) {
  const { samples, sampleRate } = await decodeToPCMFloat32(filePath);
  const bpm = computeBPM(samples, sampleRate);
  const keyInfo = estimateKeyFromPitches(samples, sampleRate);
  const musicalKey = keyInfo.key ? `${keyInfo.key} ${keyInfo.scale}` : null;
  return { bpm, key: musicalKey, confidence: keyInfo.confidence };
}

export async function writeTags(filePath, { bpm, key }) {
  const tags = {};
  if (bpm) tags.TBPM = String(bpm);
  if (key) tags.TKEY = String(key);
  const success = NodeID3.update(tags, filePath);
  if (!success) throw new Error('No se pudieron escribir los metadatos.');
  return true;
}
