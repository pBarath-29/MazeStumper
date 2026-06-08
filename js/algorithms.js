// Pathfinding algorithms that "race" through a maze.
//
// All four algorithms are the same 4-connected grid search differing only in
// what priority value they assign to a candidate cell - so a single
// parameterized skeleton (prioritySearch) backs all of them. Direct port of
// maze_game/maze_game/algorithms.py (_priority_search), generalized via a
// binary-heap priority queue with FIFO tie-breaking.

// Minimal binary min-heap of [priority, counter, position] triples.
class MinHeap {
  constructor() { this.items = []; }

  get size() { return this.items.length; }

  push(item) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._less(items[i], items[parent])) {
        [items[i], items[parent]] = [items[parent], items[i]];
        i = parent;
      } else break;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      const n = items.length;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && this._less(items[l], items[smallest])) smallest = l;
        if (r < n && this._less(items[r], items[smallest])) smallest = r;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest], items[i]];
        i = smallest;
      }
    }
    return top;
  }

  _less(a, b) {
    // Compare by priority, then by insertion counter (FIFO tie-breaking).
    if (a[0] !== b[0]) return a[0] < b[0];
    return a[1] < b[1];
  }
}

function manhattan([r1, c1], [r2, c2]) {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2);
}

function reconstructPath(cameFrom, current) {
  const path = [current];
  let key = `${current[0]},${current[1]}`;
  while (cameFrom.has(key)) {
    current = cameFrom.get(key);
    key = `${current[0]},${current[1]}`;
    path.push(current);
  }
  path.reverse();
  return path;
}

/**
 * Generic priority-queue grid search.
 *
 * priorityFn(g, h) computes the value pushed onto the heap, where g = cost so
 * far and h = heuristic estimate to the nearest exit (0 if useHeuristic is
 * false, since computing it would be wasted work for cost-only searches like
 * Dijkstra/BFS).
 *
 * Ties are broken by insertion order (a monotonically increasing counter),
 * which keeps BFS's "first in, first out" guarantee intact when its priority
 * function assigns every node the same value.
 */
/**
 * `useTrueCost` controls what `g` (cost-so-far) means:
 *  - true  -> g accumulates real terrain cost (maze.costOf) - what Dijkstra,
 *             Greedy, and A* all need so they can reason about expensive
 *             terrain (mud, etc.) and find the *cheapest* path.
 *  - false -> g accumulates a uniform 1 per step (hop count) - what real BFS
 *             does. BFS is a shortest-*hop-count* algorithm; it has no notion
 *             of edge weight, so it can confidently report "shortest path"
 *             while that path strolls straight through expensive terrain.
 *             Keeping this distinct from Dijkstra is what makes the two
 *             meaningfully different once terrain stops being uniform-cost.
 */
function prioritySearch(maze, priorityFn, useHeuristic, useTrueCost) {
  const start = maze.start;
  const exits = maze.exits;
  const exitKeys = new Set(exits.map(([r, c]) => `${r},${c}`));

  if (start === null || exits.length === 0) {
    return { path: null, visitedOrder: [], nodesExplored: 0, runtimeMs: 0 };
  }

  // Manhattan distance remains admissible under weighted terrain: it assumes
  // every remaining step costs the cheapest possible amount (1, the floor
  // cost), which is a true lower bound as long as no terrain is cheaper than
  // floor (see CELL_COST in maze.js). An admissible heuristic never
  // overestimates the true remaining cost, which is what guarantees A* still
  // finds an optimal (lowest-cost) path rather than just *a* path.
  const heuristic = (pos) => {
    if (!useHeuristic) return 0;
    let best = Infinity;
    for (const exitPos of exits) best = Math.min(best, manhattan(pos, exitPos));
    return best;
  };

  const startedAt = performance.now();

  let counter = 0;
  const heap = new MinHeap();
  heap.push([priorityFn(0, heuristic(start)), counter, start]);

  const cameFrom = new Map();
  const gScore = new Map([[`${start[0]},${start[1]}`, 0]]);
  const visited = new Set();
  const visitedOrder = [];

  let goalReached = null;

  while (heap.size > 0) {
    const [, , current] = heap.pop();
    const currentKey = `${current[0]},${current[1]}`;
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);
    visitedOrder.push(current);

    if (exitKeys.has(currentKey)) {
      goalReached = current;
      break;
    }

    for (const neighbor of maze.neighbors(current)) {
      const neighborKey = `${neighbor[0]},${neighbor[1]}`;
      // The step cost is either the neighbor's real terrain cost (Dijkstra,
      // Greedy, A*) or a flat 1 (BFS's hop count) - see useTrueCost above.
      const stepCost = useTrueCost ? maze.costOf(neighbor) : 1;
      const tentativeG = gScore.get(currentKey) + stepCost;
      if (tentativeG < (gScore.has(neighborKey) ? gScore.get(neighborKey) : Infinity)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        counter++;
        heap.push([priorityFn(tentativeG, heuristic(neighbor)), counter, neighbor]);
      }
    }
  }

  const runtimeMs = performance.now() - startedAt;
  const path = goalReached !== null ? reconstructPath(cameFrom, goalReached) : null;

  return {
    path,
    visitedOrder,
    nodesExplored: visitedOrder.length,
    runtimeMs,
    get found() { return this.path !== null; },
    get pathLength() { return this.path ? this.path.length - 1 : 0; },
    // Independent of whichever `g` bookkeeping this algorithm used - reads the
    // *actual* terrain cost off the maze for the reported path. This is what
    // makes it meaningful for BFS: its own `g` is a hop count that has no idea
    // its "shortest" path might cost far more than a longer, cheaper one.
    get trueCost() {
      if (!this.path) return 0;
      let cost = 0;
      for (let i = 1; i < this.path.length; i++) cost += maze.costOf(this.path[i]);
      return cost;
    },
    get mudCrossed() {
      if (!this.path) return 0;
      let count = 0;
      for (let i = 1; i < this.path.length; i++) {
        if (maze.grid[this.path[i][0]][this.path[i][1]] === Cell.MUD) count++;
      }
      return count;
    },
  };
}

function solveBfs(maze) {
  // Breadth-first search: expands in strict hop-count order, oblivious to
  // terrain cost - it finds the path with the *fewest cells*, which on a maze
  // with weighted terrain (mud) is not necessarily the *cheapest* path. This
  // is the textbook gap between "uninformed, unweighted search" and "search
  // that accounts for real traversal cost", and exactly what Dijkstra closes.
  return prioritySearch(maze, (g, h) => g, false, false);
}

function solveDijkstra(maze) {
  // Dijkstra's algorithm: expands by true cost-so-far (g), so it always finds
  // the *cheapest* path. On a unit-cost grid this coincides with BFS's
  // fewest-cells path - the two only diverge once terrain carries real
  // weight, which is exactly what the `useTrueCost` flag exists to model.
  // Dijkstra may report a *longer* path (more cells) that costs *less*
  // overall (it routes around mud) - the cleanest concrete demonstration of
  // why cost-aware search matters once "distance" and "cost" aren't the same
  // thing, which is the normal case for a real robot on real terrain.
  return prioritySearch(maze, (g, h) => g, false, true);
}

function solveGreedyBestFirst(maze) {
  // Greedy best-first search: expands by heuristic estimate only - fast when
  // the heuristic is informative, but easily fooled by dead-ends that merely
  // "look" close to the exit. Uses true cost for its g/cameFrom bookkeeping
  // (consistent with Dijkstra/A*) even though g never enters its priority.
  return prioritySearch(maze, (g, h) => h, true, true);
}

function solveAstar(maze) {
  // A*: balances true cost-so-far and heuristic estimate using Manhattan
  // distance - admissible here because every step costs at least 1 (the
  // floor cost), so the heuristic never overestimates the true remaining cost.
  return prioritySearch(maze, (g, h) => g + h, true, true);
}

const ALGORITHMS = {
  "Breadth-First Search": solveBfs,
  "Dijkstra's Algorithm": solveDijkstra,
  "Greedy Best-First Search": solveGreedyBestFirst,
  "A* Search": solveAstar,
};
