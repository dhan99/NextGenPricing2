import type { Request } from "express";

// Express 5 + @types/express-serve-static-core 5.x widened ParamsDictionary's
// string indexer to `string | string[]` (path-to-regexp 6 supports repeated
// path params) and req.header() to `string | string[] | undefined`. Our routes
// never use repeated patterns and headers are read singly, so these helpers
// narrow to the first string at the read site. They do not change runtime
// behavior — they encode the assumption that was implicit in the Express 4
// types.

export function paramStr(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export function paramInt(req: Request, name: string): number {
  return parseInt(paramStr(req, name), 10);
}

export function headerStr(req: Request, name: string, fallback = ""): string {
  const v = req.header(name);
  if (Array.isArray(v)) return v[0] ?? fallback;
  return v ?? fallback;
}

export function queryStr(req: Request, name: string, fallback = ""): string {
  const v = req.query[name];
  if (Array.isArray(v)) {
    const first = v[0];
    return typeof first === "string" ? first : fallback;
  }
  return typeof v === "string" ? v : fallback;
}
