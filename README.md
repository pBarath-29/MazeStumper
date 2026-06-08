# Maze Stumper

Maze Stumper is a small web app where you draw your own maze, then watch four
classic search algorithms (Breadth First Search, Dijkstra's Algorithm, Greedy
Best First Search and A*) try to solve it side by side. You place the walls,
the start and exit, and optionally some "mud" tiles that cost more to cross.
The app then runs all four searches on your maze and lines up the results in
one table: nodes explored, runtime, path length, true cost, how many mud
tiles each path crosses, and a difficulty score. You can also pick any one of
the four and watch an animated replay of how it explored the grid.

It runs entirely in the browser (HTML, CSS and plain JavaScript with
`<canvas>`, no backend and no build step). I built it to get a feel for how
search and planning algorithms behave, since that is basically the
algorithmic core of how a mobile robot finds its way around.

```
maze_web/
├── index.html
├── style.css
└── js/
    ├── maze.js         # grid model, validity rules, terrain costs
    ├── algorithms.js   # the shared search skeleton and the four solvers
    ├── scoring.js      # difficulty score calculation used in the table
    ├── renderer.js     # canvas drawing and the replay/animation engine
    └── app.js          # UI wiring, the editor, and the comparison logic
```

Run it with `python -m http.server` from `maze_web/` and open the URL it
prints.

---

## Why build a maze instead of just solving one

Solving a maze only tells you that an algorithm works. Drawing one yourself
and then watching all four algorithms attack it at the same time forces you
to actually think about each algorithm's assumptions and blind spots: the
shapes that look the same to one search and completely different to another.
That felt like a much better way to learn than running a single solver and
trusting the output, because you start to predict where each one will
struggle before you even click run, and then you get to check whether you
were right.

## One search, four algorithms

`algorithms.js` does not implement BFS, Dijkstra, Greedy Best First Search
and A* as four separate functions. They are all the same generic
priority queue grid search (`prioritySearch`), and only two small things
change between them: what gets pushed onto the queue, and whether the cost
so far (`g`) tracks hop count or actual terrain cost.

| Algorithm | Priority pushed to the queue | Uses heuristic? | `g` measures |
|---|---|---|---|
| Breadth First Search | `g` | no | hop count, every step counts as 1 |
| Dijkstra's Algorithm | `g` | no | true terrain cost |
| Greedy Best First Search | `h` | yes | true terrain cost |
| A* | `g + h` | yes | true terrain cost |

```js
function solveBfs(maze)     { return prioritySearch(maze, (g, h) => g,     false, false); }
function solveDijkstra(maze){ return prioritySearch(maze, (g, h) => g,     false, true);  }
function solveGreedy(maze)  { return prioritySearch(maze, (g, h) => h,     true,  true);  }
function solveAstar(maze)   { return prioritySearch(maze, (g, h) => g + h, true,  true);  }
```

Writing it this way meant less code to maintain, but the bigger reason I did
it is that it makes the relationships between the four algorithms obvious.
Looking at the table you can see that A* is basically Dijkstra with a
heuristic added on top, that Greedy is A* without the memory of how far it
has already travelled, and that BFS is Dijkstra without any sense of terrain
cost at all. If I had written four separate solvers I think this connection
would have stayed hidden in the source code. The comparison table is what
makes that family relationship visible while the app is actually running, not
just on paper.

## Weighted terrain: the part that actually makes Dijkstra useful

On a plain grid where every cell costs the same to cross, Dijkstra's
Algorithm and BFS expand nodes in exactly the same order and return exactly
the same path. In that situation Dijkstra's extra bookkeeping buys you
nothing, which is probably why a lot of people first meet Dijkstra and think
it is just a slower version of BFS. The truth is that the grid was simply too
simple to show the difference.

Maze Stumper has a Mud tool: a mud tile costs 3 to cross compared to 1 for a
normal floor tile. That single change is what makes the "true cost" column in
the table actually mean something:

* BFS still finds the path with the fewest tiles in it. It has no concept of
  terrain cost, so to BFS a straight line through mud looks exactly as good
  as a straight line through clean floor of the same length.
* Dijkstra and A* find the cheapest path, which can be a longer one in terms
  of tile count if that means avoiding the expensive terrain.

To see this for yourself, draw a single wall splitting the maze in two with
exactly two gaps in it. Make one gap a short mud tunnel sitting right on the
straight line between start and exit, and make the other gap a slightly
longer detour through clean floor. Then click "Run all algorithms". Here is
what one such maze produced for me:

| | Path length | True cost | Crosses mud | Nodes explored |
|---|---|---|---|---|
| BFS | 28 | 34 | 3 | 212 |
| Dijkstra | 28 | 28 | 0 | 186 |
| Greedy | 28 | 34 | 3 | 29 |
| A* | 28 | 28 | 0 | 119 |

All four report the same path length of 28 tiles, but BFS and Greedy walked
straight through the mud tunnel (true cost 34, three mud tiles crossed) while
Dijkstra and A* took the same number of steps through clean floor instead
(true cost 28, no mud at all). BFS will happily tell you "shortest path: 28
tiles" and technically it is correct, by its own definition of shortest. But
that path actually costs about 21 percent more to traverse than the route
Dijkstra and A* picked. To me this is the clearest way to see that "shortest"
and "cheapest" are two different questions, and that a robot moving through
real terrain needs an algorithm that can tell them apart. Real path planners
deal with exactly this kind of thing: a costmap marks gravel, mud, ramps or
stairs as more expensive than clear floor, so the planner can choose to take
a longer but safer or faster route.

### Why the heuristic is still valid here

A* and Greedy use Manhattan distance as their estimate of the remaining cost
to the exit. Adding variable terrain costs raises an obvious question: is
that estimate still trustworthy?

It still is, because Manhattan distance assumes that every remaining step
will cost the cheapest possible amount, which is 1, the floor cost (see
`CELL_COST` in `maze.js`). That assumption is a true lower bound as long as
nothing in the maze costs less than floor to cross. A heuristic that never
overestimates the real remaining cost is called admissible, and that property
is exactly what guarantees A* finds the optimal path rather than just some
path. If I ever added a terrain type that was cheaper than floor, the
heuristic would have to assume that cost instead, otherwise A* could end up
trusting an overconfident estimate and settling for a worse route.

## The difficulty score

Nodes explored seems like a natural way to measure "how hard was this maze
for this algorithm", but on its own it is misleading, because a bigger maze
naturally has more cells to visit regardless of how tricky its layout is. So
the comparison table also reports

```
difficulty = nodes_explored / path_length
```

which is nodes explored relative to the length of the solution that was
actually found (this calculation lives in `scoring.js`). This rewards mazes
that are deceptive relative to their own solution length: dead ends that look
promising, corridors that double back on themselves, decoys that pull a
heuristic search away from the real route. A maze where a 9 tile solution
costs an algorithm 40 nodes of searching is, by this measure, more
interesting than one where a 200 tile solution costs it 220 nodes, even
though the second one technically explored more. The formula does not care
about weighted terrain since it only looks at each algorithm's own reported
path, and terrain actually gives you a new way to build that kind of trap: a
short mud covered "obvious" route placed next to a longer clean one is
basically a purpose built trap for an uninformed search, which is exactly
what the table above shows happening to Greedy and BFS.

## Complexity

All four algorithms run the same priority queue search over a grid with `V`
cells and at most `4V` edges, backed by a binary min heap.

| | Time | Space | Notes |
|---|---|---|---|
| BFS | O(V log V) | O(V) | the heap pushes and pops dominate here. With a plain queue this would be O(V), the heap is shared infrastructure rather than a requirement for BFS specifically |
| Dijkstra | O(V log V) | O(V) | the same big O as BFS. The real difference only shows up in which path it picks once the terrain is weighted |
| Greedy Best First | O(V log V) | O(V) | same bound, but the heuristic usually cuts down the constant factor a lot, so fewer nodes get explored in practice, at the cost of giving up optimality |
| A* | O(V log V) | O(V) | same bound again. The heuristic affects the constant, meaning how many nodes get expanded before reaching the goal, not the asymptotic class |

It is worth being precise about this: on this kind of graph, the four
algorithms do not actually differ in asymptotic complexity. What differs is
how many of the `V` nodes each one actually needs to look at before it
reaches the goal, which depends on the heuristic (for Greedy and A*) and on
terrain awareness (Dijkstra and A* compared to BFS). Big O notation simply
does not capture that difference. The "nodes explored" column in the table is
that practical difference made visible, side by side, on the same maze.

## How this connects to robotics

A couple of ideas in this project show up directly in real robot navigation
systems, which is part of why I found it interesting to build.

* Costmaps. The mud terrain here is a toy version of what robotics
  frameworks such as the ROS navigation stack call a costmap: a layer over
  the map that marks some areas as more expensive to cross than others, for
  example rough ground, areas close to obstacles, or stairs. The planner
  factors that cost layer into what it considers an "optimal" route. The
  true cost and crosses mud columns in this app are a direct, on screen
  readout of how well or how badly each algorithm reasons about that kind of
  costmap.
* Admissible heuristics. A* is only as good as its guarantee that the
  heuristic never overestimates the remaining cost. That guarantee is what
  connects a fairly abstract grid search trick to real motion planning, where
  the "heuristic" might be something like a straight line distance estimate
  that has to remain a true lower bound on the cost of any feasible,
  collision free, kinematically valid route.

## A bug that taught me something

There was one moment while building this where the project really pushed
back and taught me something I want to remember.

When I first added weighted terrain, I made every algorithm's cost so far
(`g`) accumulate the real terrain cost, since that seemed like the obviously
correct thing to do. It was not. That change made BFS expand nodes in exactly
the same order as Dijkstra and therefore return exactly the same path, which
quietly wiped out the entire "shortest is not the same as cheapest" idea that
the mud tool was supposed to demonstrate. The bug was sneaky precisely
because the code still ran fine and still produced a valid path, it had just
stopped being a meaningfully different algorithm from Dijkstra. The fix was
realising that real BFS is fundamentally a hop counting search with no
concept of edge weight at all, so `g` actually has to mean two genuinely
different things depending on whether you are running BFS or one of the
terrain aware searches. That is what the `useTrueCost` flag inside
`prioritySearch` encodes. The lesson I took from this is that a refactor
which "still runs" is not the same as a refactor that preserves the property
you actually care about. I only noticed the problem because I wrote a script
that compared all four algorithms' outputs on the same maze side by side,
which is more or less exactly the comparison this app now does for you,
automatically, on any maze you draw.

## Trying it yourself

Open the app and draw the layout from the weighted terrain example above by
hand: a single wall splitting the maze in two, with exactly two gaps in it.
Make one gap a short Mud tunnel sitting directly on the straight line between
start and exit, and make the other gap a slightly longer but completely clean
detour a couple of columns over. There is no preset or load feature on
purpose, drawing it yourself takes under a minute and is really the whole
point: you are the one designing the trap. Then click "Run all algorithms".
The table will show BFS and Greedy reporting the same path length as Dijkstra
and A*, but with a noticeably higher true cost and a non zero crosses mud
count, all readable straight off the table with no extra script needed. You
can also pick any algorithm from the "Watch this search animate" dropdown to
replay its exploration as a heatmap and watch, frame by frame, why it ended
up taking the route that it did.
