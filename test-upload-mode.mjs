/**
 * Test Upload Processing Mode
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function testUploadMode() {
  console.log('🔍 Testing Upload Processing Mode...');
  
  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: null, 
    args: ['--start-maximized'] 
  });
  
  const page = await browser.newPage();

  // Monitor network requests
  const requests = [];
  page.on('request', request => {
    if (request.url().includes('localhost:3001')) {
      requests.push({
        url: request.url(),
        method: request.method()
      });
    }
  });

  try {
    await page.goto('http://localhost:3004', { waitUntil: 'networkidle2' });
    console.log('✅ App loaded');

    // Check configuration values
    const configValues = await page.evaluate(() => {
      return {
        hasConfig: typeof window.config !== 'undefined',
        useBackend: window.config?.useBackend,
        backendUrl: window.config?.backendUrl,
        envViteUseBackend: import.meta?.env?.VITE_USE_BACKEND
      };
    });

    console.log('📊 Configuration Values:', JSON.stringify(configValues, null, 2));

    // Check initial processing mode
    const initialMode = await page.evaluate(() => {
      const frontendRadio = document.querySelector('input[value="frontend"], input[type="radio"][data-mode="frontend"]');
      const backendRadio = document.querySelector('input[value="backend"], input[type="radio"][data-mode="backend"]');
      
      return {
        hasFrontendRadio: !!frontendRadio,
        hasBackendRadio: !!backendRadio,
        frontendChecked: frontendRadio?.checked,
        backendChecked: backendRadio?.checked,
        radioButtons: Array.from(document.querySelectorAll('input[type="radio"]')).map(r => ({
          name: r.name,
          value: r.value,
          checked: r.checked
        }))
      };
    });

    console.log('📊 Initial Processing Mode State:', JSON.stringify(initialMode, null, 2));

    // Ensure backend mode is selected if available
    if (initialMode.hasBackendRadio && !initialMode.backendChecked) {
      console.log('🔧 Switching to backend mode...');
      await page.click('input[value="backend"], input[type="radio"]:not([value="frontend"])');
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Verify mode after selection
    const modeAfterSelection = await page.evaluate(() => {
      const backendRadio = document.querySelector('input[value="backend"], input[type="radio"]:not([value="frontend"])');
      return {
        backendSelected: backendRadio?.checked || false
      };
    });

    console.log('📊 Mode After Selection:', JSON.stringify(modeAfterSelection, null, 2));

    // Create test CSV
    const testCSV = 'Name,Age,City\\nJohn,25,NYC\\nJane,30,LA';
    const csvPath = path.join(process.cwd(), 'test-mode.csv');
    fs.writeFileSync(csvPath, testCSV);

    // Upload file
    console.log('📤 Uploading CSV file...');
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(csvPath);

    // Wait and monitor what happens
    console.log('⏳ Waiting for processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check network requests made
    console.log('🌐 Network requests to backend:');
    requests.forEach((req, index) => {
      console.log(`  ${index + 1}. ${req.method} ${req.url}`);
    });

    // Check if backend API was called
    const backendUploadCalled = requests.some(req => 
      req.url.includes('/upload/csv') && req.method === 'POST'
    );

    console.log('📋 Results:');
    console.log(`  Backend upload API called: ${backendUploadCalled ? '✅ YES' : '❌ NO'}`);
    console.log(`  Total backend requests: ${requests.length}`);

    if (backendUploadCalled) {
      console.log('✅ SUCCESS: Backend processing is working!');
    } else {
      console.log('❌ ISSUE: Still using frontend processing despite backend mode');
    }

    // Take screenshot
    await page.screenshot({ path: 'upload-mode-test.png', fullPage: true });
    
    // Clean up
    fs.unlinkSync(csvPath);
    
    // Wait for manual inspection
    console.log('🔍 Keeping browser open for 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

testUploadMode().catch(console.error);