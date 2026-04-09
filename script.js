const cards = Array.from(document.querySelectorAll(".timer-card"));
const wakeStatus = document.querySelector("[data-wake-status]");

const players = cards.map((card) => ({
  name: card.dataset.player,
  card,
  timeElement: card.querySelector("[data-time]"),
  turnElement: card.querySelector("[data-turn]"),
  elapsedMs: 0,
}));

let activePlayer = players[0];
let lastTick = Date.now();
let hasStarted = false;
let wakeLock = null;

function setWakeStatus(message) {
  if (wakeStatus) {
    wakeStatus.textContent = message;
  }
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    setWakeStatus("Keep awake is not supported in this browser.");
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    setWakeStatus("Keep awake is on while this page stays open.");

    wakeLock.addEventListener("release", () => {
      wakeLock = null;
      setWakeStatus("Keep awake was released. Tap any player to turn it back on.");
    });
  } catch (error) {
    setWakeStatus("Keep awake could not be enabled. Your browser may require another tap.");
  }
}

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function render() {
  players.forEach((player) => {
    player.timeElement.textContent = formatTime(player.elapsedMs);
    player.turnElement.textContent = `${player.name}'s turn`;
    player.card.classList.toggle("active", hasStarted && player === activePlayer);
  });
}

function setActivePlayer(nextPlayer) {
  if (!hasStarted) {
    activePlayer = nextPlayer;
    lastTick = Date.now();
    hasStarted = true;
    requestWakeLock();
    render();
    return;
  }

  if (nextPlayer === activePlayer) {
    return;
  }

  const now = Date.now();
  activePlayer.elapsedMs += now - lastTick;
  activePlayer = nextPlayer;
  lastTick = now;
  render();
}

cards.forEach((card, index) => {
  card.addEventListener("click", () => {
    setActivePlayer(players[index]);
  });
});

setInterval(() => {
  if (!hasStarted) {
    return;
  }

  const now = Date.now();
  activePlayer.elapsedMs += now - lastTick;
  lastTick = now;
  render();
}, 250);

render();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && hasStarted && !wakeLock) {
    requestWakeLock();
  }
});
