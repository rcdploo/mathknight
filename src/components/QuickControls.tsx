import { Home, KeyRound, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { updateAudioLevels } from "../battle/battleAudio";
import { loadProgress, setMuted } from "../game/progressStore";
import KnightCodePanel from "./KnightCodePanel";

export default function QuickControls({ destination, onHome }: { destination: string; onHome: () => void }) {
  const [muted, setMutedState] = useState(() => loadProgress().settings.muted);
  const [saveOpen, setSaveOpen] = useState(false);

  function toggleMute() {
    const progress = loadProgress();
    const next = setMuted(progress, !progress.settings.muted);
    setMutedState(next.settings.muted);
    updateAudioLevels();
  }

  return <>
    <nav className="quick-controls" aria-label="Game controls">
      <button className="icon-button" aria-label="Go home" title="Home" onClick={onHome} disabled={destination === "hub"}><Home size={19} /></button>
      <button className="icon-button" aria-label="Save or load a checkpoint" title="Save" onClick={() => setSaveOpen(true)}><KeyRound size={19} /></button>
      <button className="icon-button" aria-label={muted ? "Unmute all sound" : "Mute all sound"} title={muted ? "Unmute all sound" : "Mute all sound"} onClick={toggleMute}>
        {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
      </button>
    </nav>

    {saveOpen && <div className="modal-backdrop quick-save-backdrop">
      <KnightCodePanel variant="modal" destination={destination} onClose={() => setSaveOpen(false)} />
    </div>}
  </>;
}
