import type { Metadata } from "next";
import { Anton, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { AppShell } from "@/components/AppShell";

// The protocol's three voices: Anton for display, Instrument Serif for the italic
// aside, JetBrains Mono for everything machine-read.
const display = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["italic", "normal"],
  variable: "--font-serif",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Coverage Exchange — bonded cross-chain coverage",
  description:
    "Bonded cross-chain coverage over attested state windows. Connect a wallet, buy or provide coverage, draw against it, and destroy a false claim with one proven counterexample.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${serif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <WalletProvider>
          <AppShell>{children}</AppShell>
        </WalletProvider>
      </body>
    </html>
  );
}
