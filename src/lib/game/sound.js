// Short synthesised cues. A player standing back from the screen needs to hear a result
// as much as see it.
let audio = null;

export function unlockSound() {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === "suspended") audio.resume();
}

function tone(frequency, startIn, length, { type = "triangle", gain = 0.16, slideTo } = {}) {
  if (!audio) return;
  const at = audio.currentTime + startIn;
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, at + length);
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(envelope).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.02);
}

const CUES = {
  hit: () => {
    tone(660, 0, 0.09);
    tone(990, 0.07, 0.14);
  },
  avoid: () => tone(520, 0, 0.12, { slideTo: 780 }),
  miss: () => tone(240, 0, 0.18, { slideTo: 170 }),
  hurt: () => tone(150, 0, 0.3, { type: "sawtooth", slideTo: 70, gain: 0.2 }),
  tick: () => tone(440, 0, 0.08, { gain: 0.1 }),
  go: () => tone(880, 0, 0.22, { gain: 0.14 }),
  end: () => [523, 659, 784].forEach((frequency, i) => tone(frequency, i * 0.11, 0.2)),
  smash: () => {
    tone(320, 0, 0.09, { type: "square", slideTo: 110, gain: 0.1 });
    tone(1400, 0.01, 0.06, { type: "sawtooth", slideTo: 500, gain: 0.05 });
  },
  chop: () => tone(1500, 0, 0.09, { type: "sawtooth", slideTo: 420, gain: 0.07 }),
  clang: () => [1240, 1870].forEach((frequency) => tone(frequency, 0, 0.16, { type: "square", gain: 0.05 })),
  shot: () => tone(900, 0, 0.1, { type: "square", slideTo: 140, gain: 0.09 }),
  boom: () => tone(120, 0, 0.5, { type: "sawtooth", slideTo: 38, gain: 0.24 }),
  roar: () => tone(95, 0, 0.8, { type: "sawtooth", slideTo: 55, gain: 0.18 }),
};

// A dhol has two voices: the deep dagga on one skin and the sharp tilli on the other. Each letter is a
// half beat: D and d the dagga, T and t the tilli. The 3+3+2 under it is the same cell the charts use.
const DHOL_BARS = ["D.tT.tD.", "D.tT.tDt", "D.tT.tD.", "T.tTdtDD"];
const SOFT_BARS = ["d...t...", "d...t.t."];
const LOOKAHEAD_MS = 130;

function noiseBuffer() {
  const buffer = audio.createBuffer(1, audio.sampleRate * 0.2, audio.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

// A struck skin rings at uneven overtones, which is the difference between a drum and a synth kick.
const SKIN_MODES = [[1, 1], [1.59, 0.5], [2.14, 0.28], [2.65, 0.14]];

function skin(at, { from, to, length, gain, noise = 0, band = 900, q = 1 }) {
  SKIN_MODES.forEach(([ratio, level], index) => {
    const body = audio.createOscillator();
    const envelope = audio.createGain();
    const ring = length / (1 + index * 0.6);
    body.frequency.setValueAtTime(from * ratio, at);
    body.frequency.exponentialRampToValueAtTime(to * ratio, at + length * 0.6);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain * level, at + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + ring);
    body.connect(envelope).connect(audio.destination);
    body.start(at);
    body.stop(at + ring + 0.02);
  });
  if (!noise) return;
  beat.noise ??= noiseBuffer();
  const slap = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const level = audio.createGain();
  slap.buffer = beat.noise;
  filter.type = "bandpass";
  filter.frequency.value = band;
  filter.Q.value = q;
  level.gain.setValueAtTime(noise, at);
  level.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  slap.connect(filter).connect(level).connect(audio.destination);
  slap.start(at);
  slap.stop(at + 0.1);
}

const STROKES = {
  D: (at, scale) => skin(at, { from: 215, to: 118, length: 0.34, gain: 0.3 * scale, noise: 0.3 * scale, band: 700 }),
  d: (at, scale) => skin(at, { from: 185, to: 122, length: 0.22, gain: 0.17 * scale, noise: 0.16 * scale, band: 700 }),
  T: (at, scale) => skin(at, { from: 640, to: 520, length: 0.13, gain: 0.26 * scale, noise: 0.7 * scale, band: 3000, q: 0.9 }),
  t: (at, scale) => skin(at, { from: 590, to: 500, length: 0.09, gain: 0.14 * scale, noise: 0.36 * scale, band: 3400, q: 0.9 }),
};

let beat = null;

// The drum follows game time rather than its own clock: each frame the game says where it is, and only
// the next few strokes are booked. A pause stops it, and a stutter cannot pull it off the chart.
export function startBeat(bpm, { soft = false } = {}) {
  beat = { stepMs: 60000 / bpm / 2, next: 0, bars: soft ? SOFT_BARS : DHOL_BARS, scale: soft ? 0.7 : 1.3, noise: null };
}

export function syncBeat(gameMs) {
  if (!audio || !beat) return;
  const start = audio.currentTime;
  while (beat.next * beat.stepMs < gameMs + LOOKAHEAD_MS) {
    const atMs = beat.next * beat.stepMs;
    const bar = beat.bars[Math.floor(beat.next / 8) % beat.bars.length];
    const stroke = STROKES[bar[beat.next % 8]];
    if (stroke && atMs >= gameMs - 25) stroke(start + Math.max(0, atMs - gameMs) / 1000, beat.scale);
    beat.next += 1;
  }
}

export function stopBeat() {
  beat = null;
}

// A harmonium: three reeds a few cents apart and one an octave down, so the note beats, heard through
// the wooden case, which is a hump around 1 kHz. The slow tremble is the player pumping the bellows.
export function playReed(semitones, { tonic = 261.63, length = 0.8 } = {}) {
  if (!audio) return;
  const at = audio.currentTime;
  const frequency = tonic * 2 ** (semitones / 12);
  const soften = audio.createBiquadFilter();
  const box = audio.createBiquadFilter();
  const envelope = audio.createGain();
  const bellows = audio.createOscillator();
  const pump = audio.createGain();
  soften.type = "lowpass";
  soften.frequency.value = 3200;
  box.type = "peaking";
  box.frequency.value = 1100;
  box.Q.value = 0.8;
  box.gain.value = 7;
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.linearRampToValueAtTime(0.06, at + 0.09);
  envelope.gain.setValueAtTime(0.06, at + length * 0.7);
  envelope.gain.linearRampToValueAtTime(0.0001, at + length);
  bellows.frequency.value = 5.2;
  pump.gain.value = 0.009;
  bellows.connect(pump).connect(envelope.gain);
  soften.connect(box).connect(envelope).connect(audio.destination);
  bellows.start(at);
  bellows.stop(at + length + 0.02);
  for (const [ratio, detune] of [[1, -7], [1, 1], [1, 8], [0.5, 3]]) {
    const reed = audio.createOscillator();
    reed.type = "sawtooth";
    reed.frequency.value = frequency * ratio;
    reed.detune.value = detune;
    reed.connect(soften);
    reed.start(at);
    reed.stop(at + length + 0.02);
  }
}

export function playCue(name) {
  CUES[name]?.();
}
