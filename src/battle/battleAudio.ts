export type BattleSound = "card" | "hero-hit" | "enemy-hit" | "counter" | "victory" | "defeat";

let context: AudioContext | null = null;
let musicTimer: number | null = null;
let musicEnabled = false;
let musicStarting = false;
let musicScheduledUntil = 0;
const ambientOscillators = new Set<OscillatorNode>();

function audioContext() {
  if (!context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
  }
  return context;
}

function tone(frequency: number, start: number, duration: number, volume: number, type: OscillatorType = "sine", ambient = false) {
  const audio = audioContext();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  if (ambient) {
    ambientOscillators.add(oscillator);
    oscillator.addEventListener("ended", () => ambientOscillators.delete(oscillator), { once: true });
  }
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function playBattleSound(sound: BattleSound) {
  const now = audioContext().currentTime;
  if (sound === "card") {
    tone(310, now, 0.07, 0.025, "triangle");
    tone(420, now + 0.035, 0.06, 0.018, "triangle");
  } else if (sound === "enemy-hit") {
    tone(125, now, 0.16, 0.065, "sawtooth");
    tone(78, now + 0.04, 0.2, 0.04, "square");
  } else if (sound === "hero-hit") {
    tone(90, now, 0.22, 0.055, "sawtooth");
    tone(62, now + 0.08, 0.18, 0.035, "square");
  } else if (sound === "counter") {
    [392, 523, 659, 784].forEach((frequency, index) => tone(frequency, now + index * 0.055, 0.24, 0.035, "triangle"));
  } else if (sound === "victory") {
    [261.63, 329.63, 392, 523.25].forEach((frequency, index) => tone(frequency, now + index * 0.14, 0.55, 0.05, "triangle"));
  } else {
    [196, 164.81, 130.81, 98].forEach((frequency, index) => tone(frequency, now + index * 0.17, 0.6, 0.045, "sawtooth"));
  }
}

function scheduleMusicLoop() {
  if (!musicEnabled || audioContext().state !== "running") return;
  const audio = audioContext();
  const start = audio.currentTime + 0.08;
  const bass = [110, 110, 98, 98, 123.47, 123.47, 82.41, 82.41];
  const melody = [220, 261.63, 293.66, 261.63, 246.94, 293.66, 329.63, 293.66];
  for (let beat = 0; beat < 64; beat += 1) {
    const step = beat % 8;
    if (beat % 2 === 0) tone(bass[step], start + beat * 0.5, 0.42, 0.03, "triangle", true);
    if (beat % 4 === 1) tone(melody[step], start + beat * 0.5, 0.3, 0.022, "sine", true);
  }
  musicScheduledUntil = start + 32;
}

export function startAmbientMusic() {
  musicEnabled = true;
  if (musicStarting) return;
  musicStarting = true;
  const audio = audioContext();
  void audio.resume().then(() => {
    musicStarting = false;
    if (!musicEnabled) return;
    if (musicTimer === null) musicTimer = window.setInterval(scheduleMusicLoop, 32_000);
    if (audio.currentTime >= musicScheduledUntil - 0.1) scheduleMusicLoop();
  }).catch(() => {
    musicStarting = false;
  });
}

export function stopAmbientMusic() {
  musicEnabled = false;
  musicStarting = false;
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
  musicScheduledUntil = 0;
  ambientOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {
      // The oscillator may already have ended.
    }
  });
  ambientOscillators.clear();
}
