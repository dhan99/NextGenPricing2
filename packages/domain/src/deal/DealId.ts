import { InvariantError } from "../shared/errors";

/**
 * Branded numeric ID. Prevents accidentally passing an approval-id
 * where a deal-id is required (and vice versa) at the type system.
 *
 * Storage shape: `serial` integer in `deals.id`.
 */
declare const DealIdBrand: unique symbol;
export type DealId = number & { readonly [DealIdBrand]: true };

export function dealId(raw: number): DealId {
  if (!Number.isInteger(raw) || raw <= 0) {
    throw new InvariantError(`DealId must be a positive integer, got ${raw}`);
  }
  return raw as DealId;
}
