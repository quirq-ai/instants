import type { Slide as SlideData } from "@/lib/research/types";
import { cn } from "@/lib/utils";
import { Slide } from "./slide";

/** Static, non-interactive slide preview for grids. */
export function SlideThumb({ slide, accent, title, className }: { slide?: SlideData; accent: string; title?: string; className?: string }) {
  return (
    <div aria-hidden inert className={cn("pointer-events-none select-none overflow-hidden rounded-[var(--radius-sm)]", className)}>
      {slide ? (
        <Slide slide={slide} accent={accent} title={title} />
      ) : (
        <div className="aspect-[4/5] w-full bg-surface-2" />
      )}
    </div>
  );
}
