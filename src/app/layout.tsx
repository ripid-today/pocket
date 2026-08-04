import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Pocket — Your Personal eBook Reader",
  description: "Import and read EPUB and PDF books in a distraction-free dark reader.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // user-scalable left at default (allowed) — pinch-zoom is an OS escape hatch.
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-black text-white">
        {children}
      </body>
    </html>
  );
}
