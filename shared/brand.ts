/**
 * Brand registry — single source of truth for firm name, domain, palette, fonts
 * and asset paths. Two brands ship side by side; the active one is chosen by
 * the `BRAND_ID` env var (server: `process.env`, client: Vite `import.meta.env`
 * via `envPrefix`). Both Render services build from the same commit and differ
 * only in `BRAND_ID` + `DATABASE_URL`.
 *
 * Import the *resolved* brand, never this map directly:
 *   server  -> `import { BRAND } from "./brand"`          (server/brand.ts)
 *   client  -> `import { BRAND } from "@/brand"`          (client/src/brand.ts)
 *
 * CSS tokens live in `client/src/index.css` under `:root[data-brand="<id>"]`;
 * keep them in sync with `colors` here when a palette changes.
 */
export type BrandId = "armanino" | "eisneramper";

export interface Brand {
  id: BrandId;
  /** Display name used in UI copy. */
  name: string;
  /** Legal entity used in engagement letters, proposals, footers. */
  legalName: string;
  /** Email / tenant domain for seeded personas and placeholders. */
  domain: string;
  /** Internal program name the PoC sits under. */
  program: string;
  /** Default Dynamics 365 sales-process label (also the DB column default). */
  salesProcess: string;
  /** Copyright year shown in footers. */
  year: number;
  /** Public asset paths (served from /public/brand/<id>/). */
  assets: { logo: string; logoOnDark: string; mark: string; favicon: string };
  colors: {
    /** Primary action colour — buttons, links, focus rings, PDF header bar. */
    primary: string;
    /** Darkest brand neutral — headings, sidebar. */
    dark: string;
    /** Secondary brand colour. */
    accent: string;
    /** Light tint of the accent for soft surfaces. */
    accentSoft: string;
    /** Border tone that pairs with accentSoft. */
    accentBorder: string;
    /** Five-step categorical palette for charts (primary first). */
    chart: readonly [string, string, string, string, string];
    /** Login hero background. */
    loginGradient: string;
  };
  fonts: { sans: string; heading: string };
}

const asset = (id: BrandId, file: string) => `/brand/${id}/${file}`;

export const BRANDS: Record<BrandId, Brand> = {
  armanino: {
    id: "armanino",
    name: "Armanino",
    legalName: "Armanino LLP",
    domain: "armanino.com",
    program: "NextGenApp",
    salesProcess: "Armanino NextGenApp Sales Process",
    year: 2026,
    assets: {
      logo: asset("armanino", "logo.svg"),
      logoOnDark: asset("armanino", "logo.svg"),
      mark: asset("armanino", "mark.svg"),
      favicon: asset("armanino", "favicon.svg"),
    },
    colors: {
      primary: "#DA720F",
      dark: "#1c1917",
      accent: "#949300",
      accentSoft: "#fff7ed",
      accentBorder: "#fed7aa",
      chart: ["#DA720F", "#78716c", "#d97706", "#a8a29e", "#92400e"],
      loginGradient: "linear-gradient(135deg, #fdf8f3 0%, #fef3e7 40%, #fde8d0 100%)",
    },
    fonts: {
      sans: "'Inter', system-ui, -apple-system, sans-serif",
      heading: "'Inter', system-ui, -apple-system, sans-serif",
    },
  },
  // Palette and type sourced from eisneramper.com (Raleway body, Fraunces display).
  eisneramper: {
    id: "eisneramper",
    name: "EisnerAmper",
    legalName: "EisnerAmper LLP",
    domain: "eisneramper.com",
    program: "NextGenApp",
    salesProcess: "EisnerAmper NextGenApp Sales Process",
    year: 2026,
    assets: {
      logo: asset("eisneramper", "logo.svg"),
      logoOnDark: asset("eisneramper", "logo-white.svg"),
      mark: asset("eisneramper", "mark.svg"),
      favicon: asset("eisneramper", "favicon.svg"),
    },
    colors: {
      primary: "#115E67", // teal
      dark: "#0C2E45", // navy
      accent: "#BF9B5F", // gold
      accentSoft: "#F3EDE3",
      accentBorder: "#D9C7A3",
      chart: ["#115E67", "#0C2E45", "#BF9B5F", "#885C11", "#93DDEC"],
      loginGradient: "linear-gradient(135deg, #F7F4F1 0%, #EAE5E1 55%, #DCD4CC 100%)",
    },
    fonts: {
      sans: "'Raleway', system-ui, -apple-system, sans-serif",
      heading: "'Fraunces', Georgia, serif",
    },
  },
};

export const DEFAULT_BRAND_ID: BrandId = "armanino";

export const isBrandId = (v: unknown): v is BrandId =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(BRANDS, v);

/**
 * Resolve the active brand from an env value. Unset -> DEFAULT_BRAND_ID so an
 * existing deployment keeps its look; a *set but unknown* value is a config
 * error and throws (no silent fallback, per the rigor playbook).
 */
export function resolveBrand(raw: string | undefined): Brand {
  if (raw === undefined || raw === "") return BRANDS[DEFAULT_BRAND_ID];
  if (!isBrandId(raw)) {
    throw new Error(
      `BRAND_ID="${raw}" is not a known brand. Expected one of: ${Object.keys(BRANDS).join(", ")}`,
    );
  }
  return BRANDS[raw];
}

/** Convenience: `brandEmail(brand, "jdoe")` -> `jdoe@<brand.domain>`. */
export const brandEmail = (brand: Brand, local: string) => `${local}@${brand.domain}`;
