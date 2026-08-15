import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASEP BOT",
  description: "ASEP BOT - katalog layanan digital, payment otomatis/manual, dan dashboard owner.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
