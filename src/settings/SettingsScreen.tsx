import { BookOpen, Gauge, LockKeyhole, Music, Shield, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { playBattleSound, updateAudioLevels } from "../battle/battleAudio";
import { difficultyLabel, loadProgress, setAudioSettings, setTrainingSpeed } from "../game/progressStore";
import type { PlayerProgress, TrainingSpeed } from "../game/types";
import { InstructionsLibrary } from "../instructions/Instructions";
import KnightCodePanel from "../components/KnightCodePanel";

export default function SettingsScreen({ onExit: _onExit }: { onExit: () => void }) {
  const [progress, setProgress] = useState<PlayerProgress>(loadProgress);

  function update(kind: "musicVolume" | "effectsVolume", value: number) {
    const next = setAudioSettings(progress, { [kind]: value });
    setProgress(next);
    updateAudioLevels();
  }

  const musicVolume = progress.settings.musicVolume;
  const effectsVolume = progress.settings.effectsVolume;
  const speedOptions: TrainingSpeed[] = ["slowest", "slow", "varies", "fast", "fastest"];
  const speedLabels = ["Slowest", "Slow", "Varies by Difficulty", "Fast", "Fastest"];
  const speedIndex = speedOptions.indexOf(progress.settings.trainingSpeed);

  return <main className="settings-screen">
    <header className="settings-header">
      <div><p>Mathknight</p><h1>Settings</h1></div>
    </header>
    <section className="settings-panel" aria-labelledby="audio-settings-title">
      <div className="settings-section-heading">
        <Volume2 size={22} />
        <div><p>Audio</p><h2 id="audio-settings-title">Sound</h2></div>
      </div>

      <AudioControl
        icon={<Music size={23} />}
        label="Background Music"
        description="Music on Home, in the Dungeon, and during battles."
        value={musicVolume}
        onChange={(value) => update("musicVolume", value)}
      />
      <AudioControl
        icon={<Volume2 size={23} />}
        label="Effects"
        description="Cards, matches, attacks, counters, and victory sounds."
        value={effectsVolume}
        onChange={(value) => update("effectsVolume", value)}
        onTest={() => playBattleSound("card")}
      />
    </section>
    <section className="settings-panel training-speed-settings" aria-labelledby="training-speed-title">
      <div className="settings-section-heading">
        <Gauge size={22} />
        <div><p>Training Grounds</p><h2 id="training-speed-title">Card Reveal Speed</h2></div>
      </div>
      <p className="training-speed-copy">Controls how long unmatched cards remain visible.</p>
      <div className="training-speed-control">
        <input aria-label="Training Grounds card reveal speed" type="range" min="0" max="4" step="1" value={speedIndex}
          onChange={(event) => setProgress(setTrainingSpeed(progress, speedOptions[Number(event.target.value)]))} />
        <output>{speedLabels[speedIndex]}</output>
        <div className="training-speed-labels" aria-hidden="true">
          {speedLabels.map((label) => <span key={label}>{label}</span>)}
        </div>
      </div>
    </section>
    <section className="settings-panel difficulty-settings" aria-labelledby="difficulty-settings-title">
      <div className="settings-section-heading">
        <Shield size={22} />
        <div><p>Current Run</p><h2 id="difficulty-settings-title">Difficulty</h2></div>
      </div>
      <div className="difficulty-setting-row">
        <div><strong>{difficultyLabel(progress.run.difficulty)}</strong><small>Difficulty is locked for the duration of this run.</small></div>
        <LockKeyhole size={20} />
      </div>
      <p className="difficulty-unlock-note">
        {progress.run.normalCompleted
          ? "Elite and Impossible are unlocked. Choose a difficulty when starting a New Game."
          : "Elite and Impossible difficulties unlock together after defeating the game on Normal."}
      </p>
    </section>
    <KnightCodePanel variant="settings" />
    <section className="settings-panel instructions-settings" aria-labelledby="instructions-settings-title">
      <div className="settings-section-heading">
        <BookOpen size={22} />
        <div><p>How to Play</p><h2 id="instructions-settings-title">Instructions</h2></div>
      </div>
      <p className="settings-instructions-copy">Open any guide to review its rules and controls.</p>
      <InstructionsLibrary />
    </section>
  </main>;
}

function AudioControl({ icon, label, description, value, onChange, onTest }: {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  onTest?: () => void;
}) {
  const percent = Math.round(value * 100);
  return <div className="audio-setting-row">
    <div className="audio-setting-icon">{value === 0 ? <VolumeX size={23} /> : icon}</div>
    <div className="audio-setting-copy"><strong>{label}</strong><small>{description}</small></div>
    <div className="audio-setting-controls">
      <button className="audio-mute-button" aria-label={`${value === 0 ? "Unmute" : "Mute"} ${label}`} onClick={() => onChange(value === 0 ? .7 : 0)}>
        {value === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <input aria-label={`${label} volume`} type="range" min="0" max="100" step="5" value={percent} onChange={(event) => onChange(Number(event.target.value) / 100)} />
      <output>{percent}%</output>
      {onTest && <button className="audio-test-button" onClick={onTest} disabled={value === 0}>Test</button>}
    </div>
  </div>;
}
