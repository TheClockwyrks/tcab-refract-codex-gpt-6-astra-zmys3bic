import type {
  RefractState,
  BeamState,
  PointerDevice,
  Channel,
  Screen,
} from "./game";
import * as C from "./constants";
import { CAMPAIGN } from "./campaign";
import { generate } from "./generator";
import {
  cellX,
  cellY,
  same,
  parseBoard,
  emptyBeams,
  spent,
  complete,
  solved,
  legal,
} from "./rules";
export { complete } from "./rules";
export interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export const initialState = (muted = false): RefractState => ({
  screen: "title",
  mode: "campaign",
  menuIndex: 0,
  board: { cols: 0, rows: 0, nodes: [] },
  beams: [],
  tracing: null,
  boardIndex: 0,
  solvedBoards: [],
  unlockedCount: 1,
  selectIndex: 0,
  solvedCount: 0,
  tier: 1,
  pointer: { x: 0, y: 0, down: false, device: "mouse" },
  armedTarget: null,
  simTime: 0,
  muted,
});
export function menuItems(s: RefractState): readonly string[] {
  if (s.screen === "title") return C.TITLE_ITEMS;
  if (s.screen === "complete") return ["BOARD SELECT", "MAIN MENU"];
  if (s.screen === "solved")
    return s.mode === "cascade"
      ? C.SOLVED_ITEMS
      : [
          ...(s.boardIndex < C.CAMPAIGN_LENGTH - 1 ? ["NEXT BOARD"] : []),
          "REPLAY",
          "BOARD SELECT",
        ];
  return [];
}
export function targets(s: RefractState): Target[] {
  const back = { id: "back", x: 52, y: 616, w: 144, h: C.TARGET_MIN_H };
  if (s.screen === "playing")
    return [{ id: "clear", x: 1084, y: 616, w: 144, h: C.TARGET_MIN_H }, back];
  if (s.screen === "howto") return [back];
  if (s.screen === "select")
    return [
      ...Array.from({ length: C.CAMPAIGN_LENGTH }, (_, i) => ({
        id: `board-${i + 1}`,
        x: 264 + (i % 6) * 132,
        y: 206 + Math.floor(i / 6) * 94,
        w: 112,
        h: 78,
      })),
      back,
    ];
  const title = s.screen === "title";
  return menuItems(s).map((_, i) => ({
    id: `menu-${i}`,
    x: title ? 104 : 972,
    y: (title ? 340 : 282) + i * 88,
    w: title ? 370 : 256,
    h: C.TARGET_MIN_H,
  }));
}
export function load(s: RefractState, lines: readonly string[]): RefractState {
  const board = parseBoard(lines);
  return {
    ...s,
    board,
    beams: emptyBeams(board),
    screen: "playing",
    tracing: null,
    menuIndex: 0,
    armedTarget: null,
  };
}
const enter = (s: RefractState, index: number): RefractState =>
  load({ ...s, boardIndex: index, selectIndex: index }, CAMPAIGN[index]);
const screen = (s: RefractState, to: Screen, menuIndex = 0): RefractState => ({
  ...s,
  screen: to,
  menuIndex,
  armedTarget: null,
  tracing: null,
  beams: s.beams.map((b) => (b.cells.length === 1 ? { ...b, cells: [] } : b)),
});
export const clear = (s: RefractState): RefractState => ({
  ...s,
  beams: emptyBeams(s.board),
  tracing: null,
});
export function action(s: RefractState, key: string): RefractState {
  if (key === "clear") return s.screen === "playing" ? clear(s) : s;
  if (key === "back") {
    if (s.screen === "title") return s;
    if (s.screen === "howto") return screen(s, "title", 2);
    if (s.screen === "select") return screen(s, "title", 0);
    const leaving = s.screen === "playing" ? clear(s) : s;
    return s.mode === "cascade"
      ? screen(leaving, "title", 1)
      : screen({ ...leaving, selectIndex: s.boardIndex }, "select");
  }
  if (s.screen === "select") {
    const col = s.selectIndex % 6,
      row = Math.floor(s.selectIndex / 6);
    if (key === "left" || key === "right")
      return {
        ...s,
        selectIndex: row * 6 + ((col + (key === "left" ? 5 : 1)) % 6),
      };
    if (key === "up" || key === "down")
      return {
        ...s,
        selectIndex: ((row + (key === "up" ? 3 : 1)) % 4) * 6 + col,
      };
    if (key === "confirm" && s.selectIndex < s.unlockedCount)
      return enter(s, s.selectIndex);
  }
  const items = menuItems(s);
  if (items.length && (key === "up" || key === "down"))
    return {
      ...s,
      menuIndex:
        (s.menuIndex + (key === "up" ? items.length - 1 : 1)) % items.length,
    };
  if (key !== "confirm") return s;
  if (s.screen === "title") {
    if (s.menuIndex === 0) return screen({ ...s, mode: "campaign" }, "select");
    if (s.menuIndex === 1)
      return load(
        { ...s, mode: "cascade", solvedCount: 0, tier: 1 },
        generate(1),
      );
    return screen(s, "howto");
  }
  if (s.screen === "complete")
    return screen(s, s.menuIndex === 0 ? "select" : "title");
  if (s.screen === "solved") {
    if (s.mode === "cascade") {
      const next = s.menuIndex === 1 ? { ...s, solvedCount: 0, tier: 1 } : s;
      return load(next, generate(next.tier));
    }
    const item = items[s.menuIndex];
    if (item === "NEXT BOARD") return enter(s, s.boardIndex + 1);
    if (item === "REPLAY") return enter(s, s.boardIndex);
    return screen({ ...s, selectIndex: s.boardIndex }, "select");
  }
  return s;
}
function checkSolved(s: RefractState): RefractState {
  if (s.screen !== "playing" || !solved(s.board, s.beams)) return s;
  if (s.mode === "cascade") {
    const solvedCount = s.solvedCount + 1;
    return screen(
      {
        ...s,
        solvedCount,
        tier: Math.min(
          Math.floor(solvedCount / C.TIER_ADVANCE) + 1,
          C.MAX_TIER,
        ),
      },
      "solved",
    );
  }
  const solvedBoards = [...new Set([...s.solvedBoards, s.boardIndex])].sort(
    (a, b) => a - b,
  );
  return screen(
    {
      ...s,
      solvedBoards,
      unlockedCount: Math.max(
        s.unlockedCount,
        Math.min(s.boardIndex + 2, C.CAMPAIGN_LENGTH),
      ),
      selectIndex: s.boardIndex,
    },
    solvedBoards.length === C.CAMPAIGN_LENGTH ? "complete" : "solved",
  );
}
const replace = (
  s: RefractState,
  channel: Channel,
  cells: BeamState["cells"],
): RefractState => ({
  ...s,
  beams: s.beams.map((b) => (b.channel === channel ? { ...b, cells } : b)),
});
export function pointerEvent(
  state: RefractState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): RefractState {
  let s: RefractState = {
    ...state,
    pointer: {
      x,
      y,
      device,
      down: type === "down" ? true : type === "up" ? false : state.pointer.down,
    },
  };
  const target = targets(s).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (
    target &&
    (type === "down" ||
      (type === "move" && !s.pointer.down) ||
      (type === "up" && target.id === s.armedTarget))
  ) {
    if (target.id.startsWith("menu-"))
      s = { ...s, menuIndex: Number(target.id.slice(5)) };
    if (target.id.startsWith("board-"))
      s = { ...s, selectIndex: Number(target.id.slice(6)) - 1 };
  }
  if (type === "up") {
    const armed = s.armedTarget;
    s = {
      ...s,
      armedTarget: null,
      tracing: null,
      beams: s.beams.map((b) =>
        b.cells.length === 1 ? { ...b, cells: [] } : b,
      ),
    };
    return target?.id === armed
      ? action(
          s,
          target.id === "clear" || target.id === "back" ? target.id : "confirm",
        )
      : s;
  }
  if (type === "down") {
    s = { ...s, armedTarget: target?.id ?? null };
    if (target) return s;
  }
  if (s.screen !== "playing") return s;
  const node = s.board.nodes.find(
    (n) =>
      Math.hypot(
        x - cellX(n.col, s.board.cols),
        y - cellY(n.row, s.board.rows),
      ) <= C.NODE_HIT_R,
  );
  if (!node) return s;
  if (type === "down") {
    let beam = s.beams.find(
      (b) =>
        node.kind === "emitter" &&
        b.channel === node.channel &&
        b.cells.length < 2,
    );
    if (beam)
      return {
        ...replace(s, beam.channel, [{ col: node.col, row: node.row }]),
        tracing: { channel: beam.channel },
      };
    beam = s.beams.find(
      (b) => same(b.cells[0], node) || same(b.cells[b.cells.length - 1], node),
    );
    if (beam)
      return {
        ...replace(
          s,
          beam.channel,
          same(beam.cells[0], node) ? [...beam.cells].reverse() : beam.cells,
        ),
        tracing: { channel: beam.channel },
      };
    const through = s.beams.filter((b) => b.cells.some((c) => same(c, node)));
    if (through.length === 1) {
      beam = through[0];
      const index = beam.cells.map((c) => same(c, node)).lastIndexOf(true);
      return {
        ...replace(s, beam.channel, beam.cells.slice(0, index + 1)),
        tracing: { channel: beam.channel },
      };
    }
    return { ...s, tracing: null };
  }
  if (s.tracing) {
    const beam = s.beams.find((b) => b.channel === s.tracing?.channel)!;
    if (same(beam.cells[beam.cells.length - 2], node))
      return replace(s, beam.channel, beam.cells.slice(0, -1));
    if (legal(s.board, s.beams, beam.channel, node))
      return checkSolved(
        replace(s, beam.channel, [
          ...beam.cells,
          { col: node.col, row: node.row },
        ]),
      );
  }
  return s;
}
export function snapshot(s: RefractState) {
  return {
    version: C.REFRACT_DEBUG_VERSION,
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    boardIndex: s.boardIndex,
    solvedBoards: [...s.solvedBoards],
    unlockedCount: s.unlockedCount,
    selectIndex: s.selectIndex,
    solvedCount: s.solvedCount,
    tier: s.tier,
    board: {
      ...s.board,
      nodes: s.board.nodes.map((n) => ({
        ...n,
        x: cellX(n.col, s.board.cols),
        y: cellY(n.row, s.board.rows),
        spent: n.kind === "crystal" ? spent(s.beams, n) : null,
      })),
    },
    beams: Object.fromEntries(
      s.beams.map((b) => [
        b.channel,
        {
          cells: b.cells.map((c) => ({ ...c })),
          complete: complete(s.board, b),
        },
      ]),
    ),
    solved: solved(s.board, s.beams),
    tracing: s.tracing
      ? {
          channel: s.tracing.channel,
          live: {
            ...s.beams
              .find((b) => b.channel === s.tracing?.channel)!
              .cells.slice(-1)[0],
          },
        }
      : null,
    pointer: { ...s.pointer },
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
export const debug = {
  version: C.REFRACT_DEBUG_VERSION,
  reset: (s: RefractState) => initialState(s.muted),
  snapshot,
  reconcile: (s: RefractState) => ({ ...s }),
  setMode: (s: RefractState, mode: RefractState["mode"]) => ({ ...s, mode }),
  setScreen: (s: RefractState, screen: Screen) => ({
    ...s,
    screen,
    armedTarget: null,
  }),
  setMenuIndex: (s: RefractState, menuIndex: number) => ({ ...s, menuIndex }),
  setSolvedCount: (s: RefractState, solvedCount: number) => ({
    ...s,
    solvedCount,
  }),
  setTier: (s: RefractState, tier: number) => ({ ...s, tier }),
  generateBoard: (s: RefractState, tier: number) => load(s, generate(tier)),
  loadBoard: load,
  pointerDown: (
    s: RefractState,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ) => pointerEvent(s, "down", x, y, device),
  pointerMove: (
    s: RefractState,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ) => pointerEvent(s, "move", x, y, device),
  pointerUp: (s: RefractState, device: PointerDevice = "mouse") =>
    pointerEvent(s, "up", s.pointer.x, s.pointer.y, device),
  clear,
};
