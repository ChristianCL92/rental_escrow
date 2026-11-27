const usdcAmount = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

/**
 * Every amount the site shows, in one format: "30 USDC", "1,050 USDC",
 * "22.5 USDC". Stays are paid in USDC, so there is no currency symbol. The
 * space is non-breaking, so the number never wraps away from its unit.
 */
export const formatUsdc = (amount: number): string =>
  `${usdcAmount.format(amount)} USDC`;
