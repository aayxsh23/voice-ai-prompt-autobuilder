import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { Navbar } from "@/components/layout/Navbar";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "VoiceAgent Studio — Telephony Prompt Architecture",
  description: "Enterprise-grade prompt package builder, simulator, and lifecycle management studio for AI telephony voice agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable}`}>
      <body className="min-h-screen bg-cream-paper text-ink antialiased selection:bg-sunshine-highlight selection:text-ink flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
