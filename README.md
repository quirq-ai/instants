# Instants

Instants turns folders of past research and experiments into Instagram-style carousel posts, so you can browse, rediscover and showcase your work. Drop in new data in any format (notes, CSV, JSON, images, code) and it becomes a new post.

The library of posts is called **Curie**, after Marie Curie, who kept meticulous notebooks of every experiment.

## Run it

Use Node.js 22.13 or newer.

```bash
npm install
npm run dev        # http://localhost:5180
```

Pages: Feed (`/`, with an All posts / Videos filter), Library, Topics, Videos, Insights, Sources (scan, generate, Space), Add (upload new data), Unlock (deploys only), and a slide gallery at `/dev/slides`.

Copy `.env.example` to `.env.local` for anything beyond the defaults. Nothing is required locally: without `ANTHROPIC_API_KEY` generation uses your `claude` login.

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

## Videos

Any post can become a short video from its Video panel (or `npm run video -- <slug> --aspect 9:16 --length 30`). An unattended local `claude` agent runs the HyperFrames skill with shell and file tools in `.research-cache/videos-work/<slug>/` and writes the mp4 and poster into the store. It needs a logged-in `claude` CLI with the HyperFrames skill and `ffmpeg`, so it works on a dev machine, not in the container.

## Deploy

The image serves the app on port 3000 and reads its library from Curie (or any Spacehub project).

```bash
npm run vendor:spacehub   # copy your private spacehub CLI into .spacehub-cli/ (gitignored)
docker build --platform linux/amd64 -t registry.xo.builders/instants-xo-tpbhrsi/app:latest .
docker push registry.xo.builders/instants-xo-tpbhrsi/app:latest
```

Without `.spacehub-cli/` the image still builds, but space sync is off and the library starts empty.

Set these on the deployment:

| Variable | Required | What it does |
|---|---|---|
| `SPACEHUB_TOKEN` | for sync | Output of `spacehub auth token`. The entrypoint logs the CLI in with it on start. |
| `INSTANTS_SPACE` | for sync | Project to connect on first boot, e.g. `quirq/curie`. |
| `INSTANTS_ADMIN_TOKEN` | for actions | Any long random string. Open `/unlock` and enter it to save, note, generate and manage the space from a non-localhost domain. Unset, the production server refuses every action and the site is read-only (only `next dev` trusts localhost). |
| `ANTHROPIC_API_KEY` | for generation | Generates posts through the API (the container has no `claude` login). |
| `SPACEHUB_SERVER` | no | Hub other than `wss://hub.quirq.dev`. |
| `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL` | no | Identity for sync commits (default `Instants`). |
| `INSTANTS_ROOTS` | no | Colon-separated folders to scan (default `/research` in the image). Mount research there. |

Mount a named volume at `/app/.research-cache` (a bind mount must be owned by uid 1000) to keep the clone, saves and notes across restarts. Generate a token with `openssl rand -hex 32`.

```bash
docker run -p 3000:3000 \
  -e SPACEHUB_TOKEN="$(spacehub auth token)" -e INSTANTS_SPACE=quirq/curie \
  -e INSTANTS_ADMIN_TOKEN=change-me -e ANTHROPIC_API_KEY=sk-ant-... \
  -v instants-cache:/app/.research-cache \
  registry.xo.builders/instants-xo-tpbhrsi/app:latest
```

## Deploy on Vercel

Vercel has no disk and no background processes, so there the app is a view-only frontend over Spacehub: the public project in `INSTANTS_SPACE` is the database. Posts are read from the hub's raw file URLs (cached for `INSTANTS_REVALIDATE` seconds), slide images and videos redirect to the hub, and saving, notes, generating, videos and Space sync are hidden. New posts made on your Mac or in the Docker image reach the site once they sync to the project.

Import the repo in Vercel (framework Next.js, the defaults in `vercel.json`) and set:

| Variable | Required | What it does |
|---|---|---|
| `INSTANTS_SPACE` | yes | Public Spacehub project to read, e.g. `quirq/curie`. |
| `INSTANTS_REVALIDATE` | no | Seconds before posts are re-read from the hub (default `60`). |
| `INSTANTS_BRANCH` | no | Branch to read (default `main`). |
| `SPACEHUB_HTTP` | no | Hub web address (default `https://hub.quirq.dev`, or derived from `SPACEHUB_SERVER`). |
| `INSTANTS_STORE` | no | `hub` or `local`. Hub mode turns on by itself when `VERCEL` is set. |

The project must be public: the hub ignores tokens on raw file URLs. `SPACEHUB_TOKEN`, `INSTANTS_ADMIN_TOKEN` and `ANTHROPIC_API_KEY` are not used on Vercel. Try hub mode locally with `INSTANTS_STORE=hub npm run build && INSTANTS_STORE=hub npx next start`.

## How generation auth works

- If `ANTHROPIC_API_KEY` is set, the engine calls the Anthropic API directly from the server.
- Otherwise it shells out to the local `claude` CLI, using whatever login that CLI has (`claude /login`).

All model calls happen server-side. The browser never sees a key. Under `next dev` the API routes accept loopback requests; a production server (including the Docker image) never trusts the Host header and only accepts, when `INSTANTS_ADMIN_TOKEN` is set, same-origin requests carrying the httpOnly cookie that `/unlock` sets.

## Stack

Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui primitives. No database: everything lives in `.research-cache/`.
