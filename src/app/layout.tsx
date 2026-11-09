import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { Providers } from "@/components/theme";
import "./globals.css";

const font = Noto_Sans_Thai({ subsets: ["thai", "latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "TripSync AI", template: "%s · TripSync AI" },
  description: "วางแผนเที่ยวร่วมกันเป็นกลุ่ม พร้อม AI จัดลิงก์สถานที่เป็นแผนเที่ยว",
  applicationName: "TripSync AI",
  appleWebApp: { capable: true, title: "TripSync", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={`${font.variable} font-sans min-h-dvh`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
