# Refract

Draw the light. Refract is a browser puzzle played on a dark optical bench: trace a beam between matching emitters, thread every lens, and spend every crystal charge. Play 24 hand-built Campaign studies or an endless, increasingly difficult Cascade.

## Run

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. No backend, network services, downloaded assets, or credentials are needed by the game.

## Build

```sh
npm run build
```

Serve `dist/` from the root of any static server. `npm run preview` serves the production build locally.

## Controls

- **Mouse, pen, or touch:** press an outlined emitter and drag through adjacent nodes. Release to keep the beam.
- **Undo:** drag back one node. Grab either end to resume, or grab an unshared interior node to shorten the beam.
- **R / CLEAR:** clear the current board.
- **Arrow keys / WASD:** choose a menu item or campaign board.
- **Enter / Space:** confirm. **Escape / BACK:** return.
- **M:** mute. **Backtick:** engine diagnostics.

Every menu also supports pointer and touch input. Progress lasts for the current session. There is no timer or move limit.

## Development and verification

The Simple 2D engine owns input, frames, canvas fitting, synthesized audio, and recording. The simulation returns immutable state transitions; rendering reads that state. `engine.debug` provides the specified board, pointer, progression, and snapshot operations without installing browser globals.

Cascade independently draws its dimensions, mutates certified starting layouts, and exhaustively checks candidates for routes, solutions, determined segments, branching, and shared crystals. A bounded search falls back to the certified starting layout rather than emitting an unverified puzzle. Its solver has no authority over player input; it verifies generation and automated playthroughs.

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests stand up the real engine over a Node canvas and counted clock. They cover all campaign solutions, generated boards, state transitions, input, and audio.

The `showcase/` directory contains the player description, screenshots, and a draw-command replay. To recapture it with the dev server running, use `node scripts/capture.ts`. Capture uses project-local Playwright with Chromium's `--no-sandbox` flag.
