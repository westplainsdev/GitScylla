# Git Client

Standalone Electron Git client: React renderer, TypeScript everywhere, git ops in the
main process via `simple-git` (shells out to the system `git` — SSH agents and credential
helpers work transparently).

## Run

```bash
npm install
env -u ELECTRON_RUN_AS_NODE npm run dev   # ELECTRON_RUN_AS_NODE=1 is set in this
                                        # machine's env; it makes Electron run as
                                        # plain Node and the app silently dies
npm run typecheck
npm run build:linux                     # package via electron-builder
```

## Architecture

- `src/shared/types.ts` — `GitApi` contract + domain types shared by all three layers.
- `src/main/` — `git-service.ts` (all git operations) + `index.ts` (window, IPC handlers,
  `fs.watch` on the repo dir → `repo:changed` events for auto-refresh).
- `src/preload/` — exposes `window.api` (typed `GitApi`) via contextBridge.
- `src/renderer/src/` — zustand `store.ts` is the single state source; `graph.ts` is the
  commit-lane assignment algorithm (expects `--topo-order` input, children before parents;
  first-parent chains hold the leftmost column, like `git log --graph`).

## Notes for future work

- `electron-vite dev` hot-reloads `src/renderer/` but does **not** reliably rebuild/relaunch
  on `src/main/` or `src/preload/` changes — restart the dev command after touching those.
- Commit log uses `git log --all --topo-order --decorate=short` with `\x1f`/`\x1e`
  separators; capped at 500 — needs "load more" + virtualization next.
- To go fully standalone (no system git), swap `simple-git` for `dugite` behind the same
  `GitApi` interface — nothing else should need to change.
