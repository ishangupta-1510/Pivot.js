/**
 * Debug Frontend Configuration
 */

import puppeteer from 'puppeteer';

async function debugFrontendConfig() {
  console.log('🔍 Debugging Frontend Configuration...');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  // Enable console logging
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'log' || type === 'error' || type === 'warn') {
      console.log(`🖥️  FRONTEND [${type.toUpperCase()}]:`, text);
    }
  });

  try {
    await page.goto('http://localhost:3004', { waitUntil: 'networkidle2' });
    console.log('✅ App loaded');

    // Check environment variables and config
    const configData = await page.evaluate(() => {
      return {
        // Environment variables
        env: {
          VITE_USE_BACKEND: import.meta?.env?.VITE_USE_BACKEND,
          VITE_BACKEND_URL: import.meta?.env?.VITE_BACKEND_URL,
        },
        // Config object
        config: window.config,
        // Direct import
        directConfig: (() => {
          try {
            // Try to access the config module directly if possible
            return window.__CONFIG__ || null;
          } catch (e) {
            return { error: e.message };
          }
        })()
      };
    });

    console.log('📊 Frontend Configuration Data:');
    console.log('  Environment Variables:', JSON.stringify(configData.env, null, 2));
    console.log('  Config Object:', JSON.stringify(configData.config, null, 2));
    console.log('  Direct Config:', JSON.stringify(configData.directConfig, null, 2));

    // Check if we can manually test backend connection
    const backendTest = await page.evaluate(async () => {
      try {
        const response = await fetch('http://localhost:3001/api/v1/health');
        const data = await response.json();
        return { success: true, data, status: response.status };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    console.log('🌐 Backend Connection Test:', JSON.stringify(backendTest, null, 2));

    // Check file upload component state
    const fileUploadState = await page.evaluate(() => {
      const fileInput = document.querySelector('input[type="file"]');
      const uploadContainer = fileInput?.closest('[data-testid], .upload-container, .file-upload');
      
      return {
        hasFileInput: !!fileInput,
        uploadContainerExists: !!uploadContainer,
        containerClasses: uploadContainer?.className,
        containerDataAttrs: uploadContainer ? Object.fromEntries(
          Array.from(uploadContainer.attributes).map(attr => [attr.name, attr.value])
        ) : null
      };
    });

    console.log('📤 File Upload Component State:', JSON.stringify(fileUploadState, null, 2));

    // Take screenshot
    await page.screenshot({ path: 'config-debug.png', fullPage: true });
    console.log('📸 Config debug screenshot saved');

    console.log('\n🔍 Browser will stay open for manual inspection for 15 seconds...');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    await page.screenshot({ path: 'config-debug-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

debugFrontendConfig().catch(console.error);