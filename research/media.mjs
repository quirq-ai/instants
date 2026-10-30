// Media: pick real images (and SVG diagrams) from a research folder and copy
// them, downscaled, into public/research/media/<slug>/.
import fs from "node:fs/promises";
import path from "node:path";
import { IMAGE_EXT, run } from "./collect.mjs";

const MAX_MEDIA = 8;
const SKIP_NAME = /icon|favicon|logo|avatar|sprite|apple-touch|grain|noise|texture/i;
const PREFER_NAME = /screenshot|scene|render|demo|(^|[^a-z])og([^a-z]|$)|banner|hero|preview|snapshot|frame|result|chart|plot|figure/i;
const SKIP_PATH = /(^|\/)(node_modules|dist|build|out|target|\.next|coverage|venv|__pycache__|textures?|tex|fonts?)\//;

async function dimensions(file) {
  try {
    const { stdout } = await run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
    const w = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
    const h = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);
    return w && h ? { width: w, height: h } : null;
  } catch {
    return null;
  }
}

async function svgDimensions(file) {
  const text = await fs.readFile(file, "utf8").catch(() => "");
  const box = text.match(/viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (box) return { width: Math.round(Number(box[1])), height: Math.round(Number(box[2])) };
  const w = Number(text.match(/<svg[^>]*\swidth=["']([\d.]+)/)?.[1]);
  const h = Number(text.match(/<svg[^>]*\sheight=["']([\d.]+)/)?.[1]);
  return w && h ? { width: w, height: h } : null;
}

/** Choose up to 8 images worth showing. Returns planned media with final URLs. */
export async function pickMedia(listing, slug) {
  const candidates = listing.files.filter((f) => {
    const e = path.extname(f.rel).toLowerCase();
    if (SKIP_PATH.test(f.rel) || SKIP_NAME.test(path.basename(f.rel))) return false;
    if (IMAGE_EXT.has(e)) return f.size >= 30 * 1024 && f.size <= 8 * 1024 * 1024;
    if (e === ".svg") return f.size > 4 * 1024 && f.size <= 2 * 1024 * 1024;
    return false;
  });
  const score = (rel) =>
    (PREFER_NAME.test(rel) ? 10 : 0) - (/texture|tiles?\/|maps?\//i.test(rel) ? 6 : 0) -
    (path.extname(rel).toLowerCase() === ".svg" ? 2 : 0) - rel.split("/").length * 0.1;
  // At most 4 per directory, evenly spread across a sorted run (e.g. video frames).
  const byDir = new Map();
  for (const f of candidates) {
    const dir = path.dirname(f.rel);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(f);
  }
  const spread = [];
  for (const files of byDir.values()) {
    files.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
    const take = Math.min(4, files.length);
    for (let i = 0; i < take; i++) spread.push(files[Math.round((i * (files.length - 1)) / Math.max(1, take - 1))]);
  }
  const scored = [...new Set(spread)]
    .map((f) => ({ f, score: score(f.rel) }))
    .sort((a, b) => b.score - a.score || b.f.size - a.f.size)
    .slice(0, 40);

  const picked = [];
  let svgs = 0;
  for (const { f } of scored) {
    if (picked.length >= MAX_MEDIA) break;
    const e = path.extname(f.rel).toLowerCase();
    const isSvg = e === ".svg";
    if (isSvg && svgs >= 2) continue;
    const dim = isSvg ? await svgDimensions(f.full) : await dimensions(f.full);
    if (!dim) continue;
    const aspect = dim.width / dim.height;
    if (aspect < 0.4 || aspect > 2.5) continue;
    if (!isSvg && Math.min(dim.width, dim.height) < 500) continue;
    const n = picked.length + 1;
    const outExt = isSvg ? ".svg" : e === ".gif" ? ".gif" : e === ".png" && f.size > 600 * 1024 ? ".jpg" : e === ".jpeg" ? ".jpg" : e;
    const longest = Math.max(dim.width, dim.height);
    const scale = !isSvg && e !== ".gif" && longest > 1400 ? 1400 / longest : 1;
    picked.push({
      source: f.full,
      original: f.rel,
      url: `/research/media/${slug}/${n}${outExt}`,
      outExt,
      width: Math.round(dim.width * scale),
      height: Math.round(dim.height * scale),
      svg: isSvg,
    });
    if (isSvg) svgs++;
  }
  return picked;
}

/** Copy planned media into public/research/media/<slug>/ (replacing what was there). */
export async function copyMedia(appRoot, slug, planned) {
  const dir = path.join(appRoot, "public", "research", "media", slug);
  await fs.rm(dir, { recursive: true, force: true });
  if (!planned.length) return [];
  await fs.mkdir(dir, { recursive: true });
  const urls = [];
  for (const m of planned) {
    const out = path.join(dir, path.basename(m.url));
    try {
      if (m.svg || m.outExt === ".gif") await fs.copyFile(m.source, out);
      else {
        const args = ["-Z", "1400"];
        if (m.outExt === ".jpg") args.push("-s", "format", "jpeg", "-s", "formatOptions", "82");
        await run("sips", [...args, m.source, "--out", out]);
      }
      urls.push(m.url);
    } catch {}
  }
  return urls;
}
