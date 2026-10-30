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
  title: { default: "Instants", template: "%s · Instants" },
  description: "Instants: everything you have researched, kept in the Curie library as posts you can browse.",
  icons: {
    icon: `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset=".05" stop-color="#ffd776"/><stop offset=".2" stop-color="#f6a03d"/><stop offset=".45" stop-color="#f14b54"/><stop offset=".7" stop-color="#d72f83"/><stop offset=".95" stop-color="#9d3fce"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#ig)"/><path d="M32 11c1.6 11.2 9.8 19.4 21 21-11.2 1.6-19.4 9.8-21 21-1.6-11.2-9.8-19.4-21-21 11.2-1.6 19.4-9.8 21-21z" fill="#fff"/></svg>`,
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
            __html: `try{var t=localStorage.getItem('instants-theme')||localStorage.getItem('recall-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`,
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
