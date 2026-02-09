# Frankenstein

Motion generation frontend monorepo scaffold.

## Structure

- `apps/motion-gen-web`: Main web app (React + Vite + TypeScript + Three.js).
- `packages`: Reserved for shared packages (e.g. future protocol libs, VRC integration helpers).

## Development

- Install dependencies:
  - `make setup`
  - or `pnpm install`
- Start frontend app:
  - `make dev`
  - or `pnpm dev`
- Build:
  - `make build`
  - or `pnpm build`

Default frontend port is `5173`.

## Backend note

Backend service is intentionally not implemented in this repository for now.
Run backend separately in your WSL workspace and expose WebSocket endpoint:

- `ws://localhost:8000/ws/motion`

Frontend reads this value from `apps/motion-gen-web/.env.development`.

## Next step

Protocol types currently live in `apps/motion-gen-web/src/types/motion.ts`.
When multiple apps/packages need them, move them into `packages/protocol`.
