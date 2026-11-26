import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PayBridge — Pay overseas suppliers in their local stablecoin",
  description:
    "PayBridge is an agent that gets a Textile FX quote and pays an overseas supplier in their local stablecoin on Celo.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white text-slate-800 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
