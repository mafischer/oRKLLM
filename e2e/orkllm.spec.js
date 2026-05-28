import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const testAuthPath = path.resolve('./test_auth.json');
const modelsDir = path.resolve('./models');
const dummyModelName = 'qwen_1.8b.rkllm';
const dummyModelPath = path.join(modelsDir, dummyModelName);

test.beforeAll(() => {
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  // Create dummy models for testing
  fs.writeFileSync(dummyModelPath, 'fake-model-binary-data', 'utf-8');
});

test.afterAll(() => {
  // Cleanup test artifacts
  if (fs.existsSync(dummyModelPath)) {
    fs.rmSync(dummyModelPath, { force: true });
  }
});

test('oRKLLM End-to-End User Journey', async ({ page }) => {
  // Capture page logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // --- STEP 1: First Launch & Credentials Setup ---
  await page.goto('/');

  // Expect automatic redirection to setup page
  await expect(page).toHaveURL(/\/setup/);
  await expect(page.locator('h1')).toContainText('oRKLLM Setup');

  // Fill in registration form
  await page.locator('input[type="text"]').fill('admin_test');
  await page.locator('input[type="password"]').first().fill('secret123');
  await page.locator('input[type="password"]').nth(1).fill('secret123');

  // Click Initialize
  await page.click('button:has-text("Initialize Server")');

  // Expect redirect back to dashboard
  await expect(page).toHaveURL(/http:\/\/127.0.0.1:8000\/?$/);
  await expect(page.locator('.text-gradient')).toContainText('oRKLLM');

  // --- STEP 2: Authentication (Logout & Login Enforcement) ---
  // Open user menu drawer then sign out
  await page.click('.v-app-bar .v-btn:has(.mdi-account)');
  await page.waitForSelector('.v-navigation-drawer', { state: 'visible' });
  await page.click('.v-navigation-drawer .v-list-item:has-text("Sign Out")');

  // Expect redirect to login page
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('h1')).toContainText('oRKLLM Login');

  // Try wrong login
  await page.locator('input[type="text"]').fill('admin_test');
  await page.locator('input[type="password"]').fill('wrong_pass');
  await page.click('button:has-text("Sign In")');

  // Expect error alert
  await expect(page.locator('.v-alert')).toBeVisible();

  // Try correct login
  await page.locator('input[type="password"]').fill('secret123');
  await page.click('button:has-text("Sign In")');

  // Redirect back to dashboard
  await expect(page).toHaveURL(/http:\/\/127.0.0.1:8000\/?$/);

  // --- STEP 3: Dashboard & Inference Playground ---
  // Verify telemetry circular progress circles are visible
  await expect(page.locator('text=CPU Utilization')).toBeVisible();
  await expect(page.locator('text=NPU Utilization')).toBeVisible();
  await expect(page.locator('text=RAM Utilization')).toBeVisible();

  // --- Regression Test: Navbar Overlapping Check ---
  const appBar = page.locator('.v-app-bar');
  const mainContainer = page.locator('.v-main > .v-container');
  await expect(appBar).toBeVisible();
  await expect(mainContainer).toBeVisible();
  const appBarBox = await appBar.boundingBox();
  const mainContainerBox = await mainContainer.boundingBox();
  if (appBarBox && mainContainerBox) {
    // Include 2px tolerance for borders and subpixel rounding
    expect(mainContainerBox.y).toBeGreaterThanOrEqual(appBarBox.y + appBarBox.height - 2);
  }

  // Verify dummy model is scanned and listed
  await expect(page.locator('.v-list-item').filter({ hasText: dummyModelName }).first()).toBeVisible();

  // Load the model
  await page.click(`.v-list-item:has-text("${dummyModelName}") button:has-text("Load")`);

  // Wait for NPU active model status success alert
  const statusAlert = page.locator('.v-alert');
  await expect(statusAlert).toContainText(`Loaded: ${dummyModelName}`, { timeout: 10000 });
  await expect(statusAlert).toContainText('Platform: Mock Engine');

  // Verify chat play input area is enabled
  const chatInput = page.locator('input[placeholder="Enter your message..."]');
  await expect(chatInput).toBeEnabled();

  // Type a test prompt and submit
  await chatInput.fill('Hi mock engine, tell me about your hardware specs');
  await page.keyboard.press('Enter');

  // Check that assistant bubble appears and populates
  const assistantBubble = page.locator('.message-bubble').last();
  await expect(assistantBubble).toContainText('simulated response', { timeout: 10000 });
  await expect(assistantBubble).toContainText('oRKLLM Mock Engine');

  // Wait for streaming to finish completely (input becomes enabled again)
  await expect(chatInput).toBeEnabled({ timeout: 15000 });

  // Check performance metrics footer in bubble
  await expect(assistantBubble.locator('.text-caption')).toContainText('Prefill:');
  await expect(assistantBubble.locator('.text-caption')).toContainText('Rate:');

  // Check that logs terminal receives output
  const logsPre = page.locator('pre.terminal-logs');
  await expect(logsPre).toContainText('ws/metrics');
  await expect(logsPre).toContainText('Model loaded successfully');

  // Unload the model
  await page.click(`.v-list-item:has-text("${dummyModelName}") button:has-text("Unload")`);

  // Active status returns to warning (no model loaded)
  await expect(statusAlert).toContainText('No active model loaded');
});
