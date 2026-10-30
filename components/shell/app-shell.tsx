"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Clapperboard,
  FolderOpen,
  Home,
  LayoutGrid,
  Moon,
  Plus,
  Search,
  Shapes,
  Sun,
} from "lucide-react";
import { CommandPalette, type PaletteItem } from "@/components/search/command-palette";
import { SyncDot } from "@/components/sources/space-card";

const NAV = [
  { href: "/", label: "Feed", icon: Home },
  { href: "/library", label: "Library", icon: LayoutGrid },
  { href: "/topics", label: "Topics", icon: Shapes },
  { href: "/videos", label: "Videos", icon: Clapperboard },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/sources", label: "Sources", icon: FolderOpen },
];
// Mobile tab bar: five slots with Add in the middle.
const TABS = [NAV[0], NAV[1], { href: "/add", label: "Add", icon: Plus }, NAV[2], NAV[3]];


function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/p/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(stored === "dark" || stored === "light" ? stored : system);
  }, []);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("instants-theme", next);
      localStorage.removeItem("recall-theme");
    } catch {}
    setTheme(next);
  }
  return { theme, toggle };
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 ${className}`} aria-label="Instants home">
      <svg viewBox="0 0 64 64" className="size-7 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="16" fill="var(--ink)" />
        <path
          d="M32 11c1.6 11.2 9.8 19.4 21 21-11.2 1.6-19.4 9.8-21 21-1.6-11.2-9.8-19.4-21-21 11.2-1.6 19.4-9.8 21-21z"
          fill="#83d63a"
        />
      </svg>
      <span className="flex flex-col">
        <span className="font-display text-[26px] leading-none tracking-tight">Instants</span>
        <span className="mt-0.5 font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-[var(--muted)]">Curie library</span>
      </span>
    </Link>
  );
}

export function AppShell({
  index,
  children,
}: {
  index: PaletteItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, [contenteditable=true]");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-bg px-4 py-5 md:flex">
        <Logo className="px-2" />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mt-6 flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-left text-sm text-muted-foreground shadow-[var(--shadow)] transition hover:border-line-strong"
        >
          <Search className="size-4" />
          <span className="flex-1">Search</span>
          <kbd className="rounded border border-line px-1.5 font-mono text-[11px]">⌘K</kbd>
        </button>
        <nav className="mt-5 flex flex-col gap-0.5" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-[10px] px-3 text-[14.5px] transition ${
                  active
                    ? "bg-surface font-semibold text-ink shadow-[var(--shadow)]"
                    : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                <Icon className="size-[18px]" strokeWidth={active ? 2.3 : 1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/add"
          className="mt-5 flex h-10 items-center justify-center gap-2 rounded-[10px] bg-brand text-sm font-semibold text-brand-ink transition hover:opacity-90"
        >
          <Plus className="size-4" strokeWidth={2.5} />
          Add research
        </Link>
        <div className="mt-auto flex items-center justify-between px-2 text-xs text-faint">
          <span className="flex items-center gap-3">
            {index.length} posts
            <SyncDot />
          </span>
          <button
            type="button"
            onClick={toggle}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2"
            aria-label="Search"
          >
            <Search className="size-5" />
          </button>
          <Link
            href="/insights"
            className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2"
            aria-label="Insights"
          >
            <BarChart3 className="size-5" />
          </Link>
          <Link
            href="/sources"
            className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2"
            aria-label="Sources"
          >
            <FolderOpen className="size-5" />
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
        </div>
      </header>

      <main className="pb-24 md:pb-10 md:pl-[var(--sidebar-w)]">{children}</main>

      {/* Mobile tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Main"
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          const add = href === "/add";
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${
                active ? "font-semibold text-ink" : "text-muted-foreground"
              }`}
            >
              {add ? (
                <span className="flex size-9 items-center justify-center rounded-full bg-brand text-brand-ink">
                  <Icon className="size-5" strokeWidth={2.5} />
                </span>
              ) : (
                <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.8} />
              )}
              {!add && label}
            </Link>
          );
        })}
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={index} />
    </div>
  );
}
