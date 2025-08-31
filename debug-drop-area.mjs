import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Opening browser to inspect drop areas...');
    
    // Navigate to the app
    await page.goto('http://localhost:3004');
    await page.waitForTimeout(3000);

    // Add a field to each section to see the drop areas
    console.log('Adding fields to see drop areas...');
    
    // Add Quarter to Columns
    const quarterField = page.locator('.field-item-horizontal:has-text("Quarter")').first();
    const columnsDropZone = page.locator('.drop-zone-columns .field-drop-zone');
    await quarterField.dragTo(columnsDropZone);
    await page.waitForTimeout(1000);

    // Add Cost to Rows
    const costField = page.locator('.field-item-horizontal:has-text("Cost")').first();
    const rowsDropZone = page.locator('.drop-zone-rows .field-drop-zone');
    await costField.dragTo(rowsDropZone);
    await page.waitForTimeout(1000);

    // Add Profit to Values
    const profitField = page.locator('.field-item-horizontal:has-text("Profit")').first();
    const valuesDropZone = page.locator('.drop-zone-values .field-drop-zone');
    await profitField.dragTo(valuesDropZone);
    await page.waitForTimeout(1000);

    console.log('Checking drop zone sizes...');
    
    // Check drop zone container sizes
    const columnsContainer = page.locator('.drop-zone-columns');
    const rowsContainer = page.locator('.drop-zone-rows');
    const valuesContainer = page.locator('.drop-zone-values .field-drop-zone');
    
    const columnsBounds = await columnsContainer.boundingBox();
    const rowsBounds = await rowsContainer.boundingBox();
    const valuesBounds = await valuesContainer.boundingBox();
    
    console.log('Columns container:', columnsBounds);
    console.log('Rows container:', rowsBounds);
    console.log('Values field-drop-zone:', valuesBounds);

    // Check field-drop-zone sizes
    const columnsFieldZone = page.locator('.drop-zone-columns .field-drop-zone');
    const rowsFieldZone = page.locator('.drop-zone-rows .field-drop-zone');
    
    const columnsFieldBounds = await columnsFieldZone.boundingBox();
    const rowsFieldBounds = await rowsFieldZone.boundingBox();
    
    console.log('Columns field-drop-zone:', columnsFieldBounds);
    console.log('Rows field-drop-zone:', rowsFieldBounds);

    console.log('Now try dragging a field to see where you can drop...');
    console.log('Browser will stay open for manual testing - check drop areas');
    
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('Debug failed:', error);
  } finally {
    await browser.close();
  }
})();