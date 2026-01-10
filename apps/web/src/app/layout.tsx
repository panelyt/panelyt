import Script from "next/script";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getLocale, getTranslations } from "next-intl/server";
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

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isProduction = process.env.NODE_ENV === "production";
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {isProduction ? (
          <Script
            src="https://analytics.panelyt.com/script.js"
            data-website-id="e8071713-1cf1-44c7-8674-909d128c9507"
            strategy="afterInteractive"
          />
        ) : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
