/**
 * Simple Frontend Configuration Test
 */

import puppeteer from 'puppeteer';

async function simpleConfigTest() {
  console.log('🔍 Simple Config Test...');
  
  const browser = await puppeteer.launch({ headless: false, args: ['--start-maximized'] });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3004', { waitUntil: 'networkidle2' });
    
    // Check basic environment and config
    const result = await page.evaluate(() => {
      return {
        envVars: {
          VITE_USE_BACKEND: import.meta?.env?.VITE_USE_BACKEND,
          VITE_BACKEND_URL: import.meta?.env?.VITE_BACKEND_URL,
        },
        hasWindowConfig: typeof window.config !== 'undefined',
        configKeys: window.config ? Object.keys(window.config) : null,
        useBackendValue: window.config ? window.config.useBackend : null,
        backendUrlValue: window.config ? window.config.backendUrl : null
      };
    });

    console.log('📊 Configuration Results:', JSON.stringify(result, null, 2));

    // Test manual backend call
    const manualTest = await page.evaluate(async () => {
      try {
        const response = await fetch('http://localhost:3001/api/v1/health');
        return { success: true, status: response.status, ok: response.ok };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    console.log('🌐 Manual Backend Test:', JSON.stringify(manualTest, null, 2));

    await page.waitForTimeout(5000);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

simpleConfigTest().catch(console.error);