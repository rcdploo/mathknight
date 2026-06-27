import { useEffect, useState } from "react";
import { RotateCcw, Settings, ShoppingBag, Swords } from "lucide-react";
import DungeonGame from "./dungeon/DungeonGame";
import RunOverview from "./dungeon/RunOverview";
import { resetAllGameProgress } from "./game/resetGame";
import Quartermaster from "./quartermaster/Quartermaster";
import TrainingGrounds from "./training/TrainingGrounds";
import SettingsScreen from "./settings/SettingsScreen";
import { startAmbientMusic, stopAmbientMusic } from "./battle/battleAudio";

type GameDestination = "hub" | "memory" | "battle" | "quartermaster" | "settings";

export default function App() {
  const [destination, setDestination] = useState<GameDestination>("hub");
  const [inBattle, setInBattle] = useState(false);
  const ambientAllowed = destination !== "battle" || !inBattle;

  useEffect(() => {
    if (!ambientAllowed) {
      stopAmbientMusic();
      return;
    }

    const resumeAmbient = () => startAmbientMusic();
    resumeAmbient();
    window.addEventListener("pointerdown", resumeAmbient);
    window.addEventListener("keydown", resumeAmbient);
    window.addEventListener("focus", resumeAmbient);
    return () => {
      window.removeEventListener("pointerdown", resumeAmbient);
      window.removeEventListener("keydown", resumeAmbient);
      window.removeEventListener("focus", resumeAmbient);
    };
  }, [ambientAllowed]);

  function startNewGame() {
    const confirmed = window.confirm(
      "Start a new game? This will permanently reset the dungeon, deck, coins, and all Training Grounds progress.",
    );
    if (!confirmed) return;
    resetAllGameProgress();
    window.location.reload();
  }

  if (destination === "memory") {
    return <TrainingGrounds onExit={() => setDestination("hub")} onDungeon={() => setDestination("battle")} />;
  }
  if (destination === "battle") {
    return (
      <DungeonGame
        onExit={() => setDestination("hub")}
        onTraining={() => setDestination("memory")}
        onQuartermaster={() => setDestination("quartermaster")}
        onBattleStateChange={setInBattle}
      />
    );
  }
  if (destination === "quartermaster") {
    return <Quartermaster onExit={() => setDestination("hub")} onTraining={() => setDestination("memory")} />;
  }

  return (
    <main className="game-hub">
      <header className="hub-header">
        <div>
          <p>Mathknight</p>
          <h1>Choose Your Path</h1>
        </div>
        <button className="new-game-button" onClick={startNewGame}>
          <RotateCcw size={18} /> New Game
        </button>
      </header>
      <div className="hub-run-overview"><RunOverview /></div>
      <section className="hub-destinations" aria-label="Game destinations">
        <button className="hub-destination battle-destination" onClick={() => setDestination("battle")}>
          <Swords size={30} />
          <span><strong>Dungeon Battle</strong><small>Build expressions. Counter monsters.</small></span>
        </button>
        <button className="hub-destination memory-destination" onClick={() => setDestination("memory")}>
          <span className="hub-grid-icon" aria-hidden="true">2+3</span>
          <span><strong>Training Grounds</strong><small>Match arithmetic pairs. Earn coins.</small></span>
        </button>
        <button className="hub-destination" onClick={() => setDestination("quartermaster")}>
          <ShoppingBag size={30} />
          <span><strong>Quartermaster</strong><small>Spend coins on permanent upgrades.</small></span>
        </button>
        <button className="hub-destination" disabled>
          <Settings size={30} />
          <span><strong>Settings</strong><small>Coming later</small></span>
        </button>
      </section>
    </main>
  );
}
