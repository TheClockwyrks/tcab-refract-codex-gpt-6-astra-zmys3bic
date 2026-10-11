import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { game, BACKGROUND, type Cell, type PointerDevice } from "./game";
import { CAMPAIGN } from "./campaign";
import { SEEDS } from "./seeds";
import * as C from "./constants";
import { cellX, cellY, parseBoard, legal, emptyBeams } from "./rules";
import { analyze, qualifies } from "./solver";
import { action, targets, menuItems } from "./simulation";

function setup() {
  const events = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    layout: C.LAYOUT,
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  return { engine, events };
}
let env: ReturnType<typeof setup>;
beforeEach(async () => {
  env = setup();
  await env.engine.initialize();
});
afterEach(() => env.engine.destroy());
const load = (lines: readonly string[]) =>
  env.engine.apply((s) => env.engine.debug.loadBoard(s, lines));
function point(
  type: "down" | "move",
  col: number,
  row: number,
  device: PointerDevice = "mouse",
) {
  env.engine.apply((s) =>
    env.engine.debug[type === "down" ? "pointerDown" : "pointerMove"](
      s,
      cellX(col, s.board.cols),
      cellY(row, s.board.rows),
      device,
    ),
  );
}
function trace(cells: readonly Cell[], device: PointerDevice = "mouse") {
  cells.forEach((c, i) => point(i ? "move" : "down", c.col, c.row, device));
  env.engine.apply((s) => env.engine.debug.pointerUp(s, device));
}
function emit(type: string, values: Record<string, unknown>) {
  env.events.dispatchEvent(Object.assign(new Event(type), values));
}
async function key(code: string) {
  emit("keydown", { code, repeat: false });
  await env.engine.advance(1);
  emit("keyup", { code });
}
function click(id: string) {
  const t = targets(env.engine.state).find((t) => t.id === id)!;
  env.engine.apply((s) =>
    env.engine.debug.pointerDown(s, t.x + t.w / 2, t.y + t.h / 2, "touch"),
  );
  env.engine.apply((s) => env.engine.debug.pointerUp(s, "touch"));
}

describe("engine and screen navigation", () => {
  it("initializes the whole state, registers readings, and integrates real delta time", async () => {
    expect(env.engine.state.screen).toBe("title");
    expect(env.engine.debug.version).toBe(C.REFRACT_DEBUG_VERSION);
    const before = env.engine.state;
    await env.engine.advance(30);
    expect(env.engine.state.simTime).toBeCloseTo(0.5);
    expect(before.simTime).toBe(0);
    expect(env.engine.diagnostics().every((r) => r.error === undefined)).toBe(
      true,
    );
    await key("KeyM");
    expect(env.engine.state.muted).toBe(true);
    env.engine.apply((s) => env.engine.debug.reset(s));
    expect(env.engine.state.muted).toBe(true);
    expect(env.engine.state.simTime).toBe(0);
  });
  it("wraps menus and the campaign grid, rejects locked boards, and returns correctly", async () => {
    await key("ArrowUp");
    expect(env.engine.state.menuIndex).toBe(2);
    await key("Enter");
    expect(env.engine.state.screen).toBe("howto");
    await key("Escape");
    expect(env.engine.state.menuIndex).toBe(2);
    await key("ArrowDown");
    await key("Enter");
    expect(env.engine.state.screen).toBe("select");
    await key("ArrowLeft");
    expect(env.engine.state.selectIndex).toBe(5);
    await key("ArrowUp");
    expect(env.engine.state.selectIndex).toBe(23);
    await key("Enter");
    expect(env.engine.state.screen).toBe("select");
    await key("ArrowRight");
    await key("ArrowDown");
    expect(env.engine.state.selectIndex).toBe(0);
    await key("Enter");
    expect(env.engine.state.board).toEqual(parseBoard(CAMPAIGN[0]));
    await key("Enter");
    expect(env.engine.state.screen).toBe("playing");
    await key("Escape");
    expect(env.engine.state.screen).toBe("select");
    await key("Escape");
    expect(env.engine.state.menuIndex).toBe(0);
  });
  it("requires a release in the armed target and disarms across screens", () => {
    const t = targets(env.engine.state)[1];
    env.engine.apply((s) =>
      env.engine.debug.pointerDown(s, t.x + 10, t.y + 10),
    );
    env.engine.apply((s) => env.engine.debug.pointerMove(s, 0, 0));
    env.engine.apply((s) => env.engine.debug.pointerUp(s));
    expect(env.engine.state.screen).toBe("title");
    env.engine.apply((s) =>
      env.engine.debug.pointerDown(s, t.x + 10, t.y + 10),
    );
    env.engine.apply((s) => env.engine.debug.setScreen(s, "howto"));
    expect(env.engine.state.armedTarget).toBeNull();
    env.engine.apply((s) => env.engine.debug.pointerUp(s));
    expect(env.engine.state.screen).toBe("howto");
    click("back");
    expect(env.engine.state.menuIndex).toBe(2);
  });
  it("all targets are large, inside the stage, ordered, and disjoint", () => {
    for (const screen of [
      "title",
      "howto",
      "select",
      "playing",
      "solved",
      "complete",
    ] as const)
      for (const mode of ["campaign", "cascade"] as const) {
        env.engine.apply((s) => ({ ...s, screen, mode }));
        const ts = targets(env.engine.state);
        for (const a of ts) {
          expect(a.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
          expect(a.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.y).toBeGreaterThanOrEqual(0);
          expect(a.x + a.w).toBeLessThanOrEqual(C.STAGE_W);
          expect(a.y + a.h).toBeLessThanOrEqual(C.STAGE_H);
          for (const b of ts.filter((b) => b !== a))
            expect(
              a.x >= b.x + b.w ||
                b.x >= a.x + a.w ||
                a.y >= b.y + b.h ||
                b.y >= a.y + a.h,
            ).toBe(true);
        }
      }
  });
});
describe("beam transactions", () => {
  it.each(["mouse", "pen", "touch"] as const)(
    "solves immediately using %s, freezes the result and unlocks once",
    (device) => {
      load(["TtT"]);
      trace(
        [
          { col: 0, row: 0 },
          { col: 1, row: 0 },
          { col: 2, row: 0 },
        ],
        device,
      );
      const snap = env.engine.debug.snapshot(env.engine.state);
      expect(snap.solved).toBe(true);
      expect(snap.screen).toBe("solved");
      expect(snap.pointer.device).toBe(device);
      expect(snap.tracing).toBeNull();
      expect(snap.solvedBoards).toEqual([0]);
      expect(snap.unlockedCount).toBe(2);
      point("down", 2, 0);
      point("move", 1, 0);
      expect(env.engine.debug.snapshot(env.engine.state).solved).toBe(true);
    },
  );
  it("retracts, drops a single-cell trace, and starts afresh from either emitter", () => {
    load(["TttT"]);
    point("down", 0, 0);
    point("move", 1, 0);
    point("move", 0, 0);
    env.engine.apply((s) => env.engine.debug.pointerUp(s));
    expect(env.engine.state.beams[0].cells).toEqual([]);
    point("down", 3, 0);
    expect(env.engine.state.beams[0].cells).toEqual([{ col: 3, row: 0 }]);
  });
  it("resumes from both ends and shortens at the last occurrence", () => {
    load(["TtttT"]);
    trace([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 3, row: 0 },
    ]);
    point("down", 0, 0);
    expect(env.engine.state.beams[0].cells.map((c) => c.col)).toEqual([
      3, 2, 1, 0,
    ]);
    env.engine.apply((s) => env.engine.debug.pointerUp(s));
    point("down", 2, 0);
    expect(env.engine.state.beams[0].cells.map((c) => c.col)).toEqual([3, 2]);
  });
  it("allows premature endpoint connection but does not mark it complete", () => {
    load(["TT", "tt"]);
    trace([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(env.engine.state.screen).toBe("playing");
    expect(
      env.engine.debug.snapshot(env.engine.state).beams.triangle.complete,
    ).toBe(false);
    point("down", 1, 0);
    point("move", 1, 1);
    expect(env.engine.state.beams[0].cells).toHaveLength(2);
  });
  it("rejects nonadjacent, empty, foreign, reused and crossing segments", () => {
    const board = parseBoard(["TtS", "t.t", "TsS"]);
    let beams = emptyBeams(board).map((b) =>
      b.channel === "triangle" ? { ...b, cells: [{ col: 0, row: 0 }] } : b,
    );
    for (const c of [
      { col: 2, row: 0 },
      { col: 1, row: 1 },
      { col: 0, row: 2 },
    ])
      expect(legal(board, beams, "triangle", c)).toBe(false);
    const crossing = parseBoard(["Tt", "tT"]);
    beams = [
      {
        channel: "triangle",
        cells: [
          { col: 0, row: 0 },
          { col: 1, row: 1 },
        ],
      },
    ];
    expect(legal(crossing, beams, "triangle", { col: 0, row: 1 })).toBe(false);
    load(["Tt", "tT"]);
    trace([
      { col: 0, row: 0 },
      { col: 1, row: 1 },
    ]);
    point("down", 1, 1);
    point("move", 0, 1);
    expect(env.engine.state.beams[0].cells).toHaveLength(2);
  });
  it("spends on entry, refunds on retraction, and can share a crystal between channels", () => {
    load([".S.", "T2T", ".S."]);
    point("down", 0, 1);
    point("move", 1, 1);
    expect(
      env.engine.debug
        .snapshot(env.engine.state)
        .board.nodes.find((n) => n.kind === "crystal")?.spent,
    ).toBe(1);
    point("move", 0, 1);
    expect(
      env.engine.debug
        .snapshot(env.engine.state)
        .board.nodes.find((n) => n.kind === "crystal")?.spent,
    ).toBe(0);
    point("move", 1, 1);
    point("move", 2, 1);
    env.engine.apply((s) => env.engine.debug.pointerUp(s));
    trace([
      { col: 1, row: 0 },
      { col: 1, row: 1 },
      { col: 1, row: 2 },
    ]);
    expect(env.engine.debug.snapshot(env.engine.state).solved).toBe(true);
  });
  it("does not grab a crystal shared by two beam interiors", () => {
    load([".S.", "T2T", ".S.", "..t"]);
    trace([
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ]);
    trace([
      { col: 1, row: 0 },
      { col: 1, row: 1 },
      { col: 1, row: 2 },
    ]);
    point("down", 1, 1);
    expect(env.engine.state.tracing).toBeNull();
  });
  it("keeps poses immutable and reconcile inert, and validates notation loudly", () => {
    const start = env.engine.state;
    load(["TtT"]);
    expect(start.board.nodes).toHaveLength(0);
    const s = env.engine.state;
    env.engine.apply((s) => env.engine.debug.setSolvedCount(s, 20));
    expect(env.engine.state.tier).toBe(1);
    expect(env.engine.debug.reconcile(s)).toEqual(s);
    expect(() => load(["?"])).toThrow();
    expect(() => load(["........"])).toThrow();
    expect(() => load(["TT", "T"])).toThrow();
    env.engine.apply((s) => env.engine.debug.setScreen(s, "title"));
    env.engine.apply((s) => env.engine.debug.setMode(s, "cascade"));
    env.engine.apply((s) => env.engine.debug.setMenuIndex(s, 19));
    env.engine.apply((s) => env.engine.debug.setTier(s, 5));
    expect(env.engine.state.menuIndex).toBe(19);
    expect(env.engine.state.tier).toBe(5);
  });
});
describe("progression and generation", () => {
  it("plays all campaign boards and reaches complete without losing either mode’s progress", async () => {
    for (let i = 0; i < C.CAMPAIGN_LENGTH; i++) {
      env.engine.apply((s) => ({ ...s, boardIndex: i, mode: "campaign" }));
      load(CAMPAIGN[i]);
      const a = analyze(env.engine.state.board, 10000, 4000000);
      expect(a, `board ${i + 1}`).not.toBeNull();
      for (const beam of a!.solution) trace(beam.cells);
      expect(env.engine.state.solvedBoards).toContain(i);
      await env.engine.advance(1);
    }
    expect(env.engine.state.screen).toBe("complete");
    click("menu-0");
    expect(env.engine.state.screen).toBe("select");
    expect(env.engine.state.unlockedCount).toBe(C.CAMPAIGN_LENGTH);
    env.engine.apply((s) => action(s, "back"));
    click("menu-1");
    expect(env.engine.state.mode).toBe("cascade");
    expect(env.engine.state.solvedBoards).toHaveLength(C.CAMPAIGN_LENGTH);
    env.engine.apply((s) => env.engine.debug.setSolvedCount(s, 4));
    load(["TT"]);
    trace([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(env.engine.state.solvedCount).toBe(5);
    expect(env.engine.state.tier).toBe(2);
    click("menu-0");
    expect(env.engine.state.screen).toBe("playing");
    expect(env.engine.state.solvedCount).toBe(5);
    load(["TT"]);
    trace([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    click("menu-1");
    expect(env.engine.state.solvedCount).toBe(0);
    expect(env.engine.state.tier).toBe(1);
    await key("Escape");
    expect(env.engine.state.menuIndex).toBe(1);
    click("menu-0");
    expect(env.engine.state.unlockedCount).toBe(C.CAMPAIGN_LENGTH);
  }, 20000);
  it("certifies every starting grid and generated tier against the complete floor", () => {
    for (const seed of SEEDS) {
      const board = parseBoard(seed.lines);
      expect(qualifies(board, C.TIERS[seed.tier - 1], analyze(board))).toBe(
        true,
      );
    }
    for (const tier of C.TIERS)
      for (let i = 0; i < 3; i++) {
        env.engine.apply((s) => env.engine.debug.generateBoard(s, tier.tier));
        const b = env.engine.state.board;
        expect(qualifies(b, tier, analyze(b))).toBe(true);
        expect(env.engine.state.beams.every((b) => b.cells.length === 0)).toBe(
          true,
        );
      }
    expect(() => env.engine.debug.generateBoard(env.engine.state, 0)).toThrow();
  }, 20000);
  it("offers the correct campaign onward choices, including replaying the final board", () => {
    load(["TT"]);
    trace([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    click("menu-0");
    expect(env.engine.state.boardIndex).toBe(1);
    load(["TT"]);
    trace([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    click("menu-1");
    expect(env.engine.state.boardIndex).toBe(1);
    expect(env.engine.state.beams[0].cells).toHaveLength(0);
    env.engine.apply((s) => ({ ...s, boardIndex: C.CAMPAIGN_LENGTH - 1 }));
    load(["TT"]);
    trace([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(menuItems(env.engine.state)).toEqual(["REPLAY", "BOARD SELECT"]);
    click("menu-1");
    expect(env.engine.state.screen).toBe("select");
  });
});
describe("real engine event path", () => {
  it("resolves every ordered sample, ignores secondary contacts, and deduplicates cues per frame", async () => {
    load(["TttT"]);
    const cues: string[] = [];
    env.engine.events.on("cue:played", (e) => cues.push(e.cue));
    const event = (type: string, col: number, primary = true) =>
      emit(type, {
        clientX: cellX(col, 4),
        clientY: cellY(0, 1),
        pointerId: primary ? 1 : 2,
        isPrimary: primary,
        pointerType: "touch",
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      });
    event("pointerdown", 0);
    event("pointerdown", 3, false);
    event("pointermove", 1);
    event("pointermove", 2);
    event("pointermove", 3);
    event("pointerup", 3);
    await env.engine.advance(1);
    expect(env.engine.state.screen).toBe("solved");
    expect(cues).toEqual([
      C.CUES.connect,
      C.CUES.channelComplete,
      C.CUES.solved,
    ]);
    expect(env.engine.state.pointer.device).toBe("touch");
  });
  it("sounds clear only with segments and only when the action is reachable", async () => {
    load(["TttT"]);
    const cues: string[] = [];
    env.engine.events.on("cue:played", (e) => cues.push(e.cue));
    trace([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    await key("KeyR");
    expect(cues).toEqual([C.CUES.clear]);
    await key("KeyR");
    expect(cues).toHaveLength(1);
    env.engine.apply((s) => env.engine.debug.setScreen(s, "title"));
    await key("KeyR");
    expect(cues).toHaveLength(1);
  });
});

describe("trace edge cases", () => {
  it("keeps a debug trace live across counted engine frames", async () => {
    load(["TttT"]);
    point("down", 0, 0);
    await env.engine.advance(2);
    point("move", 1, 0);
    await env.engine.advance(2);
    point("move", 2, 0);
    await env.engine.advance(2);
    point("move", 3, 0);
    expect(env.engine.state.screen).toBe("solved");
  });
  it("rejects the opposing diagonal even when both nodes are available lenses", () => {
    const board = parseBoard(["Ttt", "ttT"]);
    const beams = [
      {
        channel: "triangle" as const,
        cells: [
          { col: 0, row: 0 },
          { col: 1, row: 1 },
          { col: 0, row: 1 },
        ],
      },
    ];
    expect(legal(board, beams, "triangle", { col: 1, row: 0 })).toBe(false);
    expect(legal(board, beams, "triangle", { col: 0, row: 0 })).toBe(false);
  });
  it("permits one channel to spend two crystal charges and shortens at its last visit", () => {
    load(["Tt.", "t2t", ".tT"]);
    const cells = [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 1, row: 1 },
      { col: 0, row: 1 },
      { col: 1, row: 2 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ];
    trace(cells);
    expect(env.engine.state.beams[0].cells).toHaveLength(7);
    expect(
      env.engine.debug
        .snapshot(env.engine.state)
        .board.nodes.find((n) => n.kind === "crystal")?.spent,
    ).toBe(2);
    point("down", 1, 1);
    expect(env.engine.state.beams[0].cells).toHaveLength(6);
    expect(
      env.engine.debug
        .snapshot(env.engine.state)
        .board.nodes.find((n) => n.kind === "crystal")?.spent,
    ).toBe(2);
    point("move", 2, 1);
    point("move", 1, 1);
    expect(env.engine.state.beams[0].cells).toHaveLength(6);
    point("move", 2, 1);
    point("move", 2, 2);
    expect(env.engine.state.screen).toBe("solved");
  });
  it("cannot enter a crystal already spent by a different beam", () => {
    load([".S.", "T1T", ".S."]);
    trace([
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ]);
    point("down", 1, 0);
    point("move", 1, 1);
    expect(
      env.engine.state.beams.find((b) => b.channel === "square")?.cells,
    ).toHaveLength(1);
    env.engine.apply((s) => env.engine.debug.setScreen(s, "title"));
    env.engine.apply((s) => env.engine.debug.clear(s));
    expect(env.engine.state.beams.every((b) => !b.cells.length)).toBe(true);
  });
});

it("activates the armed pointer choice even if the keyboard moved its highlight", async () => {
  const t = targets(env.engine.state)[0];
  const pointer = {
    clientX: t.x + 20,
    clientY: t.y + 20,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
  };
  emit("pointerdown", { ...pointer, buttons: 1 });
  await env.engine.advance(1);
  await key("ArrowDown");
  expect(env.engine.state.menuIndex).toBe(1);
  emit("pointerup", { ...pointer, buttons: 0 });
  await env.engine.advance(1);
  expect(env.engine.state.screen).toBe("select");
});
