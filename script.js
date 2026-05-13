const timerGrid = document.querySelector("[data-timer-grid]");
const cards = Array.from(document.querySelectorAll(".timer-card"));
const wakeStatus = document.querySelector("[data-wake-status]");
const pauseButton = document.querySelector("[data-pause]");
const nextPlayerButton = document.querySelector("[data-next-player]");
const reorderButton = document.querySelector("[data-reorder]");
const endGameButton = document.querySelector("[data-end-game]");
const gameClock = document.querySelector("[data-game-clock]");
const gameClockLabel = document.querySelector("[data-game-clock-label]");
const gameTimeElement = document.querySelector("[data-game-time]");
const summary = document.querySelector("[data-summary]");
const summaryOverview = document.querySelector("[data-summary-overview]");
const summaryGrid = document.querySelector("[data-summary-grid]");
const playerOrderStorageKey = "turn-timers.player-order";

let players = cards.map((card) => {
  const dragHandle = document.createElement("span");
  dragHandle.className = "drag-handle";
  dragHandle.setAttribute("aria-hidden", "true");
  card.prepend(dragHandle);

  return {
    name: card.dataset.player,
    card,
    timeElement: card.querySelector("[data-time]"),
    turnElement: card.querySelector("[data-turn]"),
    elapsedMs: 0,
    turns: [],
  };
});

const playerByCard = new Map(players.map((player) => [player.card, player]));

restoreSavedPlayerOrder();

let activePlayer = players[0];
let lastTick = Date.now();
let gameStartedAt = null;
let gameElapsedMs = 0;
let pauseElapsedMs = 0;
let pauseStartedAt = null;
let currentTurnElapsedMs = 0;
let hasStarted = false;
let wakeLock = null;
let isGameOver = false;
let isPaused = false;
let isReorderMode = false;
let draggedCard = null;
let dragPointerId = null;
let suppressNextClick = false;

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

function getGameElapsedMs(now = Date.now()) {
  if (!hasStarted || !gameStartedAt) {
    return gameElapsedMs;
  }

  if (isGameOver) {
    return gameElapsedMs;
  }

  return now - gameStartedAt;
}

function getPauseElapsedMs(now = Date.now()) {
  if (!isPaused || !pauseStartedAt || isGameOver) {
    return pauseElapsedMs;
  }

  return pauseElapsedMs + now - pauseStartedAt;
}

function render() {
  const now = Date.now();

  if (gameTimeElement) {
    gameTimeElement.textContent = formatTime(getGameElapsedMs(now));
  }

  if (gameClockLabel) {
    gameClockLabel.textContent = isPaused && !isGameOver ? "Game Paused" : "Game Time";
  }

  if (gameClock) {
    gameClock.classList.toggle("paused", isPaused && !isGameOver);
  }

  players.forEach((player) => {
    player.timeElement.textContent = formatTime(player.elapsedMs);
    player.turnElement.textContent = `${player.name}'s turn`;
    player.card.classList.toggle(
      "active",
      hasStarted && !isGameOver && !isPaused && player === activePlayer
    );
    if (isReorderMode) {
      player.card.setAttribute(
        "aria-label",
        `${player.name}. Drag to reorder, or use arrow keys to move.`
      );
    } else {
      player.card.removeAttribute("aria-label");
    }
  });

  if (pauseButton) {
    pauseButton.textContent = isPaused ? "Resume" : "Pause";
    pauseButton.disabled = !hasStarted || isGameOver;
  }

  if (nextPlayerButton) {
    nextPlayerButton.disabled = isGameOver || isReorderMode;
  }

  if (reorderButton) {
    reorderButton.textContent = isReorderMode ? "Done" : "Reorder";
    reorderButton.setAttribute("aria-pressed", String(isReorderMode));
  }

  if (timerGrid) {
    timerGrid.classList.toggle("is-reordering", isReorderMode);
    timerGrid.setAttribute(
      "aria-label",
      isReorderMode ? "Reorder player timers" : "Player timers"
    );
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
  const gameTotal = getGameElapsedMs();
  const pauseTotal = getPauseElapsedMs();
  const activeTotal = Math.max(0, gameTotal - pauseTotal);

  if (summaryOverview) {
    summaryOverview.innerHTML = `
      <article class="summary-total-card">
        <span class="summary-total-label">Game time</span>
        <strong class="summary-total-value">${formatTime(gameTotal)}</strong>
      </article>
      <article class="summary-total-card">
        <span class="summary-total-label">Paused time</span>
        <strong class="summary-total-value">${formatTime(pauseTotal)}</strong>
      </article>
      <article class="summary-total-card">
        <span class="summary-total-label">Active turns</span>
        <strong class="summary-total-value">${formatTime(activeTotal)}</strong>
      </article>
    `;
  }

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

function readSavedPlayerOrder() {
  try {
    const savedOrder = JSON.parse(localStorage.getItem(playerOrderStorageKey));
    return Array.isArray(savedOrder) ? savedOrder : [];
  } catch (error) {
    return [];
  }
}

function savePlayerOrder() {
  try {
    localStorage.setItem(
      playerOrderStorageKey,
      JSON.stringify(players.map((player) => player.name))
    );
  } catch (error) {
    return;
  }
}

function restoreSavedPlayerOrder() {
  if (!timerGrid) {
    return;
  }

  const savedOrder = readSavedPlayerOrder();
  if (!savedOrder.length) {
    return;
  }

  const playersByName = new Map(players.map((player) => [player.name, player]));
  const restoredNames = new Set();
  const reorderedPlayers = [];

  savedOrder.forEach((playerName) => {
    const player = playersByName.get(playerName);

    if (player && !restoredNames.has(player.name)) {
      restoredNames.add(player.name);
      reorderedPlayers.push(player);
    }
  });

  const missingPlayers = players.filter((player) => !restoredNames.has(player.name));

  if (!reorderedPlayers.length) {
    return;
  }

  players = [...reorderedPlayers, ...missingPlayers];
  players.forEach((player) => timerGrid.appendChild(player.card));
}

function syncPlayersToGridOrder() {
  if (!timerGrid) {
    return;
  }

  const orderedPlayers = Array.from(timerGrid.querySelectorAll(".timer-card"))
    .map((card) => playerByCard.get(card))
    .filter(Boolean);

  if (orderedPlayers.length === players.length) {
    players = orderedPlayers;
  }
}

function refreshSummaryIfVisible() {
  if (summary && !summary.classList.contains("hidden")) {
    renderSummary();
  }
}

function setReorderMode(nextMode) {
  isReorderMode = nextMode;

  if (!isReorderMode) {
    finishReorderDrag();
  }

  render();
}

function getTimerCardFromPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return element ? element.closest(".timer-card") : null;
}

function getGridColumnCount() {
  if (!timerGrid) {
    return 1;
  }

  return getComputedStyle(timerGrid)
    .gridTemplateColumns.split(" ")
    .filter(Boolean).length;
}

function placeDraggedCard(clientX, clientY) {
  const targetCard = getTimerCardFromPoint(clientX, clientY);

  if (!timerGrid || !targetCard || targetCard === draggedCard) {
    return;
  }

  const targetRect = targetCard.getBoundingClientRect();
  const shouldInsertBefore =
    getGridColumnCount() === 1
      ? clientY < targetRect.top + targetRect.height / 2
      : clientX < targetRect.left + targetRect.width / 2;
  const referenceCard = shouldInsertBefore ? targetCard : targetCard.nextElementSibling;

  if (referenceCard === draggedCard) {
    return;
  }

  timerGrid.insertBefore(draggedCard, referenceCard);
  syncPlayersToGridOrder();
  render();
}

function handleReorderPointerMove(event) {
  if (!draggedCard || event.pointerId !== dragPointerId) {
    return;
  }

  event.preventDefault();
  placeDraggedCard(event.clientX, event.clientY);
}

function finishReorderDrag(event) {
  if (event && dragPointerId !== null && event.pointerId !== dragPointerId) {
    return;
  }

  if (!draggedCard) {
    return;
  }

  const finishedCard = draggedCard;
  const finishedPointerId = dragPointerId;

  finishedCard.classList.remove("dragging");
  try {
    if (
      finishedPointerId !== null &&
      finishedCard.hasPointerCapture &&
      finishedCard.hasPointerCapture(finishedPointerId)
    ) {
      finishedCard.releasePointerCapture(finishedPointerId);
    }
  } catch (error) {
    // Pointer capture can already be gone if the browser cancelled the drag.
  }

  draggedCard = null;
  dragPointerId = null;

  if (timerGrid) {
    timerGrid.classList.remove("is-dragging");
  }

  document.removeEventListener("pointermove", handleReorderPointerMove);
  document.removeEventListener("pointerup", finishReorderDrag);
  document.removeEventListener("pointercancel", finishReorderDrag);

  syncPlayersToGridOrder();
  savePlayerOrder();
  refreshSummaryIfVisible();
  render();
}

function startReorderDrag(event, player) {
  if (!isReorderMode || event.button > 0) {
    return;
  }

  suppressNextClick = true;
  draggedCard = player.card;
  dragPointerId = event.pointerId;

  draggedCard.classList.add("dragging");
  if (timerGrid) {
    timerGrid.classList.add("is-dragging");
  }

  if (draggedCard.setPointerCapture) {
    draggedCard.setPointerCapture(dragPointerId);
  }

  document.addEventListener("pointermove", handleReorderPointerMove);
  document.addEventListener("pointerup", finishReorderDrag);
  document.addEventListener("pointercancel", finishReorderDrag);
  event.preventDefault();
}

function movePlayerToIndex(player, nextIndex) {
  if (!timerGrid) {
    return;
  }

  const currentIndex = players.indexOf(player);
  const clampedIndex = Math.max(0, Math.min(players.length - 1, nextIndex));

  if (currentIndex === -1 || currentIndex === clampedIndex) {
    return;
  }

  players.splice(currentIndex, 1);
  players.splice(clampedIndex, 0, player);
  players.forEach((orderedPlayer) => timerGrid.appendChild(orderedPlayer.card));
  savePlayerOrder();
  refreshSummaryIfVisible();
  render();
  player.card.focus();
}

function handleReorderKeydown(event, player) {
  if (!isReorderMode) {
    return;
  }

  const currentIndex = players.indexOf(player);
  let nextIndex = currentIndex;

  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = currentIndex - 1;
  } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = currentIndex + 1;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = players.length - 1;
  } else if (event.key === "Escape") {
    event.preventDefault();
    setReorderMode(false);
    if (reorderButton) {
      reorderButton.focus();
    }
    return;
  } else {
    return;
  }

  event.preventDefault();
  movePlayerToIndex(player, nextIndex);
}

async function releaseWakeLock() {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}

function commitActivePlayerTime(now) {
  if (!hasStarted || isGameOver || isPaused) {
    return;
  }

  const elapsed = now - lastTick;
  if (elapsed <= 0) {
    return;
  }

  activePlayer.elapsedMs += elapsed;
  currentTurnElapsedMs += elapsed;
  lastTick = now;
}

function recordCurrentTurn() {
  recordTurn(activePlayer, currentTurnElapsedMs);
  currentTurnElapsedMs = 0;
}

function startPause(now) {
  commitActivePlayerTime(now);
  isPaused = true;
  pauseStartedAt = now;
  lastTick = now;
}

function endPause(now) {
  if (!isPaused) {
    return;
  }

  if (pauseStartedAt) {
    pauseElapsedMs += now - pauseStartedAt;
  }

  pauseStartedAt = null;
  isPaused = false;
  lastTick = now;
}

async function togglePause() {
  if (!hasStarted || isGameOver) {
    return;
  }

  const now = Date.now();

  if (isPaused) {
    endPause(now);
    requestWakeLock();
    setWakeStatus("Timer resumed.");
    render();
    return;
  }

  startPause(now);
  await releaseWakeLock();
  setWakeStatus("Timer paused.");
  render();
}

function setActivePlayer(nextPlayer) {
  if (isGameOver) {
    return;
  }

  if (!hasStarted) {
    const now = Date.now();

    activePlayer = nextPlayer;
    gameStartedAt = now;
    lastTick = now;
    currentTurnElapsedMs = 0;
    hasStarted = true;
    requestWakeLock();
    render();
    return;
  }

  if (nextPlayer === activePlayer) {
    togglePause();
    return;
  }

  const now = Date.now();
  if (isPaused) {
    endPause(now);
    requestWakeLock();
    setWakeStatus("Timer resumed.");
  } else {
    commitActivePlayerTime(now);
  }

  recordCurrentTurn();
  activePlayer = nextPlayer;
  lastTick = now;
  render();
}

function setAdjacentPlayer(direction) {
  if (isGameOver || isReorderMode || !players.length) {
    return;
  }

  if (!hasStarted) {
    setActivePlayer(direction < 0 ? players[players.length - 1] : players[0]);
    return;
  }

  const currentIndex = players.indexOf(activePlayer);
  const nextIndex =
    currentIndex === -1
      ? 0
      : (currentIndex + direction + players.length) % players.length;
  setActivePlayer(players[nextIndex]);
}

function setNextPlayer() {
  setAdjacentPlayer(1);
}

function setPreviousPlayer() {
  setAdjacentPlayer(-1);
}

players.forEach((player) => {
  player.card.addEventListener("click", (event) => {
    if (isReorderMode || suppressNextClick) {
      event.preventDefault();
      suppressNextClick = false;
      return;
    }

    setActivePlayer(player);
  });

  player.card.addEventListener("pointerdown", (event) => {
    startReorderDrag(event, player);
  });

  player.card.addEventListener("keydown", (event) => {
    handleReorderKeydown(event, player);
  });
});

setInterval(() => {
  if (!hasStarted || isGameOver) {
    return;
  }

  const now = Date.now();
  commitActivePlayerTime(now);
  render();
}, 250);

render();

document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    hasStarted &&
    !isGameOver &&
    !isPaused &&
    !wakeLock
  ) {
    requestWakeLock();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.repeat || isReorderMode || isGameOver) {
    return;
  }

  const isPauseShortcut = event.code === "Space";
  const isNextShortcut = event.code === "ArrowRight";
  const isPreviousShortcut = event.code === "ArrowLeft";

  if (!isPauseShortcut && !isNextShortcut && !isPreviousShortcut) {
    return;
  }

  const target = event.target;
  const isControlButton =
    target instanceof HTMLElement &&
    target.closest(".pause-button, .next-button, .reorder-button, .end-game-button");

  if (isPauseShortcut && isControlButton) {
    return;
  }

  if (isPauseShortcut) {
    if (!hasStarted) {
      return;
    }

    event.preventDefault();
    togglePause();
  } else if (isNextShortcut) {
    event.preventDefault();
    setNextPlayer();
  } else if (isPreviousShortcut) {
    event.preventDefault();
    setPreviousPlayer();
  }
});

pauseButton.addEventListener("click", () => {
  togglePause();
});

nextPlayerButton.addEventListener("click", () => {
  setNextPlayer();
});

reorderButton.addEventListener("click", () => {
  setReorderMode(!isReorderMode);
});

endGameButton.addEventListener("click", async () => {
  if (!hasStarted || isGameOver) {
    renderSummary();
    return;
  }

  const now = Date.now();
  if (isPaused) {
    endPause(now);
  } else {
    commitActivePlayerTime(now);
  }

  recordCurrentTurn();
  gameElapsedMs = gameStartedAt ? now - gameStartedAt : 0;
  lastTick = now;
  isGameOver = true;
  isPaused = false;
  render();
  await releaseWakeLock();
  setWakeStatus("Game ended. Recap is shown below.");
  renderSummary();
});
