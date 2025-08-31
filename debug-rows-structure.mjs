import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the app
    await page.goto('http://localhost:3004');
    await page.waitForTimeout(2000);

    console.log('Adding some fields to rows first...');
    
    // Add Category to rows
    const categoryField = page.locator('.field-item-horizontal:has-text("Category")').first();
    const rowsDropZone = page.locator('.drop-zone-rows .field-drop-zone');
    await categoryField.dragTo(rowsDropZone);
    await page.waitForTimeout(1000);

    // Add Product to rows
    const productField = page.locator('.field-item-horizontal:has-text("Product")').first();
    await productField.dragTo(rowsDropZone);
    await page.waitForTimeout(1000);

    // Check the structure of the rows section
    console.log('Checking rows structure...');
    
    const dropIndicators = page.locator('.drop-zone-rows .drop-indicator');
    const indicatorCount = await dropIndicators.count();
    console.log(`Number of drop indicators in rows: ${indicatorCount}`);
    
    const fieldPills = page.locator('.drop-zone-rows .field-item-horizontal');
    const pillCount = await fieldPills.count();
    console.log(`Number of field pills in rows: ${pillCount}`);

    // Check if drop indicators are visible
    for (let i = 0; i < indicatorCount; i++) {
      const indicator = dropIndicators.nth(i);
      const isVisible = await indicator.isVisible();
      const boundingBox = await indicator.boundingBox();
      console.log(`Drop indicator ${i}: visible=${isVisible}, box=${JSON.stringify(boundingBox)}`);
    }

    // Try to interact with each drop indicator
    console.log('\nTesting drop indicator interactions...');
    for (let i = 0; i < indicatorCount; i++) {
      const indicator = dropIndicators.nth(i);
      try {
        await indicator.hover();
        console.log(`Successfully hovered over drop indicator ${i}`);
        await page.waitForTimeout(500);
      } catch (error) {
        console.log(`Failed to hover over drop indicator ${i}: ${error.message}`);
      }
    }

    console.log('\nManual test: Try dragging a field to different positions in rows...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('Debug failed:', error);
  } finally {
    await browser.close();
  }
})();