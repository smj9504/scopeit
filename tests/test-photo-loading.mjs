/**
 * Playwright test: Verify packing tool photo loading from storage
 *
 * Usage: TEST_EMAIL=you@email.com TEST_PASSWORD=yourpass node tests/test-photo-loading.mjs
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';

if (!EMAIL || !PASSWORD) {
  console.error('Usage: TEST_EMAIL=xxx TEST_PASSWORD=xxx node tests/test-photo-loading.mjs');
  process.exit(1);
}

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Track photo API calls
  const photoResults = [];
  page.on('response', (resp) => {
    if (resp.url().includes('/packing/photos/')) {
      const key = resp.url().split('/photos/').pop()?.substring(0, 50);
      photoResults.push({ key, status: resp.status() });
    }
  });

  // Track console errors
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  try {
    // ── Login ──
    console.log('1. Logging in...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[placeholder="Email"]').fill(EMAIL);
    await page.locator('input[placeholder="Password"]').fill(PASSWORD);
    await page.locator('button:has-text("Sign In")').click();
    await page.waitForURL('**/app/**', { timeout: 15000 });
    console.log('   OK');

    // ── Navigate to Packing Tool ──
    console.log('2. Opening packing tool...');
    await page.goto(`${BASE_URL}/app/tools`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click packing tool card
    const packingLink = page.locator('a[href*="packing"], div:has-text("Packing")').first();
    await packingLink.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/ss-01-packing-tool.png' });
    console.log('   OK');

    // ── Open first session from history ──
    console.log('3. Opening existing session...');
    // Look for session cards or rows
    const sessionLink = page.locator('[style*="cursor: pointer"]:has-text("Photo AI")').first();
    if (await sessionLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sessionLink.click();
    } else {
      // Try any session
      const anyClickable = page.locator('text=/Photo AI|Quick/').first();
      if (await anyClickable.isVisible({ timeout: 3000 }).catch(() => false)) {
        await anyClickable.click();
      } else {
        console.log('   No sessions found!');
        await page.screenshot({ path: 'tests/ss-02-no-sessions.png' });
        await browser.close();
        return;
      }
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tests/ss-02-session-opened.png' });
    console.log('   OK');

    // ── Wait for photos to load ──
    console.log('4. Waiting for photos (15s max)...');
    await page.waitForTimeout(15000);
    await page.screenshot({ path: 'tests/ss-03-after-wait.png' });

    // ── Analyze results ──
    console.log('\n═══ RESULTS ═══');

    // Photo API stats
    const ok = photoResults.filter(r => r.status === 200).length;
    const fail = photoResults.filter(r => r.status !== 200).length;
    console.log(`Photo API: ${photoResults.length} total, ${ok} OK, ${fail} failed`);
    photoResults.filter(r => r.status !== 200).forEach(r => {
      console.log(`  ✗ ${r.status} ${r.key}`);
    });

    // DOM state
    const imgs = await page.locator('img[alt*="Photo"], img[alt*="Thumb"]').count();
    const blobImgs = await page.evaluate(() => {
      return document.querySelectorAll('img[src^="blob:"]').length;
    });
    const dataImgs = await page.evaluate(() => {
      return document.querySelectorAll('img[src^="data:"]').length;
    });
    const unavail = await page.locator('text="Photo unavailable"').count();
    const loading = await page.locator('.anticon-loading').count();

    console.log(`DOM images: ${imgs} total (${blobImgs} blob, ${dataImgs} data-uri)`);
    console.log(`"Photo unavailable": ${unavail}`);
    console.log(`Loading spinners: ${loading}`);
    console.log(`Console errors: ${errors.length}`);
    errors.slice(0, 5).forEach(e => console.log(`  ⚠ ${e.substring(0, 100)}`));

    if (ok > 0 && blobImgs > 0) {
      console.log('\n✓ Photos loading from storage');
    } else if (ok > 0 && blobImgs === 0) {
      console.log('\n⚠ API returns 200 but blob URLs not rendered — frontend issue');
    } else if (fail > 0) {
      console.log('\n✗ Photo API failures — backend issue');
    } else {
      console.log('\n⚠ No photo API calls made — photo_keys may be empty');
    }

  } catch (err) {
    console.error('Test failed:', err.message);
    await page.screenshot({ path: 'tests/ss-error.png' });
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
  }
}

run();
