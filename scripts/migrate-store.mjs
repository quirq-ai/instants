#!/usr/bin/env node
// Move generated content from the old layout (public/research, .research-cache/posts|uploads|videos)
// into the content store. Safe to run any number of times.
import { migrateStore } from "../research/store.mjs";

const result = await migrateStore();
console.log(`store: ${result.store}`);
for (const [what, n] of Object.entries(result.moved)) console.log(`  ${what.padEnd(10)} ${n}`);
