# Contributing to Panelyt

Thanks for your interest in contributing!

## Development Setup

1. Install [uv](https://github.com/astral-sh/uv) and [pnpm](https://pnpm.io/installation)
2. Clone the repo and run:
   ```bash
   make install-api
   make install-web
   ```
3. Copy `.env.example` files and configure your environment
4. Run `make dev-api` and `make dev-web` in separate terminals

## Making Changes

1. Fork the repo and create a branch from `master`
2. Make your changes
3. Run checks: `make check`
4. Run tests: `make test-api`
5. Open a pull request

## Commit Style

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new features
- `fix:` bug fixes
- `chore:` maintenance
- `docs:` documentation

## Code Style

- **Python:** Follow existing patterns, use type hints
- **TypeScript:** Run `pnpm lint` and `pnpm typecheck`
- Match the style of surrounding code

## Questions?

Open an issue for discussion before starting major changes.
