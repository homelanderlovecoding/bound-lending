import { test, expect } from '@playwright/test';

const SIGNET_ADDRESS = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

test.describe('RadFi Endpoints', () => {
  test('GET /api/radfi/balance returns wallet balance', async ({ request }) => {
    const res = await request.get(`/api/radfi/balance?address=${SIGNET_ADDRESS}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.btcSatoshi).toBeGreaterThanOrEqual(0);
    expect(body.btcAmount).toBeGreaterThanOrEqual(0);
    expect(body.busdAmount).toBeGreaterThanOrEqual(0);
  });
});
