/**
 * Shared domain primitives.
 *
 * Phase 0 uses documented aliases. Phase 1 may upgrade these to branded types
 * without changing stored values, because the underlying representation is
 * already fixed: integer paise and integer basis points.
 */

/** Integer amount in paise. 1 INR = 100 paise. */
export type Paise = number;

/** Integer rate in basis points. 1% = 100 bps. */
export type BasisPoints = number;
