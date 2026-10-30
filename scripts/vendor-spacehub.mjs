// Copy the globally installed spacehub CLI into .spacehub-cli/ so `docker build`
// can install it. The folder is gitignored: the CLI is private to quirq.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const bin = execFileSync("sh", ["-c", "command -v spacehub"], { encoding: "utf8" }).trim();
if (!bin) throw new Error("spacehub is not on PATH");
const pkg = path.resolve(path.dirname(fs.realpathSync(bin)), "..");
const out = path.resolve("./.spacehub-cli");
fs.rmSync(out, { recursive: true, force: true });
for (const entry of ["package.json", "bin", "dist"]) fs.cpSync(path.join(pkg, entry), path.join(out, entry), { recursive: true });
console.log(`Copied ${pkg} to ${out}`);
