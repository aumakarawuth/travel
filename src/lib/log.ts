/** Structured JSON logs (picked up by Vercel log drains / monitoring). Never log secrets or page bodies. */
type Fields = Record<string, unknown>;
const emit = (level: string, msg: string, f?: Fields) => console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](JSON.stringify({ level, msg, ...f, t: new Date().toISOString() }));
export const log = {
  info: (m: string, f?: Fields) => emit("info", m, f),
  warn: (m: string, f?: Fields) => emit("warn", m, f),
  error: (m: string, f?: Fields) => emit("error", m, f),
};
