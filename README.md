## Motivation

- HMR for Rollup that works both in the Browser and in Node.
- Provide tooling around prebuilding so that only your source code emits chunks in dev.
- Keep the amount of magic low.
  - No magic HMR-spooky dev server.
  - No magic in-memory dev server.
- Keep the dev build similar to the prod build "as much as possible".

## Build Instructions
```
NOTE: Requires Node 16.x
yarn 
yarn build:plugins
cd experiments/react-hmr
yarn dev --watch
```
