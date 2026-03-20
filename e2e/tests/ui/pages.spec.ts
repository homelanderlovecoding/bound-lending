import { test, expect } from '@playwright/test';

test.describe('Frontend Pages', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Bound/i);
  });

  test('borrow page loads with input fields', async ({ page }) => {
    await page.goto('/borrow');
    // BorrowInputForm renders input fields (no <form> tag — it's a React component)
    await expect(page.locator('input').first()).toBeVisible({ timeout: 10_000 });
  });

  test('borrow page has step indicator', async ({ page }) => {
    await page.goto('/borrow');
    // StepIndicator component should show steps
    await expect(page.getByText('Request Quotes').or(page.getByText('Step'))).toBeVisible({ timeout: 10_000 });
  });

  test('borrow page has tabs (New Loan / Active Loans)', async ({ page }) => {
    await page.goto('/borrow');
    await expect(page.getByText('New Loan')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Active Loans')).toBeVisible();
  });

  test('navigation bar exists', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav, header');
    await expect(nav).toBeVisible({ timeout: 10_000 });
  });
});
