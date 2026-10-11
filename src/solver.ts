import type { BoardState, Channel, Cell, BeamState } from "./game";
import { CHANNELS, type Tier } from "./constants";
import { legal, same, emptyBeams } from "./rules";
interface Route {
  path: number[];
  edges: bigint;
  blocked: bigint;
  visits: number[];
}
export interface Analysis {
  routes: number[];
  solutions: number;
  determinedShare: number;
  branching: number;
  sharedCrystals: number;
  solution: readonly BeamState[];
}
/** Exhaustive, bounded enumeration. A budget exhaustion rejects the candidate,
 * never treats an incomplete search as a difficulty certificate. */
export function analyze(
  board: BoardState,
  maxSolutions = 256,
  budget = 500000,
): Analysis | null {
  const nodes = board.nodes,
    n = nodes.length;
  const channels = CHANNELS.filter((c) => nodes.some((v) => v.channel === c));
  const crystals = nodes
    .map((v, i) => (v.kind === "crystal" ? i : -1))
    .filter((i) => i >= 0);
  const neighbors = nodes.map((a, i) =>
    nodes
      .map((b, j) =>
        i !== j && Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1
          ? j
          : -1,
      )
      .filter((j) => j >= 0),
  );
  const pairs: [number, number][] = [];
  const ids = Array.from({ length: n }, () => Array<number>(n).fill(-1));
  for (let i = 0; i < n; i++)
    for (const j of neighbors[i])
      if (j > i) {
        ids[i][j] = ids[j][i] = pairs.length;
        pairs.push([i, j]);
      }
  const bits = pairs.map((_, i) => 1n << BigInt(i));
  const blockers = pairs.map(([i, j], e) => {
    const a = nodes[i],
      b = nodes[j];
    let mask = bits[e];
    if (a.col !== b.col && a.row !== b.row)
      pairs.forEach(([k, l], f) => {
        const c = nodes[k],
          d = nodes[l];
        if (
          c.col !== d.col &&
          c.row !== d.row &&
          a.col + b.col === c.col + d.col &&
          a.row + b.row === c.row + d.row
        )
          mask |= bits[f];
      });
    return mask;
  });
  let remaining = budget;
  const routes: Route[][] = [];
  for (const channel of channels) {
    const ends = nodes
      .map((v, i) => (v.kind === "emitter" && v.channel === channel ? i : -1))
      .filter((i) => i >= 0);
    if (ends.length !== 2) return null;
    const lensCount = nodes.filter(
      (v) => v.kind === "lens" && v.channel === channel,
    ).length;
    const found = new Map<bigint, Route>(),
      visits = Array<number>(n).fill(0),
      path = [ends[0]];
    visits[ends[0]] = 1;
    function walk(
      at: number,
      edges: bigint,
      blocked: bigint,
      lenses: number,
    ): void {
      if (--remaining < 0) return;
      if (at === ends[1]) {
        if (lenses === lensCount && !found.has(edges))
          found.set(edges, {
            path: [...path],
            edges,
            blocked,
            visits: [...visits],
          });
        return;
      }
      for (const next of neighbors[at]) {
        const node = nodes[next],
          id = ids[at][next];
        if (
          (node.channel !== null && node.channel !== channel) ||
          visits[next] >= (node.charges ?? 1) ||
          (blocked & bits[id]) !== 0n
        )
          continue;
        visits[next]++;
        path.push(next);
        walk(
          next,
          edges | bits[id],
          blocked | blockers[id],
          lenses + (node.kind === "lens" ? 1 : 0),
        );
        path.pop();
        visits[next]--;
        if (remaining < 0) return;
      }
    }
    walk(ends[0], 0n, 0n, 0);
    if (remaining < 0 || !found.size) return null;
    routes.push([...found.values()]);
  }
  let count = 0,
    shared = 0,
    branches = 0,
    totalSegments = 0;
  let common: bigint[] = [];
  let first: BeamState[] = [];
  const chosen: Route[] = [],
    usage = Array<number>(n).fill(0);
  function combine(c: number, blocked: bigint): void {
    if (--remaining < 0 || count > maxSolutions) return;
    if (c === channels.length) {
      if (!crystals.every((i) => usage[i] === nodes[i].charges)) return;
      count++;
      if (count > maxSolutions) return;
      common =
        count === 1
          ? chosen.map((r) => r.edges)
          : common.map((b, i) => b & chosen[i].edges);
      shared = Math.max(
        shared,
        crystals.filter(
          (i) => chosen.filter((r) => r.visits[i] > 0).length >= 2,
        ).length,
      );
      // The DFS retained the lexicographically first trail for each edge set.
      const beams = emptyBeams(board);
      chosen.forEach((route, i) => {
        const cells: Cell[] = [nodes[route.path[0]]];
        beams[i] = { channel: channels[i], cells };
        for (const next of route.path.slice(1)) {
          branches += nodes.filter((v) =>
            legal(board, beams, channels[i], v),
          ).length;
          totalSegments++;
          cells.push(nodes[next]);
        }
      });
      if (count === 1)
        first = beams.map((b) => ({
          ...b,
          cells: b.cells.map((c) => ({ col: c.col, row: c.row })),
        }));
      return;
    }
    for (const route of routes[c]) {
      if (
        (route.edges & blocked) !== 0n ||
        crystals.some(
          (i) => usage[i] + route.visits[i] > (nodes[i].charges ?? 0),
        )
      )
        continue;
      crystals.forEach((i) => (usage[i] += route.visits[i]));
      chosen.push(route);
      combine(c + 1, blocked | route.blocked);
      chosen.pop();
      crystals.forEach((i) => (usage[i] -= route.visits[i]));
      if (remaining < 0 || count > maxSolutions) return;
    }
  }
  combine(0, 0n);
  if (remaining < 0 || count === 0 || count > maxSolutions) return null;
  const bitCount = (b: bigint) => b.toString(2).replace(/0/g, "").length;
  const length = first.reduce((s, b) => s + b.cells.length - 1, 0);
  return {
    routes: routes.map((r) => r.length),
    solutions: count,
    determinedShare: common.reduce((s, b) => s + bitCount(b), 0) / length,
    branching: branches / totalSegments,
    sharedCrystals: shared,
    solution: first,
  };
}
export function qualifies(
  board: BoardState,
  tier: Tier,
  a: Analysis | null,
): boolean {
  if (!a) return false;
  const crystals = board.nodes.filter((n) => n.kind === "crystal");
  const channels = CHANNELS.filter((c) =>
    board.nodes.some((n) => n.channel === c),
  );
  return (
    board.cols >= tier.minCols &&
    board.cols <= tier.maxCols &&
    board.rows >= tier.minRows &&
    board.rows <= tier.maxRows &&
    channels.length === tier.channels &&
    channels.every((c, i) => c === CHANNELS[i]) &&
    crystals.length >= tier.minCrystals &&
    crystals.length <= tier.maxCrystals &&
    crystals.every(
      (n) =>
        (n.charges ?? 0) >= tier.minCharges &&
        (n.charges ?? 0) <= tier.maxCharges,
    ) &&
    board.cols * board.rows - board.nodes.length <= tier.maxEmptyCells &&
    a.routes.every((r) => r >= tier.minRoutes) &&
    a.solutions >= tier.minSolutions &&
    a.solutions <= tier.maxSolutions &&
    a.determinedShare <= tier.maxDeterminedShare &&
    a.branching >= tier.minBranching &&
    a.sharedCrystals >= tier.minSharedCrystals
  );
}
export function notation(board: BoardState): string[] {
  return Array.from({ length: board.rows }, (_, row) =>
    Array.from({ length: board.cols }, (_, col) => {
      const n = board.nodes.find((n) => same(n, { col, row }));
      if (!n) return ".";
      if (n.kind === "crystal") return String(n.charges);
      const char = "tsd"[CHANNELS.indexOf(n.channel as Channel)];
      return n.kind === "emitter" ? char.toUpperCase() : char;
    }).join(""),
  );
}
