import puppeteer from 'puppeteer';
import fs from 'fs';

async function debugUpload() {
  const browser = await puppeteer.launch({ headless: false, args: ['--start-maximized'] });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`🖥️ ${msg.text()}`);
  });

  const requests = [];
  page.on('request', request => {
    if (request.url().includes('localhost:3001')) {
      requests.push(`${request.method()} ${request.url()}`);
      console.log(`📡 ${request.method()} ${request.url()}`);
    }
  });

  try {
    await page.goto('http://localhost:3002', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const uploadBtn = await page.$('button');
    await uploadBtn.click();
    await new Promise(r => setTimeout(r, 1000));

    fs.writeFileSync('debug.csv', 'Name,Age\\nJohn,25');
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile('./debug.csv');
    
    await new Promise(r => setTimeout(r, 5000));

    console.log('\\n📊 Summary:');
    console.log(`Backend requests: ${requests.length}`);
    console.log(`CSV uploads: ${requests.filter(r => r.includes('/upload/csv')).length}`);

    fs.unlinkSync('debug.csv');
    await new Promise(r => setTimeout(r, 3000));

  } catch (error) {
    console.error('❌', error.message);
  } finally {
    await browser.close();
  }
}

debugUpload();