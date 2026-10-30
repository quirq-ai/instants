#!/usr/bin/env node
// Make a video for one Instants post.
//   npm run video -- <slug> [--aspect 9:16|1:1|16:9] [--length 45]
//   INSTANTS_VIDEO_DRY=1 npm run video -- <slug>    simulated agent, tiny test mp4
import { runVideo } from "../research/video.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const values = new Set([opt("--aspect"), opt("--length")]);
const slug = args.find((a) => !a.startsWith("--") && !values.has(a));
if (!slug) {
  console.error("usage: npm run video -- <slug> [--aspect 9:16] [--length 45]");
  process.exit(1);
}
const controller = new AbortController();
process.on("SIGINT", () => controller.abort(new Error("interrupted")));
let seen = 0;
const status = await runVideo({
  slug,
  aspect: opt("--aspect") ?? "9:16",
  length: Number(opt("--length") ?? 45),
  signal: controller.signal,
  onStatus(s) {
    for (const line of s.log.slice(Math.min(seen, s.log.length))) console.log(`[${s.stage ?? s.state}] ${line.text}`);
    seen = s.log.length;
  },
});
console.log(JSON.stringify(status, null, 2));
process.exit(status.state === "ready" ? 0 : 1);
