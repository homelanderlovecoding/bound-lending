import { test, expect } from '@playwright/test';

test.describe('Internal / Liquidation Endpoints', () => {
  test('GET /internal/price-feeds returns oracle data', async ({ request }) => {
    const res = await request.get('/internal/price-feeds');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
  });

  test('GET /internal/review-queue returns array', async ({ request }) => {
    const res = await request.get('/internal/review-queue');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});
