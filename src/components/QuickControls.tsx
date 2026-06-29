import { Home, KeyRound, Volume2, VolumeX, X } from "lucide-react";
import { useState } from "react";
import { updateAudioLevels } from "../battle/battleAudio";
import { exportProgressCode, importProgressCode, loadProgress, setMuted } from "../game/progressStore";

const destinationKey = "mathknight.navigation.destination.v1";

export default function QuickControls({ destination, onHome }: { destination: string; onHome: () => void }) {
  const [muted, setMutedState] = useState(() => loadProgress().settings.muted);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveCode, setSaveCode] = useState("");
  const [message, setMessage] = useState("");

  function toggleMute() {
    const progress = loadProgress();
    const next = setMuted(progress, !progress.settings.muted);
    setMutedState(next.settings.muted);
    updateAudioLevels();
  }

  async function createCheckpoint() {
    window.localStorage.setItem(destinationKey, destination);
    const code = exportProgressCode(loadProgress());
    setSaveCode(code);
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Checkpoint Knight Code copied.");
    } catch {
      setMessage("Checkpoint created. Copy the code from the box below.");
    }
  }

  function loadCheckpoint() {
    if (!window.confirm("Load this Knight Code? Your current local game will be replaced.")) return;
    try {
      importProgressCode(saveCode);
      window.location.reload();
    } catch {
      setMessage("That Knight Code is not valid.");
    }
  }

  return <>
    <nav className="quick-controls" aria-label="Game controls">
      <button className="icon-button" aria-label={muted ? "Unmute all sound" : "Mute all sound"} title={muted ? "Unmute all sound" : "Mute all sound"} onClick={toggleMute}>
        {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
      </button>
      <button className="icon-button" aria-label="Save or load a checkpoint" title="Save or load" onClick={() => { setSaveOpen(true); setMessage(""); }}><KeyRound size={19} /></button>
      <button className="icon-button" aria-label="Go to Game Hall" title="Game Hall" onClick={onHome} disabled={destination === "hub"}><Home size={19} /></button>
    </nav>

    {saveOpen && <div className="modal-backdrop quick-save-backdrop">
      <section className="save-panel" role="dialog" aria-modal="true" aria-labelledby="quick-save-title">
        <div className="save-panel-heading">
          <div><p>Backup & Restore</p><h2 id="quick-save-title">Knight Code Checkpoint</h2></div>
          <button className="icon-button" aria-label="Close save and load" onClick={() => setSaveOpen(false)}><X size={20} /></button>
        </div>
        <p className="save-panel-copy"><strong>Your game autosaves continuously.</strong> Create a Knight Code when you want a manual checkpoint you can return to later. It captures this point in your run, including your current major screen.</p>
        <textarea aria-label="Knight Code" value={saveCode} onChange={(event) => { setSaveCode(event.target.value); setMessage(""); }} placeholder="Create a checkpoint or paste a Knight Code here" spellCheck={false} />
        {message && <div className="save-message" role="status">{message}</div>}
        <div className="save-actions">
          <button onClick={createCheckpoint}>Create & Copy Checkpoint</button>
          <button onClick={loadCheckpoint} disabled={!saveCode.trim()}>Load Checkpoint</button>
        </div>
      </section>
    </div>}
  </>;
}
