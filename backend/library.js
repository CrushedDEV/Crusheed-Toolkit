import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import NodeID3 from 'node-id3';

const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg']);

const NOTE_INDEX = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};
const INDEX_TO_NOTE_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function parseKey(str) {
  if (!str) return null;
  const s = String(str).trim();
  // Accept formats: "C#m", "G minor", "A maj", "8A", "8B"
  const camelot = s.match(/^(\d{1,2})([AB])$/i);
  if (camelot) {
    const num = parseInt(camelot[1], 10);
    const mode = camelot[2].toUpperCase();
    return camelotToMusical(num, mode);
  }
  const m1 = s.match(/^([A-G](?:#|b)?)[\s-]*(maj|major|dur|ionian|mixolydian|lydian)?$/i);
  const m2 = s.match(/^([A-G](?:#|b)?)[\s-]*(min|minor|m|aeolian|dorian|phrygian|locrian)$/i);
  const m3 = s.match(/^([A-G](?:#|b)?)[\s-]*(major|minor)$/i);
  if (m1) return { note: normNote(m1[1]), mode: 'major' };
  if (m2) return { note: normNote(m2[1]), mode: 'minor' };
  if (m3) return { note: normNote(m3[1]), mode: m3[2].toLowerCase() };
  // Fallback try compact: C#, Cm, Am
  const compact = s.match(/^([A-G](?:#|b)?)(m)?$/i);
  if (compact) return { note: normNote(compact[1]), mode: compact[2] ? 'minor' : 'major' };
  return null;
}

function normNote(n) {
  const up = n.toUpperCase();
  if (NOTE_INDEX[up] == null) return null;
  // normalize to sharps
  const idx = NOTE_INDEX[up];
  return INDEX_TO_NOTE_SHARP[idx];
}

function musicalToCamelot(note, mode) {
  if (!note || !mode) return null;
  const idx = NOTE_INDEX[note];
  if (idx == null) return null;
  // From common table (sharps)
  const MAJOR_TO_CAMELOT = {
    'C': '8B','G':'9B','D':'10B','A':'11B','E':'12B','B':'1B','F#':'2B','C#':'3B','G#':'4B','D#':'5B','A#':'6B','F':'7B'
  };
  const MINOR_TO_CAMELOT = {
    'A': '8A','E':'9A','B':'10A','F#':'11A','C#':'12A','G#':'1A','D#':'2A','A#':'3A','F':'4A','C':'5A','G':'6A','D':'7A'
  };
  const key = mode === 'minor' ? MINOR_TO_CAMELOT[note] : MAJOR_TO_CAMELOT[note];
  return key || null;
}

function camelotToMusical(number, letter) {
  // Reverse of above maps
  const CAMELOT_TO_MAJOR = {
    8:'C',9:'G',10:'D',11:'A',12:'E',1:'B',2:'F#',3:'C#',4:'G#',5:'D#',6:'A#',7:'F'
  };
  const CAMELOT_TO_MINOR = {
    8:'A',9:'E',10:'B',11:'F#',12:'C#',1:'G#',2:'D#',3:'A#',4:'F',5:'C',6:'G',7:'D'
  };
  const num = ((number - 1) % 12) + 1;
  if (letter.toUpperCase() === 'B') return { note: CAMELOT_TO_MAJOR[num], mode: 'major' };
  return { note: CAMELOT_TO_MINOR[num], mode: 'minor' };
}

function normalizeTags(tags) {
  const bpmRaw = tags.TBPM || tags.bpm || tags.BPM || tags.tbpm;
  const keyRaw = tags.TKEY || tags.initialKey || tags.key || tags.tkey;
  const bpm = bpmRaw ? Number(String(bpmRaw).replace(/,/, '.')) : null;
  const musical = parseKey(keyRaw || '');
  const note = musical?.note || null;
  const mode = musical?.mode || null;
  const camelot = note && mode ? musicalToCamelot(note, mode) : null;
  return { bpm: bpm || null, key: keyRaw || (note && mode ? `${note} ${mode}` : null), camelot };
}

async function listAudioFiles(rootDir) {
  const out = [];
  async function walk(dir) {
    let items;
    try { items = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const p = path.join(dir, it.name);
      if (it.isDirectory()) { await walk(p); continue; }
      const ext = path.extname(it.name).toLowerCase();
      if (AUDIO_EXTS.has(ext)) out.push(p);
    }
  }
  await walk(rootDir);
  return out;
}

export async function scanLibrary(folder) {
  const files = await listAudioFiles(folder);
  const tracks = [];
  for (const f of files) {
    try {
      const tags = NodeID3.read(f) || {};
      const norm = normalizeTags(tags);
      tracks.push({ file: f, title: tags.title || path.basename(f), artist: tags.artist || '', bpm: norm.bpm, key: norm.key, camelot: norm.camelot });
    } catch {
      tracks.push({ file: f, title: path.basename(f), artist: '', bpm: null, key: null, camelot: null });
    }
  }
  return tracks;
}

function camelotNeighbors(cKey) {
  if (!cKey) return [];
  const m = cKey.match(/^(\d{1,2})([AB])$/);
  if (!m) return [];
  const num = parseInt(m[1], 10);
  const letter = m[2];
  const prev = num === 1 ? 12 : num - 1;
  const next = num === 12 ? 1 : num + 1;
  return [ `${num}${letter}`, `${prev}${letter}`, `${next}${letter}`, `${num}${letter === 'A' ? 'B' : 'A'}` ];
}

export function recommendTracks(tracks, referenceFile, bpmTolerance=3) {
  const ref = tracks.find(t => t.file === referenceFile);
  if (!ref || !ref.camelot || !ref.bpm) return [];
  const allowed = new Set(camelotNeighbors(ref.camelot));
  const out = [];
  for (const t of tracks) {
    if (t.file === ref.file) continue;
    if (!t.camelot || !t.bpm) continue;
    if (!allowed.has(t.camelot)) continue;
    if (Math.abs(t.bpm - ref.bpm) > bpmTolerance) continue;
    out.push(t);
  }
  // sort by closeness in bpm
  out.sort((a,b) => Math.abs(a.bpm - ref.bpm) - Math.abs(b.bpm - ref.bpm));
  return out;
}
