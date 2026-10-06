import { resolveBrand, brandEmail as _brandEmail } from "../shared/brand";

/** Active brand for this server process — chosen by `BRAND_ID`. */
export const BRAND = resolveBrand(process.env.BRAND_ID);

export const brandEmail = (local: string) => _brandEmail(BRAND, local);
