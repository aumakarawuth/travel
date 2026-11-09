import { cookies } from "next/headers";
import { th, type Dict } from "./th";
import { en } from "./en";

export type Locale = "th" | "en";
const dicts: Record<Locale, Dict> = { th, en };

/** Thai by default; a `locale` cookie (set from profile) switches to English. */
export async function getDict(): Promise<{ t: Dict; locale: Locale }> {
  const c = (await cookies()).get("locale")?.value;
  const locale: Locale = c === "en" ? "en" : "th";
  return { t: dicts[locale], locale };
}

export function errorText(t: Dict, code: string | undefined): string {
  if (!code) return t.errors.generic;
  return (t.errors as Record<string, string>)[code] ?? t.errors.generic;
}
