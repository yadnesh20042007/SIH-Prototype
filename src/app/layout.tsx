import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "NAWI R76 | OIML Compliance Testing Platform",
    template: "%s | NAWI R76",
  },
  description:
    "Professional OIML R76 compliance testing platform for non-automatic weighing instruments. " +
    "Deterministic rule engine, test selection, and MPE calculations.",
  keywords: ["OIML R76", "NAWI", "compliance testing", "weighing instruments", "MPE"],
  authors: [{ name: "NAWI R76 Platform" }],
  robots: "index, follow",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
