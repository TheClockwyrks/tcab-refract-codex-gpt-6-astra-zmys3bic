import type { RenderApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { RefractState, Channel, NodeState } from "./game";
import * as C from "./constants";
import { cellX, cellY, complete, spent } from "./rules";
import { targets, menuItems } from "./simulation";
const INK = "#e9f1f5",
  DIM = "#8193a8",
  LINE = "#233244",
  MINT = "#7cf0cf";
const COLORS: Record<Channel, string> = {
  triangle: "#7cf0cf",
  square: "#ffb66f",
  diamond: "#b29bff",
};
type Context = RenderApi["ctx"];
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = INK,
  font = "sans-serif",
  align: CanvasTextAlign = "left",
): void {
  ctx.fillStyle = color;
  ctx.font = `${size >= 32 ? "500" : "400"} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}
function line(
  ctx: Context,
  x: number,
  y: number,
  u: number,
  v: number,
  color = LINE,
  width = 1,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(u, v);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function panel(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke = LINE,
  r = 12,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}
function shape(
  ctx: Context,
  channel: Channel,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  if (channel === "triangle") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.866, y + r * 0.5);
    ctx.lineTo(x - r * 0.866, y + r * 0.5);
  } else if (channel === "square")
    ctx.rect(x - r * 0.69, y - r * 0.69, r * 1.38, r * 1.38);
  else {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
  }
  ctx.closePath();
}
function node(
  ctx: Context,
  n: NodeState,
  x: number,
  y: number,
  used: number,
  active = false,
): void {
  ctx.save();
  if (active) {
    ctx.beginPath();
    ctx.arc(x, y, C.NODE_R + 9, 0, Math.PI * 2);
    ctx.strokeStyle = "#64768c";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (n.kind === "crystal") {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const px = x + Math.cos(a) * C.NODE_R * 0.91,
        py = y + Math.sin(a) * C.NODE_R * 0.91;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#182332";
    ctx.fill();
    ctx.strokeStyle = used === n.charges ? "#d3e2f2" : "#77879d";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, `${used}/${n.charges}`, x, y - 3, 15, INK, "monospace", "center");
    for (let i = 0; i < (n.charges ?? 0); i++) {
      ctx.beginPath();
      ctx.arc(
        x + (i - ((n.charges ?? 0) - 1) / 2) * 8,
        y + 13,
        2,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = i < used ? MINT : "#46576e";
      ctx.fill();
    }
  } else {
    const color = COLORS[n.channel!];
    ctx.shadowColor = color;
    ctx.shadowBlur = n.kind === "emitter" ? 14 : 7;
    shape(ctx, n.channel!, x, y, C.NODE_R * 0.83);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = color;
    ctx.fillStyle = n.kind === "emitter" ? "#0d1821" : color;
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (n.kind === "emitter") {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      shape(ctx, n.channel!, x, y, C.NODE_R * 0.42);
      ctx.strokeStyle = "#101c27";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}
function beam(
  ctx: Context,
  points: readonly { x: number; y: number }[],
  color: string,
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = 17;
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 7;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}
function background(ctx: Context): void {
  const gradient = ctx.createRadialGradient(730, 350, 10, 730, 350, 750);
  gradient.addColorStop(0, "#142232");
  gradient.addColorStop(1, "#080e17");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.fillStyle = "#1c2b3b";
  for (let y = 24; y < C.STAGE_H; y += 24)
    for (let x = 24; x < C.STAGE_W; x += 24) ctx.fillRect(x, y, 1, 1);
  line(ctx, 52, 91, 1228, 91);
  line(ctx, 52, 699, 1228, 699);
}
function chrome(ctx: Context, s: RefractState): void {
  text(ctx, C.TITLE_TEXT, 52, 49, 25, INK, "sans-serif");
  text(ctx, "O P T I C A L   S T U D I E S", 238, 50, 11, DIM, "monospace");
  text(
    ctx,
    s.muted ? "M  /  SOUND OFF" : "M  /  SOUND ON",
    1228,
    50,
    12,
    DIM,
    "monospace",
    "right",
  );
}
function control(
  ctx: Context,
  s: RefractState,
  id: string,
  label: string,
): void {
  const t = targets(s).find((t) => t.id === id);
  if (!t) return;
  const hover =
    s.pointer.x >= t.x &&
    s.pointer.x <= t.x + t.w &&
    s.pointer.y >= t.y &&
    s.pointer.y <= t.y + t.h;
  panel(
    ctx,
    t.x,
    t.y,
    t.w,
    t.h,
    hover ? "#203345" : "#111d2a",
    hover ? "#718b9b" : LINE,
    8,
  );
  text(
    ctx,
    label,
    t.x + t.w / 2,
    t.y + t.h / 2,
    14,
    INK,
    "monospace",
    "center",
  );
}
function menus(ctx: Context, s: RefractState): void {
  const items = menuItems(s);
  targets(s).forEach((t, i) => {
    const selected = s.menuIndex === i;
    panel(
      ctx,
      t.x,
      t.y,
      t.w,
      t.h,
      selected ? "#193a3c" : "#101c29",
      selected ? "#65bda9" : LINE,
      8,
    );
    text(
      ctx,
      items[i],
      t.x + 24,
      t.y + t.h / 2,
      17,
      selected ? MINT : INK,
      "monospace",
    );
    text(
      ctx,
      selected ? "↗" : "—",
      t.x + t.w - 28,
      t.y + t.h / 2,
      22,
      selected ? MINT : DIM,
      "sans-serif",
      "center",
    );
  });
}
function titleArt(ctx: Context, s: RefractState): void {
  const ox = 694,
    oy = 229,
    step = 105;
  panel(ctx, 598, 154, 574, 464, "#0b152180", "#2b3b4c", 24);
  text(ctx, "FIELD  /  001", 627, 180, 11, DIM, "monospace");
  text(
    ctx,
    "THREE CHANNELS. ONE PICTURE.",
    1144,
    590,
    11,
    DIM,
    "monospace",
    "right",
  );
  const paths = [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 2],
      [1, 3],
      [2, 3],
    ],
    [
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 1],
      [3, 1],
    ],
    [
      [3, 0],
      [2, 0],
      [2, 1],
      [3, 2],
      [3, 3],
    ],
  ];
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++) {
      ctx.beginPath();
      ctx.arc(ox + col * step, oy + row * step, 34, 0, Math.PI * 2);
      ctx.strokeStyle = "#243447";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  paths.forEach((path, i) => {
    const channel = C.CHANNELS[i];
    beam(
      ctx,
      path.map(([x, y]) => ({ x: ox + x * step, y: oy + y * step })),
      COLORS[channel],
    );
    path.forEach(([col, row], j) => {
      if ((col === 0 && row === 2) || (col === 2 && row === 1)) return;
      node(
        ctx,
        {
          col,
          row,
          kind: j === 0 || j === path.length - 1 ? "emitter" : "lens",
          channel,
          charges: null,
        },
        ox + col * step,
        oy + row * step,
        0,
      );
    });
    const progress = (s.simTime * 0.22 + i * 0.31) % 1,
      seg = progress * (path.length - 1),
      a = path[Math.floor(seg)],
      b = path[Math.min(Math.floor(seg) + 1, path.length - 1)];
    ctx.beginPath();
    ctx.arc(
      ox + (a[0] + (b[0] - a[0]) * (seg % 1)) * step,
      oy + (a[1] + (b[1] - a[1]) * (seg % 1)) * step,
      3,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  });
  for (const [col, row] of [
    [0, 2],
    [2, 1],
  ])
    node(
      ctx,
      { col, row, kind: "crystal", channel: null, charges: 2 },
      ox + col * step,
      oy + row * step,
      2,
    );
}
function board(ctx: Context, s: RefractState): void {
  const left = cellX(0, s.board.cols) - 45,
    top = cellY(0, s.board.rows) - 45;
  panel(
    ctx,
    left,
    top,
    (s.board.cols - 1) * C.CELL_PITCH + 90,
    (s.board.rows - 1) * C.CELL_PITCH + 90,
    "#0a142080",
    "#273649",
    16,
  );
  for (let row = 0; row < s.board.rows; row++)
    for (let col = 0; col < s.board.cols; col++) {
      const x = cellX(col, s.board.cols),
        y = cellY(row, s.board.rows);
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#36465a";
      ctx.fill();
    }
  for (const b of s.beams)
    beam(
      ctx,
      b.cells.map((c) => ({
        x: cellX(c.col, s.board.cols),
        y: cellY(c.row, s.board.rows),
      })),
      COLORS[b.channel],
    );
  for (const n of s.board.nodes) {
    const x = cellX(n.col, s.board.cols),
      y = cellY(n.row, s.board.rows);
    node(
      ctx,
      n,
      x,
      y,
      spent(s.beams, n),
      Math.hypot(s.pointer.x - x, s.pointer.y - y) <= C.NODE_HIT_R,
    );
  }
}
function play(ctx: Context, s: RefractState): void {
  board(ctx, s);
  text(
    ctx,
    s.mode === "campaign" ? "CAMPAIGN" : "CASCADE",
    52,
    139,
    12,
    MINT,
    "monospace",
  );
  if (s.mode === "campaign") {
    text(ctx, String(s.boardIndex + 1).padStart(2, "0"), 48, 204, 72);
    text(
      ctx,
      `${C.SET_LABELS[Math.floor(s.boardIndex / 6)]}  /  ${C.CAMPAIGN_LENGTH} STUDIES`,
      52,
      261,
      12,
      DIM,
      "monospace",
    );
  } else {
    text(ctx, `${C.HUD_SOLVED_LABEL}  ${s.solvedCount}`, 52, 195, 21);
    text(ctx, `${C.HUD_TIER_LABEL}  ${s.tier}`, 52, 233, 21);
  }
  line(ctx, 52, 300, 242, 300);
  text(ctx, "CHANNELS", 52, 331, 11, DIM, "monospace");
  s.beams.forEach((b, i) => {
    const y = 376 + i * 58;
    shape(ctx, b.channel, 66, y, 12);
    ctx.strokeStyle = COLORS[b.channel];
    ctx.lineWidth = 2;
    ctx.stroke();
    text(
      ctx,
      complete(s.board, b) ? "COMPLETE" : "OPEN",
      94,
      y,
      13,
      COLORS[b.channel],
      "monospace",
    );
    text(
      ctx,
      complete(s.board, b) ? "✓" : "○",
      226,
      y,
      17,
      COLORS[b.channel],
      "sans-serif",
      "right",
    );
  });
  if (s.screen === "playing") {
    text(ctx, "TRACE THE LIGHT", 1020, 167, 12, MINT, "monospace");
    ["Join the matching", "outlines. Thread", "every filled lens."].forEach(
      (t, i) => text(ctx, t, 1020, 205 + i * 25, 16, DIM),
    );
    line(ctx, 1020, 293, 1228, 293);
    ["Drag back to undo.", "Release to keep", "your beam."].forEach((t, i) =>
      text(ctx, t, 1020, 324 + i * 25, 15, DIM),
    );
    if (s.board.nodes.some((n) => n.kind === "crystal")) {
      text(ctx, "CRYSTAL CHARGE", 1020, 443, 11, DIM, "monospace");
      const crystals = s.board.nodes.filter((n) => n.kind === "crystal");
      text(
        ctx,
        `${crystals.reduce((a, n) => a + spent(s.beams, n), 0)} / ${crystals.reduce((a, n) => a + (n.charges ?? 0), 0)}`,
        1020,
        482,
        30,
      );
      text(ctx, "Spend every charge.", 1020, 521, 14, DIM);
    }
    control(
      ctx,
      s,
      "clear",
      `${C.CLEAR_LABEL}  /  ${C.BINDINGS.clear[0].replace("Key", "")}`,
    );
    control(ctx, s, "back", `←  ${C.BACK_LABEL}`);
    text(
      ctx,
      "PRESS AN OUTLINE TO BEGIN  ·  FOLLOW ADJACENT NODES",
      C.STAGE_CX,
      681,
      11,
      DIM,
      "monospace",
      "center",
    );
  } else {
    panel(ctx, 963, 127, 274, 451, "#101e2c", "#456373", 16);
    text(
      ctx,
      s.screen === "complete" ? "ALL LIGHT ALIGNED" : C.SOLVED_TITLE_TEXT,
      986,
      169,
      17,
      MINT,
      "monospace",
    );
    text(
      ctx,
      s.screen === "complete"
        ? `${C.CAMPAIGN_LENGTH} boards solved`
        : s.mode === "campaign"
          ? `Study ${String(s.boardIndex + 1).padStart(2, "0")} complete`
          : `${s.solvedCount} boards solved`,
      986,
      212,
      17,
    );
    menus(ctx, s);
    text(
      ctx,
      "A LITTLE ORDER, MADE OF LIGHT.",
      C.STAGE_CX,
      684,
      11,
      DIM,
      "monospace",
      "center",
    );
  }
}
export function render(s: DeepReadonly<RefractState>, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  background(ctx);
  chrome(ctx, s);
  if (s.screen === "title") {
    text(
      ctx,
      "01  /  A PUZZLE OF CONNECTIONS",
      104,
      158,
      12,
      MINT,
      "monospace",
    );
    text(ctx, C.TITLE_TEXT, 99, 227, 78);
    text(ctx, C.TAGLINE_TEXT, 106, 290, 16, DIM, "monospace");
    menus(ctx, s);
    titleArt(ctx, s);
    text(ctx, "24 crafted studies. Endless possibilities.", 104, 640, 15, DIM);
    text(
      ctx,
      "DRAG TO DRAW  /  TAKE YOUR TIME",
      1172,
      659,
      11,
      DIM,
      "monospace",
      "right",
    );
  } else if (s.screen === "select") {
    text(ctx, "THE CAMPAIGN", 104, 141, 38);
    text(
      ctx,
      `${s.solvedBoards.length} / ${C.CAMPAIGN_LENGTH} ALIGNED`,
      1175,
      143,
      13,
      MINT,
      "monospace",
      "right",
    );
    C.SET_LABELS.forEach((label, row) => {
      text(ctx, label, 104, 243 + row * 94, 14, DIM, "monospace");
    });
    targets(s)
      .filter((t) => t.id.startsWith("board"))
      .forEach((t, i) => {
        const done = s.solvedBoards.includes(i),
          locked = i >= s.unlockedCount,
          selected = s.selectIndex === i;
        panel(
          ctx,
          t.x,
          t.y,
          t.w,
          t.h,
          selected ? "#223c46" : locked ? "#0c1622" : "#172a36",
          selected ? MINT : LINE,
          8,
        );
        text(
          ctx,
          String(i + 1).padStart(2, "0"),
          t.x + 20,
          t.y + 29,
          26,
          locked ? "#627084" : INK,
        );
        text(
          ctx,
          done ? "✓ SOLVED" : locked ? "— LOCKED" : "↗ OPEN",
          t.x + 20,
          t.y + 59,
          10,
          done ? MINT : locked ? "#627084" : DIM,
          "monospace",
        );
      });
    control(ctx, s, "back", `←  ${C.BACK_LABEL}`);
    text(
      ctx,
      "ONE STUDY OPENS THE NEXT.",
      1175,
      656,
      12,
      DIM,
      "monospace",
      "right",
    );
  } else if (s.screen === "howto") {
    text(ctx, "A little light. A few simple rules.", 104, 146, 38);
    const sections = [
      [
        "01",
        "DRAW A CHANNEL",
        [
          "Each shape has two outlined emitters.",
          "Press one and drag through its filled lenses.",
          "Join the other outline to complete the beam.",
        ],
      ],
      [
        "02",
        "FOLLOW THE NODES",
        [
          "Move to any of the eight neighboring nodes,",
          "including diagonals. Never skip an empty cell",
          "or touch another channel’s shapes.",
        ],
      ],
      [
        "03",
        "SPEND THE CRYSTALS",
        [
          "Hexagons belong to every channel. Entering",
          "spends one charge; leave to finish crossing.",
          "Spend every charge, no more and no fewer.",
        ],
      ],
      [
        "04",
        "MAKE ROOM FOR LIGHT",
        [
          "Use each segment once. Beams cannot share",
          "segments, and diagonals cannot cross.",
          "A move that breaks a rule simply stays put.",
        ],
      ],
    ];
    sections.forEach(([num, title, lines], i) => {
      const x = 104 + (i % 2) * 576,
        y = 230 + Math.floor(i / 2) * 174;
      text(ctx, num as string, x, y, 13, MINT, "monospace");
      text(ctx, title as string, x + 40, y, 16, INK, "monospace");
      (lines as string[]).forEach((l, j) =>
        text(ctx, l, x + 40, y + 40 + j * 25, 17, DIM),
      );
    });
    text(
      ctx,
      "Release to keep a beam. Drag backward to undo. Grab an end to resume.",
      144,
      583,
      16,
      INK,
    );
    text(
      ctx,
      `${C.BINDINGS.clear[0].replace("Key", "")}  Clear board     ESC  Back     M  Sound     ↑ ↓  Choose     ENTER  Confirm`,
      288,
      653,
      13,
      DIM,
      "monospace",
    );
    control(ctx, s, "back", `←  ${C.BACK_LABEL}`);
  } else play(ctx, s);
  ctx.restore();
}
