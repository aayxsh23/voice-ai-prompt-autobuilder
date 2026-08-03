import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Navbar } from "@/components/layout/Navbar";
import "./globals.css";

// 400/500/600 only — nothing in the UI uses 700, and loading a weight the design
// never calls for is dead payload. Every `font-semibold` now resolves to a real
// cut instead of a browser-synthesised fake bold (DM Sans shipped 400/500 only).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "VoiceAgent Studio",
  description: "Build, version and test system prompts for AI telephony agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-canvas text-ink antialiased flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
