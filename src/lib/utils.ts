import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateRange(start: string, end: string, locale: "th" | "en" = "th") {
  const fmt = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${fmt.format(new Date(start + "T00:00:00Z"))} – ${fmt.format(new Date(end + "T00:00:00Z"))}`;
}

export function formatMoney(amount: number | string | null | undefined, currency = "THB", locale: "th" | "en" = "th") {
  if (amount === null || amount === undefined || amount === "") return null;
  return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount));
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?";
}
