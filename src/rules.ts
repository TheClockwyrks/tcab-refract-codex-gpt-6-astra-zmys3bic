import type { BoardState, BeamState, Cell, Channel } from "./game";
import {
  BOARD_CX,
  BOARD_CY,
  CELL_PITCH,
  CHANNELS,
  GRID_MAX_COLS,
  GRID_MAX_ROWS,
  MAX_CHARGES,
} from "./constants";
export const same = (a: Cell | undefined, b: Cell | undefined): boolean =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export const cellX = (col: number, cols: number): number =>
  BOARD_CX + (col - (cols - 1) / 2) * CELL_PITCH;
export const cellY = (row: number, rows: number): number =>
  BOARD_CY + (row - (rows - 1) / 2) * CELL_PITCH;
export const nodeAt = (board: BoardState, cell: Cell) =>
  board.nodes.find((n) => same(n, cell));
export function parseBoard(lines: readonly string[]): BoardState {
  const cols = lines[0]?.length ?? 0;
  if (
    !cols ||
    cols > GRID_MAX_COLS ||
    !lines.length ||
    lines.length > GRID_MAX_ROWS ||
    lines.some((l) => l.length !== cols || /[^.TSDtsd123]/.test(l))
  )
    throw new Error("Invalid board notation or dimensions");
  const nodes: BoardState["nodes"][number][] = [];
  lines.forEach((line, row) =>
    [...line].forEach((char, col) => {
      if (char === ".") return;
      const charges = Number(char);
      if (charges >= 1 && charges <= MAX_CHARGES)
        nodes.push({ col, row, kind: "crystal", channel: null, charges });
      else
        nodes.push({
          col,
          row,
          kind: char === char.toUpperCase() ? "emitter" : "lens",
          channel: CHANNELS["tsd".indexOf(char.toLowerCase())],
          charges: null,
        });
    }),
  );
  return { cols, rows: lines.length, nodes };
}
export const emptyBeams = (board: BoardState): BeamState[] =>
  CHANNELS.filter((c) => board.nodes.some((n) => n.channel === c)).map(
    (channel) => ({ channel, cells: [] }),
  );
export const spent = (beams: readonly BeamState[], cell: Cell): number =>
  beams.reduce(
    (sum, b) => sum + b.cells.filter((c) => same(c, cell)).length,
    0,
  );
export function complete(board: BoardState, beam: BeamState): boolean {
  const cells = beam.cells;
  if (cells.length < 2 || same(cells[0], cells[cells.length - 1])) return false;
  if (
    nodeAt(board, cells[0])?.kind !== "emitter" ||
    nodeAt(board, cells[cells.length - 1])?.kind !== "emitter"
  )
    return false;
  return board.nodes
    .filter((n) => n.kind === "lens" && n.channel === beam.channel)
    .every((n) => cells.slice(1, -1).some((c) => same(c, n)));
}
export const solved = (
  board: BoardState,
  beams: readonly BeamState[],
): boolean =>
  beams.length > 0 &&
  beams.every((b) => complete(board, b)) &&
  board.nodes
    .filter((n) => n.kind === "crystal")
    .every(
      (n) =>
        spent(beams, n) === n.charges &&
        beams.every(
          (b) => !same(b.cells[0], n) && !same(b.cells[b.cells.length - 1], n),
        ),
    );
export function segments(beams: readonly BeamState[]): [Cell, Cell][] {
  return beams.flatMap((b) =>
    b.cells.slice(1).map((c, i): [Cell, Cell] => [b.cells[i], c]),
  );
}
/** Limits only: coverage is deliberately not a condition of a legal move. */
export function legal(
  board: BoardState,
  beams: readonly BeamState[],
  channel: Channel,
  to: Cell,
): boolean {
  const beam = beams.find((b) => b.channel === channel);
  const from = beam?.cells[beam.cells.length - 1];
  if (
    !beam ||
    !from ||
    same(from, to) ||
    Math.abs(from.col - to.col) > 1 ||
    Math.abs(from.row - to.row) > 1
  )
    return false;
  const node = nodeAt(board, to);
  if (!node || (node.channel !== null && node.channel !== channel))
    return false;
  const edges = segments(beams);
  if (nodeAt(board, from)?.kind === "emitter" && beam.cells.length > 1)
    return false;
  if (
    node.kind === "crystal"
      ? spent(beams, to) >= (node.charges ?? 0)
      : beam.cells.some((c) => same(c, to))
  )
    return false;
  return !edges.some(
    ([a, b]) =>
      (same(a, from) && same(b, to)) ||
      (same(b, from) && same(a, to)) ||
      (a.col !== b.col &&
        a.row !== b.row &&
        from.col !== to.col &&
        from.row !== to.row &&
        a.col + b.col === from.col + to.col &&
        a.row + b.row === from.row + to.row),
  );
}
