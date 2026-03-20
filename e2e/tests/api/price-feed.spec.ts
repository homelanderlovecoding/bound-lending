import { test, expect } from '@playwright/test';

test.describe('Price Feed & Config', () => {
  test('GET /api/price/btc returns price', async ({ request }) => {
    const res = await request.get('/api/price/btc');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.price).toBeGreaterThan(0);
    expect(body.data.currency).toBe('USD');
  });

  test('GET /api/config/lending returns lending params', async ({ request }) => {
    const res = await request.get('/api/config/lending');
    expect(res.status()).toBe(200);
    const body = await res.json();
    const config = body.data;
    expect(config).toBeDefined();
  });
});
