import { test, expect } from '@playwright/test';

// Known signet address for testing
const SIGNET_ADDRESS = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

test.describe('UniSat Endpoints', () => {
  test('GET /api/unisat/blockchain/info returns block height', async ({ request }) => {
    const res = await request.get('/api/unisat/blockchain/info');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.blockHeight).toBeGreaterThan(0);
    expect(body.network).toBeDefined();
  });

  test('GET /api/unisat/balance returns full balance object', async ({ request }) => {
    const res = await request.get(`/api/unisat/balance?address=${SIGNET_ADDRESS}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.address).toBe(SIGNET_ADDRESS);
    expect(body.blockHeight).toBeGreaterThan(0);
    expect(body.btc).toBeDefined();
    expect(body.btc.satoshi).toBeGreaterThanOrEqual(0);
    expect(body.busd).toBeDefined();
  });

  test('GET /api/unisat/balance/btc returns satoshi balance', async ({ request }) => {
    const res = await request.get(`/api/unisat/balance/btc?address=${SIGNET_ADDRESS}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.address).toBe(SIGNET_ADDRESS);
    expect(body.satoshi).toBeGreaterThanOrEqual(0);
    expect(body.btc).toBeGreaterThanOrEqual(0);
  });

  test('GET /api/unisat/balance/rune returns rune balance', async ({ request }) => {
    const res = await request.get(`/api/unisat/balance/rune?address=${SIGNET_ADDRESS}`);
    expect(res.status()).toBe(200);
  });
});
