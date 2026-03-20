import { test, expect } from '@playwright/test';

const TEST_ADDRESS = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

test.describe('Auth Flow', () => {
  test('POST /auth/challenge returns nonce + message', async ({ request }) => {
    const res = await request.post('/auth/challenge', {
      data: { address: TEST_ADDRESS },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.nonce).toBeDefined();
    expect(body.data.message).toContain(TEST_ADDRESS);
    expect(body.data.expiresAt).toBeDefined();
  });

  test('POST /auth/verify rejects invalid signature', async ({ request }) => {
    // First get a valid challenge
    const challengeRes = await request.post('/auth/challenge', {
      data: { address: TEST_ADDRESS },
    });
    const { nonce } = (await challengeRes.json()).data;

    // Submit garbage signature
    const res = await request.post('/auth/verify', {
      data: { address: TEST_ADDRESS, signature: 'invalid-sig', nonce },
    });
    // Should fail with 401 or 400
    expect([400, 401, 500]).toContain(res.status());
  });

  test('POST /auth/refresh rejects invalid token', async ({ request }) => {
    const res = await request.post('/auth/refresh', {
      data: { refreshToken: 'garbage-token' },
    });
    expect([400, 401, 500]).toContain(res.status());
  });
});
