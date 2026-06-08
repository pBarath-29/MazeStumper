// Maze data model and validity rules.
// Direct port of maze_game/maze_game/maze.py.

const Cell = Object.freeze({ FLOOR: 0, WALL: 1, START: 2, EXIT: 3, MUD: 4 });
const MIN_GRID_SIZE = 5;

// Traversal cost per cell type - this is what turns the grid into a weighted
// graph (a simple stand-in for a robotics costmap, where different terrain
// costs different amounts to cross). Floor/start/exit are cost 1; mud is
// expensive but still walkable. Every cost is >= 1, which is what keeps the
// Manhattan-distance heuristic admissible (see algorithms.js).
const CELL_COST = Object.freeze({
  [Cell.FLOOR]: 1,
  [Cell.START]: 1,
  [Cell.EXIT]: 1,
  [Cell.MUD]: 3,
});

// 4-connected neighborhood - classic maze movement, no diagonals.
const NEIGHBOR_OFFSETS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

class Maze {
  constructor(grid) {
    this.grid = grid; // array of Int8Array rows
  }

  static empty(rows, cols) {
    const grid = [];
    for (let r = 0; r < rows; r++) grid.push(new Int8Array(cols).fill(Cell.FLOOR));
    return new Maze(grid);
  }

  get rows() { return this.grid.length; }
  get cols() { return this.grid[0].length; }
  get shape() { return [this.rows, this.cols]; }

  get start() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] === Cell.START) return [r, c];
      }
    }
    return null;
  }

  get exits() {
    const result = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] === Cell.EXIT) result.push([r, c]);
      }
    }
    return result;
  }

  isWalkable([r, c]) {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
    return this.grid[r][c] !== Cell.WALL;
  }

  /** Cost of entering a cell - 1 for ordinary floor, higher for difficult terrain. */
  costOf([r, c]) {
    return CELL_COST[this.grid[r][c]] ?? 1;
  }

  *neighbors([r, c]) {
    for (const [dr, dc] of NEIGHBOR_OFFSETS) {
      const candidate = [r + dr, c + dc];
      if (this.isWalkable(candidate)) yield candidate;
    }
  }

  reachableFrom(origin) {
    const key = ([r, c]) => `${r},${c}`;
    const visited = new Set([key(origin)]);
    const queue = [origin];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      for (const neighbor of this.neighbors(current)) {
        const k = key(neighbor);
        if (!visited.has(k)) {
          visited.add(k);
          queue.push(neighbor);
        }
      }
    }
    return visited;
  }

  validate() {
    const problems = [];
    const [rows, cols] = this.shape;

    if (rows < MIN_GRID_SIZE || cols < MIN_GRID_SIZE) {
      problems.push(`Maze must be at least ${MIN_GRID_SIZE}x${MIN_GRID_SIZE}.`);
    }

    let startCount = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.grid[r][c] === Cell.START) startCount++;
      }
    }
    const exitPositions = this.exits;

    if (startCount === 0) {
      problems.push("Place exactly one start cell.");
    } else if (startCount > 1) {
      problems.push("Only one start cell is allowed - remove the extras.");
    }

    if (exitPositions.length === 0) {
      problems.push("Place at least one exit cell.");
    }

    if (startCount === 1 && exitPositions.length > 0) {
      const start = this.start;
      const reachable = this.reachableFrom(start);
      const anyReachable = exitPositions.some(([r, c]) => reachable.has(`${r},${c}`));
      if (!anyReachable) {
        problems.push("No exit is reachable from the start - remove walls blocking the path.");
      }
    }

    return problems;
  }

  isValid() { return this.validate().length === 0; }

  copy() {
    return new Maze(this.grid.map(row => row.slice()));
  }
}
