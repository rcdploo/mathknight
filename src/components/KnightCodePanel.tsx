import { KeyRound, X } from "lucide-react";
import { useState } from "react";
import { exportProgressCode, importProgressCode } from "../game/progressStore";

const destinationKey = "mathknight.navigation.destination.v1";

export default function KnightCodePanel({ variant, destination, onClose }: {
  variant: "settings" | "modal";
  destination?: string;
  onClose?: () => void;
}) {
  const [saveCode, setSaveCode] = useState("");
  const [message, setMessage] = useState("");
  const titleId = variant === "modal" ? "quick-save-title" : "save-settings-title";

  async function createSaveCode() {
    if (destination) window.localStorage.setItem(destinationKey, destination);
    const code = exportProgressCode();
    setSaveCode(code);
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Knight Code copied.");
    } catch {
      setMessage("Knight Code created. Copy it from the box below.");
    }
  }

  function loadSaveCode() {
    if (!window.confirm("Load this Knight Code? Your current local game will be replaced.")) return;
    try {
      importProgressCode(saveCode);
      window.location.reload();
    } catch {
      setMessage("That Knight Code is not valid.");
    }
  }

  const heading = variant === "modal"
    ? <div className="save-panel-heading">
        <div><p>Backup & Restore</p><h2 id={titleId}>Knight Code</h2></div>
        <button className="icon-button" aria-label="Close save and load" onClick={onClose}><X size={20} /></button>
      </div>
    : <div className="settings-section-heading">
        <KeyRound size={22} />
        <div><p>Backup & Restore</p><h2 id={titleId}>Knight Code</h2></div>
      </div>;

  return <section
    className={variant === "modal" ? "save-panel" : "settings-panel save-settings"}
    role={variant === "modal" ? "dialog" : undefined}
    aria-modal={variant === "modal" ? true : undefined}
    aria-labelledby={titleId}
  >
    {heading}
    <p className={variant === "modal" ? "save-panel-copy" : "save-settings-copy"}>
      <strong>Your game autosaves continuously.</strong> Create a Knight Code as a manual checkpoint you can return to later. It contains your complete game, including Training Grounds, difficulty, coins, deck, items, dungeon position, health, shops, and any active battle.
    </p>
    <textarea
      aria-label="Knight Code"
      value={saveCode}
      onChange={(event) => { setSaveCode(event.target.value); setMessage(""); }}
      placeholder="Create a code or paste one here"
      spellCheck={false}
    />
    {message && <div className="save-message" role="status">{message}</div>}
    <div className="save-actions">
      <button onClick={createSaveCode}>Create & Copy Code</button>
      <button onClick={loadSaveCode} disabled={!saveCode.trim()}>Load Code</button>
    </div>
  </section>;
}
