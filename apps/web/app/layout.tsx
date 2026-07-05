import { withAuth } from "@workos-inc/authkit-nextjs";
import type { Metadata } from "next";
import { DM_Mono, DM_Sans, Space_Grotesk } from "next/font/google";
import { AuthProvider } from "../components/auth-provider";
import "../lib/server/env";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

export const metadata: Metadata = {
  title: "SupaContext | Context API for AI Agents",
  description:
    "Supacontext replaces separate Web, Reddit, X, and YouTube integrations with one endpoint that returns compact, cited JSON for AI agents.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { accessToken: _accessToken, ...initialAuth } = await withAuth();

  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${spaceGrotesk.variable} ${dmMono.variable}`}>
        <AuthProvider initialAuth={initialAuth}>{children}</AuthProvider>
      </body>
    </html>
  );
}
