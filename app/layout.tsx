import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
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
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "共月 Same Moon｜今晚，两扇窗看向同一轮月亮",
    description: "在连续的绘本夜色中点亮两扇相隔很远的窗，寻找共同观月的时刻。",
    openGraph: {
      title: "共月 / Same Moon",
      description: "想从你的窗户，看同一轮月亮吗？",
      images: [`${origin}/og-window.png`],
    },
    twitter: {
      card: "summary_large_image",
      title: "共月 / Same Moon",
      description: "想从你的窗户，看同一轮月亮吗？",
      images: [`${origin}/og-window.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
