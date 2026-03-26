# Contributing to OpenClaw Enchante

Thank you for contributing. This project is maintained by **Enchante** as a customized installer for [OpenClaw](https://github.com/openclaw/openclaw).

## Development setup

- Node.js **v22.12+**
- npm
- macOS or Windows (for platform-specific packaging)

```bash
git clone <your-fork-or-internal-remote-url>
cd openclaw-enchante
npm install
npm run dev
```

## Scripts

| Command             | Description        |
| ------------------- | ------------------ |
| `npm run dev`       | Development mode   |
| `npm run build`     | Typecheck + build  |
| `npm run lint`      | ESLint             |
| `npm run format`    | Prettier           |
| `npm run typecheck` | TypeScript checks  |
| `npm run build:win-local` | Windows installer (local, no publish) — see **[docs/BUILD-WINDOWS.md](docs/BUILD-WINDOWS.md)** if the build waits on “file locked / virus scanner” |


## Product principles (read first)

**[docs/PRODUCT-PRINCIPLES.md](docs/PRODUCT-PRINCIPLES.md)** — Enchante targets **non-developers**. Do not treat “open PowerShell/WSL and run `openclaw …`” as the default user fix; encapsulate flows in the app (IPC/UI). Cursor loads **`.cursor/rules/enchante-user-first.mdc`** for the same expectations.

## Architecture

See **[docs/APP-ARCHITECTURE.md](docs/APP-ARCHITECTURE.md)** for the wizard flow, main services, and IPC rules.

When adding an IPC channel:

1. `src/main/ipc-handlers.ts` — register handler  
2. `src/preload/index.ts` — expose on `electronAPI`  
3. `src/preload/index.d.ts` — TypeScript types  

## Pull requests

1. Create a branch from the default branch  
2. Make changes; run `npm run typecheck` and `npm run lint`  
3. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …)  
4. Open a PR with a clear description and test notes  

## Reporting issues

Use the issue templates in `.github/ISSUE_TEMPLATE/` on your hosting platform, or describe:

- OS and app version  
- Steps to reproduce  
- Expected vs actual behavior  
- Logs (redact secrets)  

## Code style

- Prettier: single quotes, no semicolons, 100 char width (see repo config)  
- Comments in code: **English**  

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
