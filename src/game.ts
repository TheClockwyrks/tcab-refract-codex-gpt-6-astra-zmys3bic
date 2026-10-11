import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import {
  initialState,
  debug,
  action,
  pointerEvent,
  snapshot,
  complete,
} from "./simulation";
import { render } from "./render";

export type Screen =
  "title" | "howto" | "select" | "playing" | "solved" | "complete";

export type Mode = "campaign" | "cascade";

export type Channel = "triangle" | "square" | "diamond";

export type NodeKind = "emitter" | "lens" | "crystal";

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export interface NodeState {
  readonly col: number;
  readonly row: number;
  readonly kind: NodeKind;
  readonly channel: Channel | null;
  readonly charges: number | null;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly nodes: readonly NodeState[];
}

export interface BeamState {
  readonly channel: Channel;
  readonly cells: readonly Cell[];
}

export interface TraceState {
  readonly channel: Channel;
}

export type PointerDevice = "mouse" | "pen" | "touch";

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface RefractState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly beams: readonly BeamState[];
  readonly tracing: TraceState | null;

  readonly boardIndex: number;
  readonly solvedBoards: readonly number[];
  readonly unlockedCount: number;
  readonly selectIndex: number;

  readonly solvedCount: number;
  readonly tier: number;

  readonly pointer: PointerState;
  readonly armedTarget: string | null;
  readonly simTime: number;
  readonly muted: boolean;
}

export type RefractDebugApi = {
  readonly [K in keyof typeof debug]: (typeof debug)[K] extends (
    s: RefractState,
    ...args: infer A
  ) => infer R
    ? (state: DeepReadonly<RefractState>, ...args: A) => R
    : (typeof debug)[K];
};
export const BACKGROUND = "#080e17";
export const game: Game<RefractState, RefractDebugApi> = {
  initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    const sounds = [
      { freq: 540, freqTo: 740, durationMs: 85 },
      { freq: 380, freqTo: 240, durationMs: 85 },
      { freq: 720, freqTo: 1080, durationMs: 220 },
      { freq: 520, freqTo: 1560, durationMs: 480 },
      { freq: 240, freqTo: 100, durationMs: 180 },
    ];
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, { ...sounds[i], wave: "sine", gain: 0.12 }),
    );
    for (const key of ["screen", "mode"] as const)
      api.diagnostics.register(key, (s) => s[key]);
    for (const key of ["cols", "rows"] as const)
      api.diagnostics.register(key, (s) => s.board[key]);
    for (const channel of C.CHANNELS) {
      api.diagnostics.register(`${channel} length`, (s) =>
        Math.max(
          0,
          (s.beams.find((b) => b.channel === channel)?.cells.length ?? 1) - 1,
        ),
      );
      api.diagnostics.register(`${channel} complete`, (s) => {
        const beam = s.beams.find((b) => b.channel === channel);
        return beam ? complete(s.board, beam) : false;
      });
    }
    for (let row = 0; row < C.GRID_MAX_ROWS; row++)
      api.diagnostics.register(
        `crystals row ${row + 1}`,
        (s) =>
          snapshot(s)
            .board.nodes.filter((n) => n.kind === "crystal" && n.row === row)
            .map((n) => `${n.col + 1}: ${n.spent}/${n.charges}`)
            .join(" · ") || "—",
      );
    api.diagnostics.register("solved", (s) => snapshot(s).solved);
    api.diagnostics.register(
      "pointer",
      (s) => `${s.pointer.x.toFixed(1)}, ${s.pointer.y.toFixed(1)}`,
    );
    api.diagnostics.register("device", (s) => s.pointer.device);
    return [initialState(), debug];
  },
  update(state, api, dt) {
    let s: RefractState = { ...state, simTime: state.simTime + dt };
    const cues = new Set<string>();
    const transition = (next: RefractState, clearing = false) => {
      const before = s.beams.reduce(
        (n, b) => n + Math.max(0, b.cells.length - 1),
        0,
      );
      const after = next.beams.reduce(
        (n, b) => n + Math.max(0, b.cells.length - 1),
        0,
      );
      if (clearing && before > after && next.screen === "playing")
        cues.add(C.CUES.clear);
      else if (s.screen === "playing" && s.board === next.board) {
        if (after > before) cues.add(C.CUES.connect);
        if (after < before) cues.add(C.CUES.retract);
        for (const beam of next.beams)
          if (
            complete(next.board, beam) &&
            !s.beams.some(
              (b) => b.channel === beam.channel && complete(s.board, b),
            )
          )
            cues.add(C.CUES.channelComplete);
        if (next.screen === "solved" || next.screen === "complete")
          cues.add(C.CUES.solved);
      }
      s = next;
    };
    for (const key of C.ACTIONS)
      if (api.input.pressed(key)) {
        if (key === "mute") api.audio.setMuted(!api.audio.muted());
        else
          transition(action(s, key), key === "clear" && s.screen === "playing");
      }
    for (const sample of api.input.pointerSamples())
      if (
        sample.primary &&
        (sample.type === "move" || sample.button === "primary")
      ) {
        const clearing = sample.type === "up" && s.armedTarget === "clear";
        transition(
          pointerEvent(s, sample.type, sample.x, sample.y, sample.device),
          clearing,
        );
      }
    for (const cue of cues) api.audio.play(cue);
    const pointer = api.input.pointer();
    return {
      ...s,
      pointer: {
        x: pointer.x,
        y: pointer.y,
        down: pointer.down,
        device: pointer.device,
      },
      muted: api.audio.muted(),
    };
  },
  render,
};
