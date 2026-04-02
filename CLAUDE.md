# Claude Code Instructions

## Before Starting Any Task

Read `architecture.md` at the beginning of every task to understand the current game structure, state model, rendering pipeline, and known issues before making changes.

## Project Context

This is a single-page browser game with no build step. All dependencies load via CDN import maps. The entire game logic lives in `App.js` (React component) and `index.html` (entry point with import map).

## Running Locally

Serve the project directory with any static HTTP server:
```
npx serve .
```
Then open the printed URL in a browser.
