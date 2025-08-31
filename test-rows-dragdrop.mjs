import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the app
    await page.goto('http://localhost:3004');
    await page.waitForTimeout(2000);

    console.log('Testing rows drag-drop positioning...');

    // First, add some fields to rows to test repositioning
    console.log('Adding Category to rows...');
    const categoryField = page.locator('.field-item-horizontal:has-text("Category")').first();
    const rowsDropZone = page.locator('.drop-zone-rows .field-drop-zone');
    await categoryField.dragTo(rowsDropZone);
    await page.waitForTimeout(1000);

    console.log('Adding Product to rows...');
    const productField = page.locator('.field-item-horizontal:has-text("Product")').first();
    await productField.dragTo(rowsDropZone);
    await page.waitForTimeout(1000);

    console.log('Adding Year to rows...');
    const yearField = page.locator('.field-item-horizontal:has-text("Year")').first();
    await yearField.dragTo(rowsDropZone);
    await page.waitForTimeout(1000);

    // Now test repositioning by dragging Year to the first position
    console.log('Testing repositioning: Moving Year to first position...');
    const yearInRows = page.locator('.drop-zone-rows .field-item-horizontal:has-text("Year")');
    const firstDropIndicator = page.locator('.drop-zone-rows .drop-indicator').first();
    
    // Try dragging to the first drop indicator
    await yearInRows.dragTo(firstDropIndicator);
    await page.waitForTimeout(1000);

    console.log('Testing repositioning: Moving Category to middle position...');
    const categoryInRows = page.locator('.drop-zone-rows .field-item-horizontal:has-text("Category")');
    const dropIndicators = page.locator('.drop-zone-rows .drop-indicator');
    const middleDropIndicator = dropIndicators.nth(1);
    
    // Try dragging to the middle drop indicator
    await categoryInRows.dragTo(middleDropIndicator);
    await page.waitForTimeout(1000);

    console.log('Final state - checking field order in rows...');
    const rowsFields = page.locator('.drop-zone-rows .field-item-horizontal');
    const count = await rowsFields.count();
    console.log(`Number of fields in rows: ${count}`);
    
    for (let i = 0; i < count; i++) {
      const fieldText = await rowsFields.nth(i).textContent();
      console.log(`Position ${i + 1}: ${fieldText?.trim()}`);
    }

    console.log('Test completed. Check the browser to see the results.');
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
})();