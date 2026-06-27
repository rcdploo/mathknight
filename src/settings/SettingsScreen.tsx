import { ArrowLeft, LockKeyhole, Music, Shield, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { playBattleSound, updateAudioLevels } from "../battle/battleAudio";
import { difficultyLabel, loadProgress, setAudioSettings } from "../game/progressStore";
import type { PlayerProgress } from "../game/types";

export default function SettingsScreen({ onExit }: { onExit: () => void }) {
  const [progress, setProgress] = useState<PlayerProgress>(loadProgress);

  function update(kind: "musicVolume" | "effectsVolume", value: number) {
    const next = setAudioSettings(progress, { [kind]: value });
    setProgress(next);
    updateAudioLevels();
  }

  const musicVolume = progress.settings.musicVolume;
  const effectsVolume = progress.settings.effectsVolume;

  return <main className="settings-screen">
    <header className="settings-header">
      <button className="map-back-button" onClick={onExit}><ArrowLeft size={18} /> Game Hall</button>
      <div><p>Preferences</p><h1>Settings</h1></div>
    </header>
    <section className="settings-panel" aria-labelledby="audio-settings-title">
      <div className="settings-section-heading">
        <Volume2 size={22} />
        <div><p>Audio</p><h2 id="audio-settings-title">Sound</h2></div>
      </div>

      <AudioControl
        icon={<Music size={23} />}
        label="Background Music"
        description="Music in the Game Hall, Dungeon, and battles."
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
