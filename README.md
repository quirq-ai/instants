# Instants

Instants turns folders of past research and experiments into Instagram-style carousel posts, so you can browse, rediscover and showcase your work. Drop in new data in any format (notes, CSV, JSON, images, code) and it becomes a new post.

The library of posts is called **Curie**, after Marie Curie, who kept meticulous notebooks of every experiment.

## Run it

Use Node.js 22.13 or newer.

```bash
npm install
npm run dev        # http://localhost:5180
```

Pages: Feed (`/`), Library, Topics, Insights, Sources (scan and generate), Add (upload new data), and a slide gallery at `/dev/slides`.

## Generate posts

```bash
npm run research                    # new and changed folders under the default roots
npm run research -- --force         # regenerate everything
npm run research -- path/to/folder  # specific folders
npm run research -- --concurrency 3
```

Each folder is read (all formats, git history, images), summarized into a numbered source list, and sent to Claude, which returns a structured post. Records are written to the content store's `posts/<slug>.json` and media to its `media/<slug>/` (served at `/research/media/...`). The same engine runs from the Sources and Add pages.

## Content store and Spacehub sync

Everything Instants generates lives in one store directory:

```
posts/<slug>.json          post records
media/<slug>/*             slide images        -> /research/media/<slug>/<file>
videos/<slug>.mp4|.jpg     videos and posters  -> /research/videos/<slug>.mp4
videos/<slug>.status.json  ready render result
sources/<slug>/*           uploaded sources (+ .upload.json)
instants.json, README.md   manifest and layout notes
```

The store is `.research-cache/store/` until a space is connected, then the Spacehub clone at `.research-cache/space/<space>__<project>/`. Per-user state stays outside it: `activity.json` (saves, pins, notes, reads), `sources.json` (scan cache), `space.json` (space config), `space-pending.json` (auto-generate failures) and `videos-work/<slug>/` (video agent working dirs and live status).

`npm run migrate-store` moves content from the older layout (`public/research`, `.research-cache/posts|uploads|videos`) into the store. It is idempotent and also runs on server start.

On Sources, the **Space** card connects a Spacehub project (default `quirq/curie`): it checks access with `spacehub project view`, clones (or adopts an existing clone), copies local content in without deleting anything remote, and runs `spacehub project sync --auto --interval 5` as a supervised child (restarted with backoff; a conflict, exit 2, pauses sync until you resolve it). Sources that arrive from the space without a post are listed as pending; with Auto-generate on they are posted automatically, one at a time. Disconnect copies the space content back to the local store.

Test overrides: `INSTANTS_SPACEHUB_BIN` (the CLI used for view/clone/sync) and `INSTANTS_SPACE_SYNC_CMD` (a shell command run instead of the sync).

## How generation auth works

- If `ANTHROPIC_API_KEY` is set, the engine calls the Anthropic API directly from the server.
- Otherwise it shells out to the local `claude` CLI, using whatever login that CLI has (`claude /login`).

All model calls happen server-side. The browser never sees a key, and the API routes only accept loopback requests.

## Stack

Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui primitives. No database: everything lives in `.research-cache/`.
