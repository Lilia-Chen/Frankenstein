# Frankenstein Monorepo Agents Guide

This repo is a small pnpm monorepo. The primary app is the Vite + React front end in `apps/motion-gen-web`.

## Quick Commands
1. `pnpm dev` (from repo root) runs the front end.
2. `pnpm build` (from repo root) builds the front end.
3. `pnpm lint` (from repo root) lints the front end.

## Front End Architecture
1. Main app entry: `apps/motion-gen-web/src/App.tsx`.
2. MMD viewer: `apps/motion-gen-web/src/components/Viewer.tsx`.
3. Motion streaming: `apps/motion-gen-web/src/motion/ws-client.ts`.
4. Motion playback buffering: `apps/motion-gen-web/src/motion/player.ts`.
5. Motion-to-bone adapter: `apps/motion-gen-web/src/motion/adapter.ts`.
6. WebSocket/frames typing: `apps/motion-gen-web/src/types/motion.ts`.
7. Overlay UI styling: `apps/motion-gen-web/src/styles.css`.

## Motion Streaming Contract
1. WebSocket default URL: `ws://localhost:8000/ws/motion`.
2. Frames are streamed in order; each frame includes root translation + rotation and 22 joint quaternions.
3. Coordinate system: Y-up (Three.js standard). Units are meters.
4. Root bone in MMD is mapped to `センター` in the adapter.

## Common Tasks
1. If motion looks wrong, check `apps/motion-gen-web/src/motion/adapter.ts`.
2. If playback timing is off, check `apps/motion-gen-web/src/motion/player.ts`.
3. If connection issues occur, check `apps/motion-gen-web/src/motion/ws-client.ts`.

## Style Expectations
1. Keep UI changes minimal and functional; use the existing panel styles in `apps/motion-gen-web/src/styles.css`.
2. Prefer small, focused components to avoid re-rendering the Three.js canvas.
