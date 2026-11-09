import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TripSync AI — วางแผนเที่ยวกับเพื่อน",
    short_name: "TripSync",
    description: "วางลิงก์สถานที่ แล้วให้ AI ช่วยจัดเป็นแผนเที่ยว",
    start_url: "/trips",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    lang: "th",
    categories: ["travel", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android/Chrome (installed PWA) share sheet → /share?url=…&text=…&title=…  (iOS Safari does not support this)
    share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
    shortcuts: [{ name: "ทริปของฉัน", url: "/trips", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
  } as MetadataRoute.Manifest;
}
