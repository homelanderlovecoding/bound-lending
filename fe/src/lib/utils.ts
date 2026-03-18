/** Get LTV color based on percentage */
export function ltvColor(ltv: number): string {
  if (ltv <= 0) return 'var(--text-muted)';
  if (ltv < 50) return 'var(--green)';
  if (ltv < 70) return 'var(--green-soft)';
  if (ltv < 80) return 'var(--gold)';
  return 'var(--red-text)';
}

/** Format number with commas */
export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

/** Format USD */
export function formatUsd(n: number): string {
  return `$${formatNumber(n, 2)}`;
}

/** Format BTC */
export function formatBtc(n: number): string {
  return `${n.toFixed(6)} BTC`;
}

/** Calculate LTV */
export function calculateLtv(amountUsd: number, collateralBtc: number, btcPrice: number): number {
  if (collateralBtc <= 0 || btcPrice <= 0) return 0;
  return (amountUsd / (collateralBtc * btcPrice)) * 100;
}

/** Calculate estimated liquidation price */
export function estLiquidationPrice(debtUsd: number, collateralBtc: number, liqLtv = 95): number {
  if (collateralBtc <= 0) return 0;
  return debtUsd / (collateralBtc * (liqLtv / 100));
}

/** LTV gauge angle (0-270 degrees arc) */
export function ltvToAngle(ltv: number): number {
  return Math.max(0, Math.min(ltv, 100)) / 100 * 270;
}
