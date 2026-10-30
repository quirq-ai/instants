# Recall

Recall turns folders of past research and experiments into Instagram-style carousel posts, so you can browse, rediscover and showcase your work. Drop in new data in any format (notes, CSV, JSON, images, code) and it becomes a new post.

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

Each folder is read (all formats, git history, images), summarized into a numbered source list, and sent to Claude, which returns a structured post. Records are written to `.research-cache/posts/<slug>.json` and media to `public/research/media/<slug>/`. The same engine runs from the Sources and Add pages.

## How generation auth works

- If `ANTHROPIC_API_KEY` is set, the engine calls the Anthropic API directly from the server.
- Otherwise it shells out to the local `claude` CLI, using whatever login that CLI has (`claude /login`).

All model calls happen server-side. The browser never sees a key, and the API routes only accept loopback requests.

## Stack

Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui primitives. No database: everything lives in `.research-cache/`.
