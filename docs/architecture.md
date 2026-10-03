# Architecture

Instants is a React client UI rendered through Vinext's Next.js-compatible app structure. TypeScript describes components and shared data shapes. Vite and the existing Cloudflare/Sites scaffold provide development and build infrastructure. The social demo itself does not call a backend.

## Routes and rendering

`app/layout.tsx` sets metadata and brand CSS, loads the optional font stylesheet, and restores the saved theme before hydration. `app/page.tsx` mounts `InstantsApp`. The `/motion` route presents the reusable motion components in isolation.

Home, Explore, Reels, Messages, Saved, and Profile are views inside `InstantsApp`; they are not separate application routes. A seeded `?post=<id>` query opens a post detail dialog on initial load. New posts exist only in the current session, so their IDs do not create durable deep links.

## Component ownership

| Location | Responsibility |
| --- | --- |
| `components/instagram/app.tsx` | Navigation, shared session state, overlays, and per-view scroll positions |
| `components/instagram/post-card.tsx` | Feed presentation, photo navigation, and post actions |
| `components/instagram/views.tsx` | Explore, profile, messages, and still-photo Reels views |
| `components/instagram/overlays.tsx` | Stories, post details, search/activity, composer, and sharing |
| `components/instagram/instant-response.tsx` | Countdown, response choices, and poll result presentation |
| `components/instagram/shared.tsx` | Mock-derived types, account lookup, photos, avatars, and branding |
| `components/motion/carousel.tsx` | Shared scroll-snap carousel and input handling |
| `components/motion/motion-lab.tsx` | Interactive motion playground |
| `lib/motion.ts` | Shared motion configuration and helpers |
| `lib/motion-core.mjs` | Pure gesture, slide-index, and double-tap rules |
| `lib/motion-tokens.ts` | Motion JSON to CSS custom properties |
| `lib/brand.ts` | Brand JSON to theme CSS variables |
| `components/ui/` | Reusable UI primitives, including dialogs and menus |
| `app/globals.css` | Responsive layout, theme styling, and motion presentation |

The `instagram` directory name is a historical source path. Product naming and branding come from `config/brand.json`.

## State and data lifetime

`data/mock.json` seeds users, posts, conversations, comments, and Explore content. `InstantsApp` owns shared changes such as likes, saves, following, comments, messages, and instant responses. Child components receive values and callbacks so the feed and post details reflect the same session state.

| State | Lifetime |
| --- | --- |
| Seed data | Versioned JSON; loaded with the application |
| Likes, saves, following, replies, new posts, messages | Current application session; reset on refresh |
| Instant deadlines | Calculated from the current time when the app opens; reset on refresh |
| Per-view scroll positions | Current mounted application session |
| Profile edits | Local profile preview |
| Selected theme | `ig-ui-theme` in localStorage |
| Selected upload | Read locally with `FileReader` and used as an in-memory image preview |

New posts receive a 30-minute response window. Story replies and shares update demo conversations; they do not send messages to real people. There is no account authentication or persistent social database behind these interactions.

## Configuration and external assets

`config/brand.json` controls metadata, labels, logos, typography, theme colors, and dock appearance. `lib/brand.ts` converts those values to CSS custom properties. `config/motion.json` supplies the shared motion timings and gesture thresholds described in [motion.md](motion.md).

The browser loads remote Unsplash images and the optional font stylesheet directly. The `Photo` component displays an accessible fallback when an image fails. To remove those network dependencies, use local images under `public/` and clear or replace `fontStylesheet`.

When supported by the host, `use-theme-tool.ts` registers an optional, feature-detected theme control through `document.modelContext`. The ordinary theme toggle works without that capability.

## Build and hosting boundary

`scripts/run-framework.mjs` selects the configured execution profile and runs the development or build command. A normal clone can use the safe `build/hosting.example.json` template; an optional `.openai/hosting.json` can override it for a specific environment. Keep that local hosting identity out of contributions.

`build/`, `scripts/`, and the connector-related helpers contain hosting infrastructure inherited from the starter. The presence of database packages, connector helpers, or worker bindings does not mean the demo's likes, messages, or uploads are stored remotely. Adding a real backend requires explicit work on authentication, authorization, storage, validation, and the UI's persistence contract.

## Extension points

Start with JSON changes for branding or sample content. Add new social behaviors through the existing state owner and callbacks, keeping shared state consistent across views. Put reusable motion behavior in `components/motion/` or `lib/motion.ts` and demonstrate it on `/motion`. Preserve visible controls, keyboard access, and reduced-motion behavior alongside gesture support.
