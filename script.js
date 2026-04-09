const cards = Array.from(document.querySelectorAll(".timer-card"));
const wakeStatus = document.querySelector("[data-wake-status]");
const pauseButton = document.querySelector("[data-pause]");
const endGameButton = document.querySelector("[data-end-game]");
const summary = document.querySelector("[data-summary]");
const summaryGrid = document.querySelector("[data-summary-grid]");

const players = cards.map((card) => ({
  name: card.dataset.player,
  card,
  timeElement: card.querySelector("[data-time]"),
  turnElement: card.querySelector("[data-turn]"),
  elapsedMs: 0,
  turns: [],
}));

let activePlayer = players[0];
let lastTick = Date.now();
let turnStartedAt = null;
let hasStarted = false;
let wakeLock = null;
let isGameOver = false;
let isPaused = false;

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
    player.card.classList.toggle(
      "active",
      hasStarted && !isGameOver && !isPaused && player === activePlayer
    );
  });

  if (pauseButton) {
    pauseButton.textContent = isPaused ? "Resume" : "Pause";
    pauseButton.disabled = !hasStarted || isGameOver;
  }
}

function recordTurn(player, duration) {
  if (duration > 0) {
    player.turns.push(duration);
  }
}

function formatStat(milliseconds) {
  if (!milliseconds) {
    return "No turns";
  }

  return formatTime(milliseconds);
}

function renderSummary() {
  summaryGrid.innerHTML = "";

  players.forEach((player) => {
    const totalTurns = player.turns.length;
    const average = totalTurns
      ? Math.floor(player.turns.reduce((sum, turn) => sum + turn, 0) / totalTurns)
      : 0;
    const quickest = totalTurns ? Math.min(...player.turns) : 0;
    const longest = totalTurns ? Math.max(...player.turns) : 0;

    const card = document.createElement("article");
    card.className = "summary-card";
    card.innerHTML = `
      <h3 class="summary-name">${player.name}</h3>
      <p class="summary-stat">Average turn: ${formatStat(average)}</p>
      <p class="summary-stat">Quickest turn: ${formatStat(quickest)}</p>
      <p class="summary-stat">Longest turn: ${formatStat(longest)}</p>
    `;
    summaryGrid.appendChild(card);
  });

  summary.classList.remove("hidden");
}

async function releaseWakeLock() {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}

function setActivePlayer(nextPlayer) {
  if (isGameOver) {
    return;
  }

  if (!hasStarted) {
    activePlayer = nextPlayer;
    lastTick = Date.now();
    turnStartedAt = lastTick;
    hasStarted = true;
    requestWakeLock();
    render();
    return;
  }

  if (nextPlayer === activePlayer) {
    return;
  }

  const now = Date.now();
  if (!isPaused) {
    recordTurn(activePlayer, now - turnStartedAt);
    activePlayer.elapsedMs += now - lastTick;
  }
  activePlayer = nextPlayer;
  lastTick = now;
  turnStartedAt = now;
  isPaused = false;
  render();
}

cards.forEach((card, index) => {
  card.addEventListener("click", () => {
    setActivePlayer(players[index]);
  });
});

setInterval(() => {
  if (!hasStarted || isGameOver || isPaused) {
    return;
  }

  const now = Date.now();
  activePlayer.elapsedMs += now - lastTick;
  lastTick = now;
  render();
}, 250);

render();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && hasStarted && !isGameOver && !wakeLock) {
    requestWakeLock();
  }
});

pauseButton.addEventListener("click", async () => {
  if (!hasStarted || isGameOver) {
    return;
  }

  if (isPaused) {
    lastTick = Date.now();
    turnStartedAt = lastTick;
    isPaused = false;
    requestWakeLock();
    setWakeStatus("Timer resumed.");
    render();
    return;
  }

  const now = Date.now();
  activePlayer.elapsedMs += now - lastTick;
  lastTick = now;
  isPaused = true;
  await releaseWakeLock();
  setWakeStatus("Timer paused.");
  render();
});

endGameButton.addEventListener("click", async () => {
  if (!hasStarted || isGameOver) {
    renderSummary();
    return;
  }

  const now = Date.now();
  if (!isPaused) {
    activePlayer.elapsedMs += now - lastTick;
    recordTurn(activePlayer, now - turnStartedAt);
  }
  lastTick = now;
  isGameOver = true;
  render();
  await releaseWakeLock();
  setWakeStatus("Game ended. Recap is shown below.");
  renderSummary();
});
