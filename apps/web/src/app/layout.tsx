import Script from "next/script";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
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
  title: "Panelyt",
  description: "Optimize blood test panels using current and 30-day minimum prices.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isProduction = process.env.NODE_ENV === "production";

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {isProduction ? (
          <Script
            src="https://analytics.panelyt.com/script.js"
            data-website-id="204ed337-eb7f-466a-86a9-9f35ec1132ae"
            strategy="afterInteractive"
          />
        ) : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
