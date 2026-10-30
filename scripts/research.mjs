#!/usr/bin/env node
// Turn local research folders into Instants posts.
//   npm run research                    every folder under the default roots (cached)
//   npm run research -- --force         regenerate everything
//   npm run research -- <path...>       only these folders or files
//   npm run research -- --concurrency 2
import path from "node:path";
import { DEFAULT_ROOTS, runGeneration, scanRoots } from "../research/engine.mjs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const ci = args.indexOf("--concurrency");
const concurrency = ci >= 0 ? Number(args[ci + 1]) || 3 : 3;
const paths = args.filter((a, i) => !a.startsWith("--") && !(ci >= 0 && i === ci + 1)).map((p) => path.resolve(p));

let targets = paths;
if (!targets.length) {
  const status = await scanRoots(DEFAULT_ROOTS);
  targets = status.flatMap((root) => root.folders.filter((f) => f.state !== "skipped").map((f) => f.path));
  console.log(`scanned ${DEFAULT_ROOTS.join(", ")}: ${targets.length} items`);
}

const started = Date.now();
const secs = () => `${((Date.now() - started) / 1000).toFixed(0)}s`.padStart(5);
await runGeneration({
  targets,
  force,
  concurrency,
  onEvent(event) {
    if (event.type === "start") console.log(`generating ${event.total} item(s)${force ? " (force)" : ""}`);
    else if (event.type === "stage") console.log(`${secs()}  ${event.name.padEnd(28)} ${event.stage}${event.detail ? `: ${event.detail}` : ""}`);
    else if (event.type === "done") console.log(`${secs()}  ${event.name.padEnd(28)} done -> ${event.slug}`);
    else if (event.type === "error") console.error(`${secs()}  ${event.name.padEnd(28)} FAILED: ${event.message}`);
    else if (event.type === "end") console.log(`finished: ${event.posts} posts, ${event.failed} failed`);
  },
});
