"use client";

import { useRouter } from "next/navigation";
import { BarChart3, FolderOpen, Home, LayoutGrid, Plus, Shapes } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { topicSlug } from "@/lib/research/format";

export type PaletteItem = {
  slug: string;
  title: string;
  hook: string;
  topic: string;
  kind: string;
  tags: string[];
  accent: string;
};

const GO_TO = [
  { href: "/", label: "Feed", icon: Home },
  { href: "/library", label: "Library", icon: LayoutGrid },
  { href: "/topics", label: "Topics", icon: Shapes },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/sources", label: "Sources", icon: FolderOpen },
  { href: "/add", label: "Add research", icon: Plus },
];

export function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
}) {
  const router = useRouter();
  const topics = [...new Map(items.map((item) => [item.topic, item])).keys()].sort();

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search Instants"
      description="Find a post, a topic or a page"
      className="top-[18%] translate-y-0 sm:max-w-xl"
    >
      <CommandInput placeholder="Search posts, topics, pages..." aria-label="Search" />
      <CommandList className="max-h-[min(60vh,440px)]">
        <CommandEmpty>Nothing matches. Try a tag or a topic name.</CommandEmpty>
        {items.length > 0 && (
          <CommandGroup heading="Posts">
            {items.map((item) => (
              <CommandItem
                key={item.slug}
                value={`post ${item.slug} ${item.title}`}
                keywords={[item.hook, item.topic, item.kind, ...item.tags]}
                onSelect={() => go(`/p/${item.slug}`)}
                className="items-start gap-3"
              >
                <span
                  aria-hidden
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ background: item.accent }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.hook}</span>
                </span>
                <span className="shrink-0 text-[11px] text-faint">{item.kind}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {topics.length > 0 && (
          <CommandGroup heading="Topics">
            {topics.map((topic) => (
              <CommandItem key={topic} value={`topic ${topic}`} onSelect={() => go(`/topics/${topicSlug(topic)}`)}>
                <Shapes className="text-muted-foreground" />
                {topic}
                <span className="ml-auto text-[11px] text-faint">
                  {items.filter((item) => item.topic === topic).length}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {GO_TO.map(({ href, label, icon: Icon }) => (
            <CommandItem key={href} value={`go ${label}`} onSelect={() => go(href)}>
              <Icon className="text-muted-foreground" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
