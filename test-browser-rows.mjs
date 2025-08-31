import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Opening browser to test rows drop functionality...');
    
    // Navigate to the app
    await page.goto('http://localhost:3004');
    await page.waitForTimeout(3000);

    console.log('Adding first field to rows...');
    // Add Category to rows first
    const categoryField = page.locator('.field-item-horizontal:has-text("Category")').first();
    const rowsDropZone = page.locator('.drop-zone-rows .field-drop-zone');
    await categoryField.dragTo(rowsDropZone);
    await page.waitForTimeout(2000);

    console.log('Adding second field to rows...');
    // Add Product to rows
    const productField = page.locator('.field-item-horizontal:has-text("Product")').first();
    await productField.dragTo(rowsDropZone);
    await page.waitForTimeout(2000);

    console.log('Now testing positional drop...');
    console.log('Trying to move Product to first position (before Category)...');
    
    // Try to get the product field pill from rows and move it
    const productInRows = page.locator('.drop-zone-rows .field-item-horizontal:has-text("Product")');
    
    // Try different approaches to drop at first position
    console.log('Approach 1: Drag to top of rows drop zone');
    const rowsDropZoneRect = await rowsDropZone.boundingBox();
    if (rowsDropZoneRect) {
      // Try dragging to top-left of the drop zone
      await productInRows.dragTo(page.locator('.drop-zone-rows .field-drop-zone'), {
        targetPosition: { x: 10, y: 10 }
      });
      await page.waitForTimeout(2000);
    }

    console.log('Current field order in rows:');
    const rowsFields = page.locator('.drop-zone-rows .field-item-horizontal');
    const count = await rowsFields.count();
    for (let i = 0; i < count; i++) {
      const fieldText = await rowsFields.nth(i).textContent();
      console.log(`Position ${i + 1}: ${fieldText?.trim()}`);
    }

    console.log('Approach 2: Try dragging to specific drop indicator');
    const dropIndicators = page.locator('.drop-zone-rows .drop-indicator');
    const indicatorCount = await dropIndicators.count();
    console.log(`Found ${indicatorCount} drop indicators in rows`);
    
    if (indicatorCount > 0) {
      console.log('Trying to drag to first drop indicator...');
      const firstDropIndicator = dropIndicators.first();
      await productInRows.dragTo(firstDropIndicator);
      await page.waitForTimeout(2000);
      
      console.log('Field order after drop indicator test:');
      for (let i = 0; i < await rowsFields.count(); i++) {
        const fieldText = await rowsFields.nth(i).textContent();
        console.log(`Position ${i + 1}: ${fieldText?.trim()}`);
      }
    }

    console.log('Manual testing - check if you can drag fields around in rows...');
    console.log('Leave browser open for manual testing');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('Browser test failed:', error);
  } finally {
    await browser.close();
  }
})();