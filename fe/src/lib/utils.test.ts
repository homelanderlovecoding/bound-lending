import { describe, it, expect } from 'vitest';
import {
  calculateLtv,
  estLiquidationPrice,
  ltvColor,
  ltvToAngle,
  formatBtc,
  formatUsd,
  formatNumber,
} from './utils';

describe('calculateLtv', () => {
  it('should return correct LTV percentage', () => {
    // 20000 / (0.5 * 91000) = 43.95%
    expect(calculateLtv(20000, 0.5, 91000)).toBeCloseTo(43.95, 1);
  });

  it('should return 0 if collateral is 0', () => {
    expect(calculateLtv(20000, 0, 91000)).toBe(0);
  });

  it('should return 0 if btcPrice is 0', () => {
    expect(calculateLtv(20000, 0.5, 0)).toBe(0);
  });

  it('should return 100% when loan equals collateral value', () => {
    expect(calculateLtv(45500, 0.5, 91000)).toBeCloseTo(100, 1);
  });

  it('should return > 100% for over-collateralized debt', () => {
    expect(calculateLtv(50000, 0.5, 91000)).toBeGreaterThan(100);
  });
});

describe('estLiquidationPrice', () => {
  it('should calculate correct liquidation price at 95% LTV', () => {
    // liqPrice = debtUsd / (collateral * 0.95) = 20000 / (0.5 * 0.95) = 42105.26
    expect(estLiquidationPrice(20000, 0.5)).toBeCloseTo(42105.26, 0);
  });

  it('should return 0 if collateral is 0', () => {
    expect(estLiquidationPrice(20000, 0)).toBe(0);
  });

  it('should use custom liqLtv threshold', () => {
    // 20000 / (0.5 * 0.80) = 50000
    expect(estLiquidationPrice(20000, 0.5, 80)).toBeCloseTo(50000, 0);
  });
});

describe('ltvColor', () => {
  it('should return muted color for 0 LTV', () => {
    expect(ltvColor(0)).toBe('var(--text-muted)');
  });

  it('should return green for LTV < 50%', () => {
    expect(ltvColor(30)).toBe('var(--green)');
  });

  it('should return green-soft for LTV 50–70%', () => {
    expect(ltvColor(60)).toBe('var(--green-soft)');
  });

  it('should return gold for LTV 70–80%', () => {
    expect(ltvColor(75)).toBe('var(--gold)');
  });

  it('should return red for LTV >= 80%', () => {
    expect(ltvColor(80)).toBe('var(--red-text)');
    expect(ltvColor(95)).toBe('var(--red-text)');
  });
});

describe('ltvToAngle', () => {
  it('should return 0 for 0% LTV', () => {
    expect(ltvToAngle(0)).toBe(0);
  });

  it('should return 270 for 100% LTV (full arc)', () => {
    expect(ltvToAngle(100)).toBe(270);
  });

  it('should return 135 for 50% LTV (half arc)', () => {
    expect(ltvToAngle(50)).toBe(135);
  });

  it('should clamp negative values to 0', () => {
    expect(ltvToAngle(-10)).toBe(0);
  });

  it('should clamp values > 100 to 270', () => {
    expect(ltvToAngle(150)).toBe(270);
  });
});

describe('formatBtc', () => {
  it('should format to 6 decimal places', () => {
    expect(formatBtc(0.5)).toBe('0.500000 BTC');
  });

  it('should format small amounts correctly', () => {
    expect(formatBtc(0.000001)).toBe('0.000001 BTC');
  });
});

describe('formatUsd', () => {
  it('should format with dollar sign prefix', () => {
    expect(formatUsd(1234.5)).toMatch(/^\$/);
  });

  it('should format with up to 2 decimal places', () => {
    // formatNumber uses maximumFractionDigits — trailing zeros are trimmed
    expect(formatUsd(1234.56)).toBe('$1,234.56');
  });

  it('should include comma separators for thousands', () => {
    expect(formatUsd(1000)).toMatch(/1,000/);
  });

  it('should format fractional cents correctly', () => {
    expect(formatUsd(91183.76)).toBe('$91,183.76');
  });
});

describe('formatNumber', () => {
  it('should format with commas and no decimals by default', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('should format with specified decimals', () => {
    expect(formatNumber(1234.5678, 2)).toBe('1,234.57');
  });
});
