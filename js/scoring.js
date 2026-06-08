// Difficulty scoring and high-score persistence.
// Direct port of maze_game/maze_game/scoring.py, using localStorage in place
// of scores.json.
//
// The "difficulty score" for a maze+algorithm run is nodes_explored normalized
// by the shortest possible path length, not raw nodes_explored. Raw counts
// would let a player "win" simply by drawing a huge empty room - normalizing
// rewards mazes that are *deceptive relative to their solution length*
// (dead-ends, misleading corridors), which is the actual design skill the
// game is testing.

const SCORES_KEY = "mazeStumperScores";
const TOP_N = 5;

function computeDifficultyScore(result) {
  if (!result.found || result.pathLength <= 0) return 0;
  return result.nodesExplored / result.pathLength;
}

function buildScoreEntry(result, gridShape) {
  return {
    difficultyScore: computeDifficultyScore(result),
    nodesExplored: result.nodesExplored,
    runtimeMs: result.runtimeMs,
    pathLength: result.pathLength,
    gridShape,
  };
}

function loadAllScores() {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveAllScores(data) {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(data));
  } catch (e) {
    // high scores are a nice-to-have; don't crash the game over a write failure
  }
}

function topScores(algorithmName) {
  const data = loadAllScores();
  return data[algorithmName] || [];
}

/**
 * Insert entry into the per-algorithm leaderboard if it makes the top N.
 * Returns true if it became a new high score (i.e. landed at rank 1).
 */
function recordScore(algorithmName, entry) {
  const data = loadAllScores();
  const entries = data[algorithmName] || [];
  const previousBest = entries.length > 0 ? entries[0].difficultyScore : null;

  entries.push(entry);
  entries.sort((a, b) => b.difficultyScore - a.difficultyScore);
  data[algorithmName] = entries.slice(0, TOP_N);
  saveAllScores(data);

  return previousBest === null || entry.difficultyScore > previousBest;
}
