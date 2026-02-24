import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SolanaWalletProvider from "../provider/SolanaWalletProvider";
import NavBar from "@/components/NavBar";
import QueryProvider from "@/provider/QueryProvider";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "El Solar — Vacation Rentals in the Colombian Andes",
    template: "%s | El Solar",
  },
  description:
    "Book vacation stays in the Colombian Andes with USDC payments on Solana. Rooms and apartment surrounded by nature, pool, and hiking trails.",
  metadataBase: new URL("https://el-solar.vercel.app"),
  openGraph: {
    title: "El Solar — Vacation Rentals in the Colombian Andes",
    description:
      "Book vacation stays with USDC payments on Solana. Rooms and apartment with nature, pool, and hiking trails in the Colombian Andes.",
    url: "https://el-solar.vercel.app",
    siteName: "El Solar",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/el-solar-preview-1.jpg",
        alt: "El Solar Vacation Rentals in the Colombian Andes",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-dvh flex flex-col`}
      >
        <QueryProvider>
          <SolanaWalletProvider>
            <NavBar />
            <main className="pt-20 pb-20 flex-1">{children}</main>
            <Footer />
          </SolanaWalletProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
