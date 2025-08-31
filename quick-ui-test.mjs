import puppeteer from 'puppeteer';

async function quickTest() {
  const browser = await puppeteer.launch({ headless: false, args: ['--start-maximized'] });
  const page = await browser.newPage();
  
  // Listen for console logs
  page.on('console', msg => {
    console.log(`🖥️  ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  try {
    await page.goto('http://localhost:3002', { waitUntil: 'networkidle2' });
    console.log('✅ Page loaded, waiting for logs...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await page.screenshot({ path: 'quick-test.png' });
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

quickTest();