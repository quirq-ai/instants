import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AppShell } from "@/components/shell/app-shell";
import { getRecords } from "@/lib/research/library";
import "./globals.css";

// Self-hosted at build time, so the browser never fetches from Google.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: { default: "Recall", template: "%s · Recall" },
  description: "Everything you have researched, turned into posts you can browse.",
  icons: {
    icon: `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#16150f"/><path d="M20 44V20h14a8 8 0 0 1 0 16H20m14 0 10 8" fill="none" stroke="#83d63a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    )}`,
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A light index for the command palette (search from anywhere).
  const index = (await getRecords()).map((r) => ({
    slug: r.slug,
    title: r.post.title,
    hook: r.post.hook,
    topic: r.post.topic,
    kind: r.post.kind,
    tags: r.post.tags,
    accent: r.post.accent,
  }));
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${serif.variable} ${mono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('recall-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        <AppShell index={index}>{children}</AppShell>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
