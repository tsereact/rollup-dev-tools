## Motivation

- HMR for Rollup that works both in the Browser and in Node
- Provide tooling around prebuilding so that only your source code changes in dev
- Keep the amount of magic low.
- Keep the dev build similar to the prod build.

## Build Instructions
```
yarn build:plugins
cd experiments/react-hmr
yarn dev --watch
```

