import { test, expect } from '@playwright/test';

test.describe('Borrow Flow', () => {
  test('collateral input accepts numeric values', async ({ page }) => {
    await page.goto('/borrow');
    const input = page.locator('input').first();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('0.5');
    await expect(input).toHaveValue('0.5');
  });

  test('switching to Active Loans tab shows loan table header', async ({ page }) => {
    await page.goto('/borrow');
    const activeTab = page.getByText('Active Loans');
    await expect(activeTab).toBeVisible({ timeout: 10_000 });
    await activeTab.click();
    // ActiveLoansTable renders with "All Active Loans" heading
    await expect(page.getByText('All Active Loans')).toBeVisible({ timeout: 5_000 });
  });

  test('Request Quotes button exists on step 1', async ({ page }) => {
    await page.goto('/borrow');
    const btn = page.getByText(/Request Quotes/i);
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });
});
