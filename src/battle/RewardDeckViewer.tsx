import { Layers3, X } from "lucide-react";
import { useState } from "react";
import { loadRunBottle, loadRunDeck } from "../quartermaster/quartermasterStore";
import GameCard from "./GameCard";

export default function RewardDeckViewer({ level }: { level: number }) {
  const [open, setOpen] = useState(false);
  const deck = loadRunDeck();
  const bottle = loadRunBottle();

  return <>
    <button className="reward-deck-view-button" onClick={() => setOpen(true)}><Layers3 size={17} /> View Deck <span>{deck.length + 1}</span></button>
    {open && <div className="modal-backdrop">
      <section className="reward-deck-viewer" role="dialog" aria-modal="true" aria-labelledby="reward-deck-title">
        <div className="pile-panel-heading">
          <div><p>Current Run</p><h2 id="reward-deck-title">Your Deck</h2></div>
          <button className="icon-button" aria-label="Close deck" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <div className="reward-deck-content">
          <div className="run-bottled-card"><span>Bottled</span><GameCard card={bottle} bottled preview onClick={() => undefined} level={level} /></div>
          <div className="pile-card-grid">{deck.map((card) => <GameCard card={card} preview onClick={() => undefined} level={level} key={card.id} />)}</div>
        </div>
      </section>
    </div>}
  </>;
}
