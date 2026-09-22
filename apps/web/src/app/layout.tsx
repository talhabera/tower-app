import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tower",
  description: "NexStep altyapı kontrol odası",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="flex gap-4 border-b border-neutral-200 px-8 py-3 text-sm">
          <Link href="/" className="font-medium">
            Genel Durum
          </Link>
          <Link href="/filo">Filo</Link>
          <Link href="/yedekleme">Yedekleme</Link>
          <form action="/api/auth/logout" method="post" className="ml-auto">
            <button type="submit" className="text-neutral-500 hover:text-neutral-900">
              Çıkış
            </button>
          </form>
        </nav>
        {children}
      </body>
    </html>
  );
}
