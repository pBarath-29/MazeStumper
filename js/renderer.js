// Canvas rendering: maze grid, exploration heatmap, path overlay, and a
// requestAnimationFrame-driven replay animation engine.
//
// The underlying search always runs to completion first (deterministic,
// reproducible scoring - the official metric). What gets animated is a
// *replay* of the captured visitedOrder, stepped through smoothly via
// requestAnimationFrame. This is the core UX upgrade over the Streamlit
// version's st.empty() + time.sleep redraw loop: interruptible, scrubbable,
// speed-controlled, and genuinely fluid.

const COLORS = {
  [Cell.WALL]: "#2b2d31",
  [Cell.FLOOR]: "#f5f3ff",
  [Cell.START]: "#22c55e",
  [Cell.EXIT]: "#ef4444",
  [Cell.MUD]: "#92653a",
};

const VISITED_START_COLOR = [191, 219, 254]; // light blue
const VISITED_END_COLOR = [30, 58, 138];     // dark blue
const PATH_COLOR = "#facc15";

function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function rgbToCss([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`;
}

/** Fit the canvas to the maze's aspect ratio and return the cell size in px. */
function fitCanvas(canvas, rows, cols) {
  const containerWidth = canvas.parentElement ? canvas.parentElement.clientWidth : canvas.width;
  const maxSize = Math.min(canvas.width, containerWidth || canvas.width);
  const cellSize = Math.floor(maxSize / Math.max(rows, cols));
  canvas.width = cellSize * cols;
  canvas.height = cellSize * rows;
  return cellSize;
}

function drawMaze(ctx, maze, cellSize) {
  const { rows, cols, grid } = maze;
  ctx.clearRect(0, 0, cols * cellSize, rows * cellSize);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = COLORS[grid[r][c]];
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }
  drawGridLines(ctx, rows, cols, cellSize);
}

function drawGridLines(ctx, rows, cols, cellSize) {
  ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let r = 0; r <= rows; r++) {
    ctx.moveTo(0, r * cellSize);
    ctx.lineTo(cols * cellSize, r * cellSize);
  }
  for (let c = 0; c <= cols; c++) {
    ctx.moveTo(c * cellSize, 0);
    ctx.lineTo(c * cellSize, rows * cellSize);
  }
  ctx.stroke();
}

/**
 * Draw the maze with an exploration heatmap overlaid on visited cells (in
 * order, up to `upTo` exclusive), plus the final path drawn on top once the
 * full result is shown (upTo >= visitedOrder.length).
 */
function drawExploration(ctx, maze, result, cellSize, upTo) {
  drawMaze(ctx, maze, cellSize);

  const total = result.visitedOrder.length;
  const limit = Math.min(upTo, total);
  for (let i = 0; i < limit; i++) {
    const [r, c] = result.visitedOrder[i];
    const cellType = maze.grid[r][c];
    if (cellType === Cell.START || cellType === Cell.EXIT) continue;
    const t = total > 1 ? i / (total - 1) : 0;
    ctx.fillStyle = rgbToCss(lerpColor(VISITED_START_COLOR, VISITED_END_COLOR, t));
    ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
  }

  if (limit >= total && result.path) {
    ctx.fillStyle = PATH_COLOR;
    for (const [r, c] of result.path) {
      const cellType = maze.grid[r][c];
      if (cellType === Cell.START || cellType === Cell.EXIT) continue;
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }

  // Redraw start/exit markers on top so the heatmap never obscures them.
  ctx.fillStyle = COLORS[Cell.START];
  for (const [r, c] of [maze.start].filter(Boolean)) ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
  ctx.fillStyle = COLORS[Cell.EXIT];
  for (const [r, c] of maze.exits) ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);

  drawGridLines(ctx, maze.rows, maze.cols, cellSize);
}

/**
 * Drives a smooth replay of `result.visitedOrder` onto `canvas` via
 * requestAnimationFrame. Returns a controller object with play/pause/skip and
 * a progress callback hook.
 *
 * `speedToCellsPerFrame` maps a 1-10 UI speed value to how many newly-visited
 * cells get revealed per animation frame - higher speed reveals more cells
 * per frame, so large mazes don't take forever to finish.
 */
function createAnimationController(canvas, maze, result, { onProgress, onSpeedRead }) {
  const cellSize = fitCanvas(canvas, maze.rows, maze.cols);
  const ctx = canvas.getContext("2d");
  const total = result.visitedOrder.length;

  let revealed = 0;
  let playing = true;
  let rafId = null;
  let lastFrameTime = null;
  let carry = 0;

  function speedToCellsPerSecond(speed) {
    // speed 1 -> ~6 cells/sec, speed 10 -> the whole maze finishes in ~1.2s
    const minRate = 6;
    const maxRate = Math.max(minRate, total / 1.2);
    const t = (speed - 1) / 9;
    return minRate + (maxRate - minRate) * t;
  }

  function render() {
    drawExploration(ctx, maze, result, cellSize, revealed);
    if (onProgress) onProgress(revealed, total);
  }

  function frame(timestamp) {
    if (!playing) return;
    if (lastFrameTime === null) lastFrameTime = timestamp;
    const dtSeconds = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    const speed = onSpeedRead ? onSpeedRead() : 5;
    const rate = speedToCellsPerSecond(speed);
    carry += rate * dtSeconds;
    const advance = Math.floor(carry);
    if (advance > 0) {
      carry -= advance;
      revealed = Math.min(total, revealed + advance);
      render();
    }

    if (revealed < total) {
      rafId = requestAnimationFrame(frame);
    } else {
      playing = false;
    }
  }

  function start() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    lastFrameTime = null;
    rafId = requestAnimationFrame(frame);
  }

  render();
  if (total > 0) start();

  return {
    pause() {
      playing = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    },
    resume() {
      if (revealed >= total) return;
      playing = true;
      start();
    },
    get isPlaying() { return playing; },
    skipToEnd() {
      this.pause();
      revealed = total;
      render();
    },
    get progress() { return [revealed, total]; },
  };
}

/** Render a static thumbnail (final exploration + path) for compare-mode tables. */
function drawStaticResult(canvas, maze, result) {
  const cellSize = fitCanvas(canvas, maze.rows, maze.cols);
  const ctx = canvas.getContext("2d");
  drawExploration(ctx, maze, result, cellSize, result.visitedOrder.length);
}
