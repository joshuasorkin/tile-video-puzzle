# Live Video Puzzle — Architecture

## Overview

A browser-based puzzle game where a playing video is sliced into an NxN grid of tiles, shuffled, and presented to the player. The player must drag tiles back to their correct positions while the video continues playing in real time across all tiles.

## Setting Selection

Before starting a game, the player configures two things:

1. **Video source** (one of three methods):
   - **Direct URL** — paste a direct link to an `.mp4`, `.webm`, `.ogv`, `.ogg`, `.mov`, or `.m4v` file.
   - **File upload** — select a local video file from disk (creates a `blob:` URL via `URL.createObjectURL`).
   - **Random video** — fetches a random video from the Wikimedia Commons API using movie/film-related search terms.
   - **Sample video** — a convenience button that fills in a bundled MDN sample video URL (`flower.mp4`).

2. **Grid size** — a slider from 2x2 (4 tiles) to 20x20 (400 tiles).

If no URL is provided, the sample video is used as a fallback.

## Objective

Rearrange all tiles so that every tile sits in its original grid position, restoring the coherent video image. The video keeps playing throughout, so the image on the tiles is constantly changing — the player must use spatial reasoning about the video content to identify where each tile belongs.

## Game States

| State      | `status`    | `isPlaying` | `isWon` | Description |
|------------|-------------|-------------|---------|-------------|
| **Idle**   | `'idle'`    | `false`     | `false` | Setup screen. Player configures video source and grid size. |
| **Loading**| `'loading'` | `false`     | `false` | Video is being fetched and loaded. Buttons disabled. |
| **Playing**| `'playing'` | `true`      | `false` | Puzzle is active. Tiles are shuffled and interactive. |
| **Won**    | `'playing'` | `true`      | `true`  | All tiles in correct positions. Victory overlay shown. |

Transitions:
- Idle -> Loading: player clicks Start, Upload, or Random Video.
- Loading -> Playing: video loads and begins playback; tiles are shuffled.
- Loading -> Idle: video fails to load (error shown).
- Playing -> Won: all tiles reach their home positions.
- Playing -> Idle: player clicks Reset.
- Won -> Playing: player clicks "Play Again" (re-shuffles the same video and grid size).

## Flow of Play

1. Player selects a video source and grid size, then clicks **Start** (or **Upload** / **Random Video**).
2. The video begins playing in a hidden `<video>` element with `loop` enabled.
3. `initPuzzle(gridSize)` creates an array of tile objects, each with an original position `(r, c)` and a shuffled current position `(currentR, currentC)`, using a Fisher-Yates shuffle on the position array.
4. A `requestAnimationFrame` loop (`renderFrame`) continuously reads frames from the hidden video and draws each tile's source region to the tile's current position on a visible `<canvas>`.
5. The player drags tiles (or tile clusters) to swap them toward their correct positions.
6. When every tile satisfies `t.r === t.currentR && t.c === t.currentC`, the game is won.

## Inputs and Outputs

### Inputs
- **Mouse/touch down** on a tile: selects the tile and its magnetic cluster for dragging. Both mouse and touch events are supported.
- **Mouse/touch move** while dragging: updates the visual position of the dragged cluster (rendered as a floating group with a blue border and drop shadow).
- **Mouse/touch up**: attempts to place the cluster at the target grid cell. Validates the move, applies displacement, or flashes red for invalid moves.
- **Hold "Peek Original"** button: temporarily shows the unscrambled video as a hint (rendered on the same canvas, in sync with the puzzle video).

Touch events for drag interactions are attached imperatively via `addEventListener` with `{ passive: false }` to allow `preventDefault()` (React 18 makes JSX touch handlers passive by default). The puzzle container also sets `touch-action: none` via inline style to prevent browser scroll/zoom interference.

### Outputs
- **Canvas rendering**: real-time video frames sliced and drawn per tile position each animation frame. When hint mode is active, the same canvas draws the full unscrambled video frame from the same `<video>` element, keeping playback in sync.
- **Audio feedback** via Tone.js `PolySynth`:
  - `move` — short C4 note on valid tile placement where no tiles land home.
  - `lock` — E4+G4 chord when any dragged tile lands in its home position (but the puzzle is not yet fully solved).
  - `win` — C4+E4+G4+C5 chord on victory.
- **Visual feedback**:
  - Dragged tiles render with a blue highlight border and floating shadow.
  - Invalid drop targets flash red for 220ms.
  - Victory overlay with animated checkmark and "PUZZLE SOLVED!" message.
- **Error messages**: displayed in a red alert box for invalid URLs, CORS failures, etc.

## External Data Sources and APIs

| Source | Usage | Endpoint |
|--------|-------|----------|
| **Wikimedia Commons API** | Random video search | `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=...&gsrnamespace=6&prop=imageinfo&iiprop=url|mime&format=json&origin=*` |
| **MDN Interactive Examples** | Default sample video | `https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4` |
| **esm.sh CDN** | Runtime dependencies (React 18, HTM, Lucide icons, Tone.js) | Import map in `index.html` |
| **Tailwind CDN** | CSS utility framework | `https://cdn.tailwindcss.com` |

All dependencies are loaded via CDN at runtime. There is no build step, no bundler, and no `node_modules`.

## Tile Locking (Magnetic Clusters)

Tiles that are **correctly positioned relative to each other** automatically form a "magnetic cluster." When the player clicks any tile in a cluster, the entire cluster is selected and moves as a unit.

### Cluster detection algorithm (`getTileGroup`)
Starting from a clicked tile, BFS expands to adjacent tiles (Manhattan distance = 1 in current-position space) that share the same displacement offset from their home position:
```
offsetR = tile.currentR - tile.r
offsetC = tile.currentC - tile.c
```
Two tiles belong to the same cluster if and only if:
1. They are orthogonally adjacent in their **current** grid positions.
2. They have the **same offset** — meaning they are in the correct positions relative to each other, even if the group as a whole is displaced from home.

A single tile with no matching neighbors is a cluster of size 1.

## Tile Displacement

When a dragged cluster is dropped onto cells occupied by other tiles, those tiles must be displaced. The displacement logic is the core complexity of the game engine.

### Move validation and displacement algorithm (`handlePointerUp`)

1. **Bounds check**: all tiles in the dragged group must land within the grid.
2. **Identify touched groups**: find all locked clusters among non-dragged tiles that have *any* overlap with the dragged group's target cells (`getLockedSubgroups` decomposes non-dragged tiles into their own clusters via repeated BFS). Both full and partial overlaps are treated the same — the entire touched cluster is displaced as a rigid unit.
3. **Board state tracking**: a `boardCellMap` maps each cell to its cluster for all untouched tiles. `fixedCells` tracks the dragged group's new position. `placedCells` tracks cells claimed by successfully placed displaced clusters. Displaced clusters are removed from `boardCellMap` when queued for placement.
4. **Cascading displacement placement**: each displaced cluster can be placed *anywhere* on the grid, not just in vacated cells:
   - The cluster's shape is normalized (relative to its top-left corner).
   - Every valid anchor position on the grid is evaluated.
   - Positions overlapping `fixedCells` or `placedCells` are rejected.
   - Positions overlapping untouched board clusters are allowed — those clusters are cascaded (removed from the board and queued for placement in turn).
   - The position with the smallest cascade footprint is preferred (0 = free cells only, no cascading needed).
   - Larger clusters are placed first (sorted by size descending).
5. **Cascade resolution**: displaced-by-cascade clusters go through the same placement process, potentially cascading further. A safety limit (`gridSize * gridSize` iterations) prevents runaway loops.
6. **Failure**: if any displaced cluster cannot be placed anywhere on the grid, the move is invalid. That specific cluster flashes red.
7. **Commit**: if all displaced clusters (including cascaded ones) find valid placements, all tile positions are updated atomically in a single `setTiles` call.

### Constraints
- Displacement always preserves cluster integrity — entire locked clusters are moved as rigid shapes, never split.
- Cascading can propagate through multiple layers of clusters. A single-tile drag can trigger a chain of cluster relocations across the board.
- The algorithm is greedy (largest-first placement, minimum-cascade preference). This may not find a solution in all theoretically solvable cases, but works well in practice.

## Victory Conditions

After every successful move, the game checks:
```js
newTiles.every(t => t.r === t.currentR && t.c === t.currentC)
```
If every tile's current position matches its original (home) position, the player wins. The victory state triggers:
- A win sound (C major chord).
- A green overlay with an animated bouncing checkmark.
- A "Play Again" button that re-shuffles the same grid and video.

There is no move counter, timer, or score. The sole objective is tile completion.

## UI Layout

The UI has two modes that share the same page:

### Settings screen (not playing)
- **Header**: title and subtitle.
- **Side panel** (left on desktop, stacked above on mobile): video URL input, sample video button, grid size slider, Start/Upload/Random Video buttons, tip box, error display.
- **Puzzle area** (right on desktop, below on mobile): empty placeholder prompting the user.
- Desktop uses a 1/3 + 2/3 grid layout (`lg:grid-cols-3`).

### Playing screen
- The settings panel, header, and side panel are **completely hidden**.
- The puzzle canvas takes the **full width** of the viewport.
- A compact **icon toolbar** is overlaid in the top-right corner of the canvas with three buttons:
  - **Peek** (Maximize icon) — hold to see the unscrambled video.
  - **Mute/Unmute** (Volume icon) — toggles video audio.
  - **Settings** (gear icon) — stops the game and returns to the settings screen.
- This design ensures mobile devices get maximum screen space for the puzzle.

## Rendering Pipeline

1. A hidden `<video>` element plays the source video on loop.
2. On each `requestAnimationFrame` tick, `renderFrame` reads the current video frame.
3. The video is aspect-ratio-fitted to the canvas (center-cropped to fill), computing source offsets.
4. If `showHint` is true, the full unscrambled frame is drawn to the canvas and the function returns early (no tile slicing).
5. Otherwise, for each tile, `ctx.drawImage()` copies the tile's home region from the video frame to the tile's current grid position on the canvas.
6. Thin white grid lines (10% opacity) are drawn over tile boundaries.
7. Dragged tiles are excluded from the main pass and drawn separately as a floating group following the cursor, with a drop shadow and blue border.
8. Invalid drop cells are overlaid with a semi-transparent red fill and red border for 220ms.

Canvas resolution is fixed at 1280x720 regardless of display size. CSS scales the canvas to fit.

## Known Issues

1. **No solvability guarantee**: the Fisher-Yates shuffle is fully random. There is no check that the resulting permutation is reachable through valid moves, nor that it isn't already solved. In practice, the magnetic cluster displacement system (which allows multi-tile swaps rather than just adjacent slides) makes most permutations reachable, but this is not formally verified.

2. **CORS restrictions**: many video URLs will fail because the `<video>` element is set to `crossOrigin="anonymous"` (required for canvas pixel access), but most video hosts don't serve CORS headers. The error message is generic.

3. **Random video retry is unbounded in network calls**: `tryFetch` retries up to 5 levels of recursion depth, but each level can make a network request. If the Wikimedia API consistently returns non-video results, this could mean several wasted requests before surfacing an error.

4. **No persistence**: game state is entirely in React component state. Refreshing the page loses everything.

## Resolved Issues

The following issues from the original architecture have been fixed:

- **Mobile touch/drag support**: full touch event support via imperative `addEventListener` with `{ passive: false }`. The puzzle container sets `touch-action: none` to prevent browser interference.
- **Hint peek sync**: the "Peek Original" feature now draws the unscrambled frame directly on the existing canvas from the same `<video>` element, keeping playback perfectly in sync. No second video element is created.
- **Lock sound**: the `lock` chord (E4+G4) now plays when any dragged tile lands in its home position after a move (but not on a full win, where the win chord plays instead).
- **Blob URL memory leak**: uploaded file blob URLs are tracked in a ref and revoked when replaced or on component unmount.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI framework | React 18 (via esm.sh CDN, no JSX — uses HTM tagged templates) |
| Styling | Tailwind CSS (CDN) |
| Video rendering | HTML5 Canvas 2D (`drawImage` from `<video>`) |
| Audio | Tone.js PolySynth |
| Icons | Lucide React |
| Build system | None (native ES modules, import maps) |
