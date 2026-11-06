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
};

export function playCue(name) {
  CUES[name]?.();
}
