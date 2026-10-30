// PNG export for live slides. Renders the slide node at its 1080x1350 design size.

import { SLIDE_W } from "./palette";

async function renderPng(element: HTMLElement) {
  const { toPng } = await import("html-to-image");
  const width = element.offsetWidth || SLIDE_W;
  const options = { pixelRatio: SLIDE_W / width, cacheBust: true };
  try {
    return await toPng(element, options);
  } catch {
    // Cross-origin font CSS can fail to embed; retry with system fallbacks.
    return await toPng(element, { ...options, skipFonts: true });
  }
}

/** Render a slide element to PNG and save it. Returns the data URL. */
export async function exportSlidePng(element: HTMLElement, filename: string) {
  const url = await renderPng(element);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return url;
}

/** Download the slide inside `node` (or `node` itself if it is the slide). */
export function downloadSlide(node: HTMLElement, filename: string) {
  const el = node.matches("[data-slide]") ? node : (node.querySelector<HTMLElement>("[data-slide]") ?? node);
  return exportSlidePng(el, filename);
}
