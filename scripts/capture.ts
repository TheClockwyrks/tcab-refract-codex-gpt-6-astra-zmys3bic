// Run with the Vite dev server running: node scripts/capture.ts
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  await page.goto("http://localhost:5173");
  await page.waitForTimeout(300);
  mkdirSync("showcase", { recursive: true });
  await page.screenshot({ path: "showcase/title.png" });
  // An isolated capture page stands up the real game through its engine. The
  // production entry point stays untouched and publishes no page globals.
  await page.route("**/capture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body style="margin:0"><canvas id="capture" style="width:1280px;height:720px"></canvas></body></html>',
    }),
  );
  await page.goto("http://localhost:5173/capture");
  const capture = await page.evaluate(async () => {
    const enginePath = "/node_modules/@clockwyrks/simple-2d/dist/index.js";
    const gamePath = "/src/game.ts",
      campaignPath = "/src/campaign.ts",
      solverPath = "/src/solver.ts",
      rulesPath = "/src/rules.ts";
    const { createEngine, ConstantClock } = await import(enginePath);
    const { game, BACKGROUND } = await import(gamePath);
    const { CAMPAIGN } = await import(campaignPath);
    const { analyze } = await import(solverPath);
    const { cellX, cellY } = await import(rulesPath);
    const canvas = document.querySelector("canvas")!;
    const engine = createEngine({
      canvas,
      width: 1280,
      height: 720,
      game,
      background: BACKGROUND,
      clock: new ConstantClock(1000 / 30),
    });
    await engine.initialize();
    engine.apply((s) => ({ ...s, boardIndex: 16 }));
    engine.apply((s) => engine.debug.loadBoard(s, CAMPAIGN[16]));
    const solution = analyze(engine.state.board).solution;
    let picture = "";
    engine.startRecording();
    await engine.advance(15);
    for (const [i, beam] of solution.entries()) {
      for (const [j, cell] of beam.cells.entries()) {
        engine.apply((s) =>
          engine.debug[j === 0 ? "pointerDown" : "pointerMove"](
            s,
            cellX(cell.col, s.board.cols),
            cellY(cell.row, s.board.rows),
            "mouse",
          ),
        );
        await engine.advance(5);
      }
      engine.apply((s) => engine.debug.pointerUp(s));
      await engine.advance(7);
      if (i === 1) picture = canvas.toDataURL("image/png");
    }
    await engine.advance(35);
    const recording = engine.stopRecording();
    if (engine.state.screen !== "solved")
      throw new Error("Capture did not solve the board");
    engine.destroy();
    return { recording, picture };
  });
  writeFileSync(
    "showcase/trace.json.gz",
    gzipSync(JSON.stringify(capture.recording)),
  );
  writeFileSync(
    "showcase/bench.png",
    Buffer.from(capture.picture.split(",")[1], "base64"),
  );
} finally {
  await browser.close();
}
