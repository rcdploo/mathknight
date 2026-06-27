import { loadProgress } from "../game/progressStore";
export type BattleSound = "card" | "hero-hit" | "enemy-hit" | "counter" | "victory" | "defeat";

let context: AudioContext | null = null;
let musicTimer: number | null = null;
let musicEnabled = false;
let musicStarting = false;
let musicScheduledUntil = 0;
const ambientOscillators = new Set<OscillatorNode>();
export type CombatMusicIntensity = "standard" | "epic";
let combatTimer: number | null = null;
let combatEnabled = false;
let combatStarting = false;
let combatScheduledUntil = 0;
let combatIntensity: CombatMusicIntensity = "standard";
const combatOscillators = new Set<OscillatorNode>();
type AudioGroup = "ambient" | "combat" | "effects";
const masterGains: Partial<Record<AudioGroup, GainNode>> = {};

function audioContext() {
  if (!context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
  }
  return context;
}

function volumeFor(group: AudioGroup) {
  const settings = loadProgress().settings;
  return group === "effects" ? settings.effectsVolume : settings.musicVolume;
}

function outputFor(group: AudioGroup) {
  const audio = audioContext();
  if (!masterGains[group]) {
    const gain = audio.createGain();
    gain.gain.value = volumeFor(group);
    gain.connect(audio.destination);
    masterGains[group] = gain;
  }
  return masterGains[group]!;
}

export function updateAudioLevels() {
  (Object.keys(masterGains) as AudioGroup[]).forEach((group) => {
    const gain = masterGains[group];
    if (gain) gain.gain.setValueAtTime(volumeFor(group), audioContext().currentTime);
  });
}

function tone(frequency: number, start: number, duration: number, volume: number, type: OscillatorType = "sine", group?: "ambient" | "combat") {
  const audio = audioContext();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(outputFor(group ?? "effects"));
  const trackedOscillators = group === "ambient" ? ambientOscillators : group === "combat" ? combatOscillators : null;
  if (trackedOscillators) {
    trackedOscillators.add(oscillator);
    oscillator.addEventListener("ended", () => trackedOscillators.delete(oscillator), { once: true });
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
    if (beat % 2 === 0) tone(bass[step], start + beat * 0.5, 0.42, 0.04, "triangle", "ambient");
    if (beat % 4 === 1) tone(melody[step], start + beat * 0.5, 0.3, 0.03, "sine", "ambient");
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

function scheduleStandardCombatLoop() {
  if (!combatEnabled || audioContext().state !== "running") return;
  const audio = audioContext();
  const start = audio.currentTime + 0.06;
  const stepLength = 0.3;
  const bass = [110, 110, 130.81, 110, 98, 98, 130.81, 146.83];
  const lead = [440, 523.25, 587.33, 523.25, 392, 440, 523.25, 659.25];
  for (let step = 0; step < 32; step += 1) {
    const index = step % 8;
    const at = start + step * stepLength;
    tone(bass[index], at, 0.2, 0.035, "sawtooth", "combat");
    if (step % 2 === 0) tone(lead[index], at + 0.025, 0.13, 0.022, "square", "combat");
    if (step % 4 === 0) tone(65.41, at, 0.14, 0.05, "triangle", "combat");
    if (step % 4 === 2) tone(196, at, 0.055, 0.018, "square", "combat");
  }
  combatScheduledUntil = start + 32 * stepLength;
}

function scheduleEpicCombatLoop() {
  if (!combatEnabled || audioContext().state !== "running") return;
  const audio = audioContext();
  const start = audio.currentTime + 0.06;
  const stepLength = 0.1875;
  const bass = [82.41, 82.41, 98, 110, 73.42, 73.42, 98, 123.47];
  const brass = [329.63, 392, 493.88, 440, 293.66, 369.99, 440, 554.37];
  for (let step = 0; step < 32; step += 1) {
    const index = step % 8;
    const at = start + step * stepLength;
    tone(bass[index], at, 0.17, 0.045, "sawtooth", "combat");
    tone(bass[index] * 2, at, 0.12, 0.018, "square", "combat");
    if (step % 2 === 0) {
      tone(brass[index], at + 0.02, 0.24, 0.032, "triangle", "combat");
      tone(brass[index] * 1.5, at + 0.025, 0.18, 0.014, "sine", "combat");
    }
    if (step % 4 === 0) tone(55, at, 0.16, 0.075, "triangle", "combat");
    if (step % 4 === 2) tone(220, at, 0.045, 0.028, "square", "combat");
  }
  combatScheduledUntil = start + 32 * stepLength;
}

function scheduleCombatLoop() {
  if (combatIntensity === "epic") scheduleEpicCombatLoop();
  else scheduleStandardCombatLoop();
}

export function startCombatMusic(intensity: CombatMusicIntensity) {
  if (combatIntensity !== intensity) stopCombatMusic();
  combatIntensity = intensity;
  combatEnabled = true;
  if (combatStarting) return;
  combatStarting = true;
  const audio = audioContext();
  void audio.resume().then(() => {
    combatStarting = false;
    if (!combatEnabled) return;
    const loopMilliseconds = combatIntensity === "epic" ? 6_000 : 9_600;
    if (combatTimer === null) combatTimer = window.setInterval(scheduleCombatLoop, loopMilliseconds);
    if (audio.currentTime >= combatScheduledUntil - 0.1) scheduleCombatLoop();
  }).catch(() => {
    combatStarting = false;
  });
}

export function stopCombatMusic() {
  combatEnabled = false;
  combatStarting = false;
  if (combatTimer !== null) window.clearInterval(combatTimer);
  combatTimer = null;
  combatScheduledUntil = 0;
  combatOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {
      // The oscillator may already have ended.
    }
  });
  combatOscillators.clear();
}
