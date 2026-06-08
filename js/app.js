// UI wiring: editor interactions, run/animate orchestration for comparing
// all four algorithms side by side. Mirrors maze_game/app.py's
// _render_editor / _compare_mode, but with a real drag-to-paint canvas editor
// and live requestAnimationFrame animation in place of Streamlit's
// button-grid + static-image redraw loop.

const DEFAULT_SIZE = 15;
const TOOLS = { WALL: Cell.WALL, FLOOR: Cell.FLOOR, START: Cell.START, EXIT: Cell.EXIT, MUD: Cell.MUD };

const state = {
  maze: Maze.empty(DEFAULT_SIZE, DEFAULT_SIZE),
  tool: "WALL",
  painting: false,
  lastPaintedKey: null,
  compareAnim: null,
  compareResults: null,
};

// ---------------------------------------------------------------------------
// Maze editor
// ---------------------------------------------------------------------------

const mazeCanvas = document.getElementById("maze-canvas");
const mazeCtx = mazeCanvas.getContext("2d");
let editorCellSize = 0;

function redrawEditor() {
  editorCellSize = fitCanvas(mazeCanvas, state.maze.rows, state.maze.cols);
  drawMaze(mazeCtx, state.maze, editorCellSize);
}

function cellFromPointer(canvas, cellSize, evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (evt.clientX - rect.left) * scaleX;
  const y = (evt.clientY - rect.top) * scaleY;
  const c = Math.floor(x / cellSize);
  const r = Math.floor(y / cellSize);
  if (r < 0 || r >= state.maze.rows || c < 0 || c >= state.maze.cols) return null;
  return [r, c];
}

function paintCell(r, c) {
  const grid = state.maze.grid;
  const newCell = TOOLS[state.tool];

  // Enforce "exactly one start" by clearing any previous start when a new one is painted.
  if (newCell === Cell.START) {
    for (let rr = 0; rr < state.maze.rows; rr++) {
      for (let cc = 0; cc < state.maze.cols; cc++) {
        if (grid[rr][cc] === Cell.START) grid[rr][cc] = Cell.FLOOR;
      }
    }
  }
  grid[r][c] = newCell;
}

function paintAtEvent(evt) {
  const cell = cellFromPointer(mazeCanvas, editorCellSize, evt);
  if (!cell) return;
  const key = `${cell[0]},${cell[1]}`;
  if (key === state.lastPaintedKey) return;
  state.lastPaintedKey = key;
  paintCell(cell[0], cell[1]);
  redrawEditor();
  updateValidation();
}

mazeCanvas.addEventListener("mousedown", (evt) => {
  state.painting = true;
  state.lastPaintedKey = null;
  paintAtEvent(evt);
});
window.addEventListener("mousemove", (evt) => {
  if (state.painting) paintAtEvent(evt);
});
window.addEventListener("mouseup", () => {
  state.painting = false;
  state.lastPaintedKey = null;
});
mazeCanvas.addEventListener("mouseleave", () => { state.lastPaintedKey = null; });

// Touch support (drag-to-paint on mobile/tablets).
mazeCanvas.addEventListener("touchstart", (evt) => {
  evt.preventDefault();
  state.painting = true;
  state.lastPaintedKey = null;
  paintAtEvent(evt.touches[0]);
}, { passive: false });
mazeCanvas.addEventListener("touchmove", (evt) => {
  evt.preventDefault();
  if (state.painting) paintAtEvent(evt.touches[0]);
}, { passive: false });
window.addEventListener("touchend", () => {
  state.painting = false;
  state.lastPaintedKey = null;
});

// Tool palette
const toolGroup = document.getElementById("tool-group");
toolGroup.addEventListener("click", (evt) => {
  const btn = evt.target.closest(".tool-btn");
  if (!btn) return;
  toolGroup.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.tool = btn.dataset.tool;
});

// Size slider
const sizeSlider = document.getElementById("size-slider");
const sizeLabel = document.getElementById("size-label");
const sizeLabel2 = document.getElementById("size-label-2");
sizeSlider.addEventListener("input", () => {
  const size = parseInt(sizeSlider.value, 10);
  sizeLabel.textContent = size;
  sizeLabel2.textContent = size;
  resizeMaze(size, size);
});

function resizeMaze(rows, cols) {
  const old = state.maze.grid;
  const next = [];
  for (let r = 0; r < rows; r++) next.push(new Int8Array(cols).fill(Cell.FLOOR));
  const copyRows = Math.min(rows, old.length);
  const copyCols = Math.min(cols, old[0].length);
  for (let r = 0; r < copyRows; r++) {
    for (let c = 0; c < copyCols; c++) next[r][c] = old[r][c];
  }
  state.maze = new Maze(next);
  redrawEditor();
  updateValidation();
}

// Action buttons
document.getElementById("clear-btn").addEventListener("click", () => {
  const [rows, cols] = state.maze.shape;
  state.maze = Maze.empty(rows, cols);
  redrawEditor();
  updateValidation();
});

document.getElementById("border-btn").addEventListener("click", () => {
  const grid = state.maze.grid;
  const [rows, cols] = state.maze.shape;
  for (let c = 0; c < cols; c++) { grid[0][c] = Cell.WALL; grid[rows - 1][c] = Cell.WALL; }
  for (let r = 0; r < rows; r++) { grid[r][0] = Cell.WALL; grid[r][cols - 1] = Cell.WALL; }
  redrawEditor();
  updateValidation();
});

// Validation banner
const banner = document.getElementById("validation-banner");
const runGateMsg = document.getElementById("run-gate-msg");

function updateValidation() {
  const problems = state.maze.validate();
  if (problems.length > 0) {
    banner.className = "banner warning";
    banner.innerHTML = problems.map((p) => `<div>${escapeHtml(p)}</div>`).join("");
  } else {
    banner.className = "banner success";
    banner.textContent = "Maze is valid - ready to run!";
  }
  setRunGate(problems.length === 0);
  return problems.length === 0;
}

function setRunGate(isValid) {
  document.getElementById("compare-run-btn").disabled = !isValid;
  runGateMsg.classList.toggle("hidden", isValid);
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Compare mode
// ---------------------------------------------------------------------------

const compareTable = document.getElementById("compare-table");
const compareWatchGroup = document.getElementById("compare-watch-group");
const compareWatchSelect = document.getElementById("compare-watch-algo");
const compareAnimControls = document.getElementById("compare-anim-controls");
const comparePlayBtn = document.getElementById("compare-play-btn");
const compareSkipBtn = document.getElementById("compare-skip-btn");
const compareSpeed = document.getElementById("compare-speed");
const compareProgress = document.getElementById("compare-progress");
const compareCanvas = document.getElementById("compare-canvas");

for (const name of Object.keys(ALGORITHMS)) {
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = name;
  compareWatchSelect.appendChild(opt);
}

document.getElementById("compare-run-btn").addEventListener("click", runCompareAll);
compareWatchSelect.addEventListener("change", () => {
  if (state.compareResults) animateCompareWatch(compareWatchSelect.value);
});

comparePlayBtn.addEventListener("click", () => {
  if (!state.compareAnim) return;
  if (state.compareAnim.isPlaying) {
    state.compareAnim.pause();
    comparePlayBtn.textContent = "Play";
  } else {
    state.compareAnim.resume();
    comparePlayBtn.textContent = "Pause";
  }
});
compareSkipBtn.addEventListener("click", () => {
  if (state.compareAnim) {
    state.compareAnim.skipToEnd();
    comparePlayBtn.textContent = "Play";
  }
});

function runCompareAll() {
  if (!state.maze.isValid()) return;
  const maze = state.maze.copy();
  const results = {};
  for (const [name, solveFn] of Object.entries(ALGORITHMS)) {
    results[name] = solveFn(maze);
  }
  state.compareResults = { maze, results };

  const tbody = compareTable.querySelector("tbody");
  tbody.innerHTML = Object.entries(results).map(([name, r]) => {
    const entry = buildScoreEntry(r, maze.shape);
    return `<tr>
      <td>${escapeHtml(name)}</td>
      <td>${r.nodesExplored}</td>
      <td>${r.runtimeMs.toFixed(2)}</td>
      <td>${r.pathLength}</td>
      <td>${r.trueCost}</td>
      <td>${r.mudCrossed}</td>
      <td>${entry.difficultyScore.toFixed(2)}</td>
    </tr>`;
  }).join("");
  compareTable.classList.remove("hidden");
  compareWatchGroup.classList.remove("hidden");

  animateCompareWatch(compareWatchSelect.value);
}

function animateCompareWatch(algoName) {
  if (!state.compareResults) return;
  const { maze, results } = state.compareResults;
  const result = results[algoName];

  if (state.compareAnim) state.compareAnim.pause();
  compareAnimControls.classList.remove("hidden");
  comparePlayBtn.textContent = "Pause";
  compareProgress.textContent = "";

  state.compareAnim = createAnimationController(compareCanvas, maze, result, {
    onProgress: (revealed, total) => {
      compareProgress.textContent = total > 0 ? `Exploring... ${revealed} / ${total} cells` : "Nothing to explore.";
      if (revealed >= total) comparePlayBtn.textContent = "Play";
    },
    onSpeedRead: () => parseInt(compareSpeed.value, 10),
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

redrawEditor();
updateValidation();
window.addEventListener("resize", () => {
  redrawEditor();
});
