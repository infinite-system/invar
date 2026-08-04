# THE LAW LIVES IN AGENTS.md — READ IT FULLY BEFORE ANY WORK

This file is a REDIRECT plus Claude-specific runtime notes. The single canonical source of this
repo's conventions, invariants, skills, and non-negotiable rules is **`AGENTS.md`** (which points
to `project.conventions.md`, the invariant contracts, and the skills). Do not act on this repo —
not even a "one-line fix" — before reading AGENTS.md. Nothing below is law; it is bun ergonomics.

---

## CONDUCTOR LAUNCH (preferred: fundamentals in the system prompt)

Launch conductor sessions with `bash scripts/claude-conductor.sh` — it
generates IBR + conductor doctrine into `tmp/` and appends them to the system
prompt, the only memory tier that survives compaction unread. State is NEVER
in the prompt; the newest `RESUME ANCHOR` on disk is always the state truth.

## CONDUCTOR RESUME (one-line entry point)

If the user says anything like "resume as conductor" / "continue the fleet",
do these IN ORDER — the drill of 2026-07-30 proved step 0 gets skipped
when it is not spelled out:

1. Run `bash scripts/resume-conductor.sh` and READ ITS ENTIRE OUTPUT — it
   prints the complete closure wholesale into your context (law, conventions,
   expression, reasoning, doctrine, then the newest RESUME ANCHOR), in order,
   with loud boundaries. There is nothing to skip and nothing further to
   dereference; a missing document fails the script loudly.
2. Act per the anchor at the end of that output.
3. On every LATER compaction inside the session: FIRST act is
   `bash scripts/recontext-conductor.sh` — read its whole output
   (anchor + fluency skills). State never lives in remembered summaries.

Two resurrection drills (2026-07-30) proved pointer-chains lose readers at
every hop; the script deletes the hops. Everything else is on disk.

---


Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
