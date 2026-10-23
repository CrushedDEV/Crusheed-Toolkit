import { spawn } from 'node:child_process';
import NodeID3 from 'node-id3';
import { getFfmpegPath } from './binaries.js';
import { musicalToCamelot } from './library.js';

function decodeToPCMFloat32(inputPath) {
  return new Promise((resolve, reject) => {
    // ffmpeg -i input -ac 1 -ar 44100 -f f32le -
    const ffmpeg = getFfmpegPath();
    if (!ffmpeg) return reject(new Error('FFmpeg no está disponible.'));

    const args = ['-v', 'error', '-i', inputPath, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'];
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    const chunks = [];
    let errTail = '';
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-1000); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        const notFound = /No such file|cannot find/i.test(errTail);
        return reject(new Error(notFound ? 'No se encontró el archivo.' : `No se pudo decodificar el audio: ${errTail.trim().split(/\r?\n/).pop() || code}`));
      }
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

// In-place iterative radix-2 FFT (re/im are Float64Array of length 2^n)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

// Krumhansl-Kessler key profiles (index 0 = tonic)
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

// Chromagram (energy per pitch class over the whole track) matched against major/minor profiles
function estimateKey(samples, sampleRate) {
  const N = 8192;
  const hop = 8192;
  const window = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  // Pre-compute pitch class of each FFT bin in the 55 Hz - 5 kHz range
  const binPc = new Int8Array(N / 2).fill(-1);
  for (let k = 1; k < N / 2; k++) {
    const f = k * sampleRate / N;
    if (f < 55 || f > 5000) continue;
    binPc[k] = ((Math.round(12 * Math.log2(f / 440)) + 69) % 12 + 12) % 12;
  }
  const chroma = new Float64Array(12);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let start = 0; start + N <= samples.length; start += hop) {
    for (let i = 0; i < N; i++) { re[i] = samples[start + i] * window[i]; im[i] = 0; }
    fft(re, im);
    const frame = new Float64Array(12);
    let total = 0;
    for (let k = 1; k < N / 2; k++) {
      const pc = binPc[k];
      if (pc < 0) continue;
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      frame[pc] += mag; total += mag;
    }
    // Normalise each frame so loud passages don't dominate the whole-track profile
    if (total > 1e-6) for (let i = 0; i < 12; i++) chroma[i] += frame[i] / total;
  }
  if (!chroma.some(v => v > 0)) return { key: null, mode: null, confidence: 0 };

  const scores = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = Array.from({ length: 12 }, (_, i) => chroma[(i + tonic) % 12]);
    scores.push({ tonic, mode: 'major', r: pearson(rotated, MAJOR_PROFILE) });
    scores.push({ tonic, mode: 'minor', r: pearson(rotated, MINOR_PROFILE) });
  }
  scores.sort((a, b) => b.r - a.r);
  const best = scores[0];
  // Confidence: correlation of the winner, penalised when the runner-up is close
  const margin = best.r - scores[1].r;
  const confidence = Math.max(0, Math.min(1, best.r * 0.7 + margin * 3));
  return { key: NOTE_NAMES[best.tonic], mode: best.mode, confidence };
}

export async function analyzeAudio(filePath) {
  const { samples, sampleRate } = await decodeToPCMFloat32(filePath);
  const bpm = computeBPM(samples, sampleRate);
  const k = estimateKey(samples, sampleRate);
  const musicalKey = k.key ? `${k.key} ${k.mode}` : null;
  return { bpm, key: musicalKey, camelot: k.key ? musicalToCamelot(k.key, k.mode) : null, confidence: k.confidence };
}

export async function writeTags(filePath, { bpm, key }) {
  const tags = {};
  if (bpm) tags.TBPM = String(bpm);
  if (key) tags.TKEY = String(key);
  const success = NodeID3.update(tags, filePath);
  if (!success) throw new Error('No se pudieron escribir los metadatos.');
  return true;
}
