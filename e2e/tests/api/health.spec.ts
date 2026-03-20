import { test, expect } from '@playwright/test';

test.describe('Health & Swagger', () => {
  test('swagger docs page loads', async ({ request }) => {
    const res = await request.get('/docs');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('swagger');
  });

  test('swagger JSON schema accessible', async ({ request }) => {
    const res = await request.get('/docs-json');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.info.title).toBeDefined();
    expect(json.paths).toBeDefined();
  });
});
