/**
 * Simple Final Backend Test
 */

import puppeteer from 'puppeteer';
import fs from 'fs';

async function simpleTest() {
  console.log('🚀 Simple Backend Test...');
  
  const browser = await puppeteer.launch({ headless: false, args: ['--start-maximized'] });
  const page = await browser.newPage();
  
  // Monitor backend requests
  const backendRequests = [];
  page.on('request', request => {
    if (request.url().includes('localhost:3001')) {
      backendRequests.push(`${request.method()} ${request.url()}`);
      console.log(`📡 ${request.method()} ${request.url()}`);
    }
  });

  try {
    await page.goto('http://localhost:3002', { waitUntil: 'networkidle2' });
    console.log('✅ Page loaded');

    // Wait for initial setup
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Find any button and click it
    const buttons = await page.$$('button');
    console.log(`🔍 Found ${buttons.length} buttons`);
    
    if (buttons.length > 0) {
      const buttonText = await page.evaluate(btn => btn.textContent, buttons[0]);
      console.log(`🖱️ Clicking button: "${buttonText}"`);
      await buttons[0].click();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Create and upload CSV
    const csv = 'Name,Age\\nJohn,25\\nJane,30';
    fs.writeFileSync('simple-test.csv', csv);

    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      console.log('📤 Uploading CSV...');
      await fileInput.uploadFile('./simple-test.csv');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Results
    const csvUploads = backendRequests.filter(req => req.includes('/upload/csv'));
    console.log('\\n📊 Results:');
    console.log(`Backend requests: ${backendRequests.length}`);
    console.log(`CSV uploads: ${csvUploads.length}`);
    
    if (csvUploads.length > 0) {
      console.log('✅ SUCCESS: Backend CSV upload working!');
    } else {
      console.log('❌ Backend CSV upload not detected');
    }

    fs.unlinkSync('simple-test.csv');
    await page.screenshot({ path: 'simple-test-result.png' });
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

simpleTest();