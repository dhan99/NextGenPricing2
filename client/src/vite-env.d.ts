/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Active brand id; see shared/brand.ts. Defaulted in vite.config.js. */
  readonly BRAND_ID?: string;
}
