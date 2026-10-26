/**
 * Partner programme — configuration boundary only.
 *
 * NOT IMPLEMENTED IN PHASE 0. There is no partner authentication, no referral
 * attribution, no commission ledger, no payout workflow, and no collection of
 * UPI or bank details.
 *
 * Rules for the future implementation:
 * - Commission is a share of subscription revenue actually received/settled,
 *   not of invoiced or promised revenue.
 * - Payouts run monthly, not weekly.
 * - Refunds, cancellations and failed payments reduce the commission base.
 * - Payout details (UPI ID or bank account) are sensitive financial data and
 *   must live only in access-controlled server-side storage. They must never
 *   be written to localStorage, placed in URLs, or sent to analytics.
 * - The eventual flow is:
 *     customer -> subscription -> payment received -> referral attribution
 *     -> commission ledger -> monthly payout -> UPI / bank transfer
 */
export const PARTNER_PROGRAM = {
  /** 20% expressed as integer basis points (1% = 100 bps). */
  commissionRateBps: 2_000,
  commissionBasis: "received_subscription_revenue",
  payoutCadence: "monthly",
  payoutMethods: ["upi", "bank_transfer"],
} as const;

export type PartnerCommissionBasis = (typeof PARTNER_PROGRAM)["commissionBasis"];
export type PartnerPayoutCadence = (typeof PARTNER_PROGRAM)["payoutCadence"];
export type PartnerPayoutMethod = (typeof PARTNER_PROGRAM)["payoutMethods"][number];
