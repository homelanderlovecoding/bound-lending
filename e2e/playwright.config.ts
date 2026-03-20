import { defineConfig } from '@playwright/test';

const BE_URL = process.env.BE_URL || 'https://doc-stored-ensure-simply.trycloudflare.com';
const FE_URL = process.env.FE_URL || 'https://fe-eosin-pi.vercel.app';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: BE_URL,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'api',
      testMatch: /api\/.+\.spec\.ts/,
      use: { baseURL: BE_URL },
    },
    {
      name: 'ui',
      testMatch: /ui\/.+\.spec\.ts/,
      use: {
        baseURL: FE_URL,
        browserName: 'chromium',
      },
    },
  ],
});
