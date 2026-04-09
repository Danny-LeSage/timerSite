const cards = Array.from(document.querySelectorAll(".timer-card"));

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
