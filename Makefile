setup:
	pnpm install

dev:
	pnpm --filter motion-gen-web dev

build:
	pnpm --filter motion-gen-web build

lint:
	pnpm --filter motion-gen-web lint

