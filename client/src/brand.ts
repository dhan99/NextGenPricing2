import { resolveBrand } from "@shared/brand";

/**
 * Active brand for this bundle — baked in at build time from `BRAND_ID`
 * (exposed to Vite through `envPrefix` in vite.config.js, defaulted there).
 */
export const BRAND = resolveBrand(import.meta.env.BRAND_ID);
