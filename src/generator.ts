import { TIERS } from "./constants";
import { SEEDS } from "./seeds";
import { parseBoard } from "./rules";
import { analyze, qualifies } from "./solver";
const integer = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));
/** Draw dimensions independently, then vary topology and charge distribution.
 * Exhaustive certification is the acceptance gate; a bounded search falls back
 * to a certified starting point so generating can never strand the player. */
export function generate(tier: number): string[] {
  const limits = TIERS.find((t) => t.tier === tier);
  if (!limits) throw new RangeError("Unknown Cascade tier");
  const cols = integer(limits.minCols, limits.maxCols),
    rows = integer(limits.minRows, limits.maxRows);
  const seed = SEEDS.find(
    (s) => s.tier === tier && s.cols === cols && s.rows === rows,
  )!;
  let result = [...seed.lines];
  for (let attempt = 0; attempt < 12; attempt++) {
    const grid = result.map((l) => [...l]);
    if (Math.random() < 0.5) grid.reverse();
    if (Math.random() < 0.5) grid.forEach((r) => r.reverse());
    for (let step = 0; step < integer(1, 3); step++) {
      const x = integer(0, cols - 1),
        y = integer(0, rows - 1),
        u = integer(0, cols - 1),
        v = integer(0, rows - 1);
      if (Math.random() < 0.8)
        [grid[y][x], grid[v][u]] = [grid[v][u], grid[y][x]];
      else if (/[123]/.test(grid[y][x]))
        grid[y][x] = String(integer(limits.minCharges, limits.maxCharges));
      else if (!/[TSD]/.test(grid[y][x])) grid[y][x] = grid[v][u].toLowerCase();
    }
    const candidate = grid.map((r) => r.join("")),
      board = parseBoard(candidate);
    const crystals = board.nodes.filter((n) => n.kind === "crystal");
    if (
      crystals.length < limits.minCrystals ||
      crystals.length > limits.maxCrystals ||
      cols * rows - board.nodes.length > limits.maxEmptyCells
    )
      continue;
    if (qualifies(board, limits, analyze(board, limits.maxSolutions, 30000)))
      result = candidate;
  }
  return result;
}
