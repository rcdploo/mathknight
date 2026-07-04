import { Grid3X3, Home, KeyRound, Settings, ShoppingBag, Swords, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { updateAudioLevels } from "../battle/battleAudio";
import { loadProgress, setMuted } from "../game/progressStore";
import KnightCodePanel from "./KnightCodePanel";

type Destination = "hub" | "memory" | "battle" | "quartermaster" | "settings";

export default function QuickControls({ destination, onNavigate }: { destination: Destination; onNavigate: (destination: Destination) => void }) {
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
      <div className="quick-navigation">
        <button className="icon-button" aria-label="Home" title="Home" onClick={() => onNavigate("hub")} disabled={destination === "hub"}><Home size={19} /></button>
        <button className="icon-button" aria-label="Training Grounds" title="Training Grounds" onClick={() => onNavigate("memory")} disabled={destination === "memory"}><Grid3X3 size={19} /></button>
        <button className="icon-button" aria-label="Dungeon" title="Dungeon" onClick={() => onNavigate("battle")} disabled={destination === "battle"}><Swords size={19} /></button>
        <button className="icon-button" aria-label="Quartermaster" title="Quartermaster" onClick={() => onNavigate("quartermaster")} disabled={destination === "quartermaster"}><ShoppingBag size={19} /></button>
        <button className="icon-button" aria-label="Settings" title="Settings" onClick={() => onNavigate("settings")} disabled={destination === "settings"}><Settings size={19} /></button>
      </div>
      <div className="quick-utilities">
        <button className="icon-button" aria-label="Save or load a checkpoint" title="Save" onClick={() => setSaveOpen(true)}><KeyRound size={19} /></button>
        <button className="icon-button" aria-label={muted ? "Unmute all sound" : "Mute all sound"} title={muted ? "Unmute all sound" : "Mute all sound"} onClick={toggleMute}>
          {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
        </button>
      </div>
    </nav>

    {saveOpen && <div className="modal-backdrop quick-save-backdrop">
      <KnightCodePanel variant="modal" destination={destination} onClose={() => setSaveOpen(false)} />
    </div>}
  </>;
}
