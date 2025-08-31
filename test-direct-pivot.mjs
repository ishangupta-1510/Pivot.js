import { chromium } from 'playwright';

async function testDirectPivot() {
  console.log('Testing Direct Pivot Table View\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate to the application
    console.log('1. Navigating to http://localhost:3004...');
    await page.goto('http://localhost:3004', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Take initial screenshot
    await page.screenshot({ path: 'direct-1-initial.png', fullPage: true });
    console.log('   ✓ Initial screenshot saved');
    
    // DON'T click Dashboards - just load sample data directly
    console.log('\n2. Loading sample data (without opening Dashboard Manager)...');
    const sampleDataBtn = page.locator('button:has-text("Sample Data")').first();
    if (await sampleDataBtn.isVisible()) {
      await sampleDataBtn.click();
      await page.waitForTimeout(2000);
      console.log('   ✓ Sample data loaded');
    }
    
    // Take screenshot after data load
    await page.screenshot({ path: 'direct-2-with-data.png', fullPage: true });
    console.log('   ✓ Screenshot with data saved');
    
    // Check what's visible
    console.log('\n3. Checking UI elements...');
    
    // Check for field pills in the horizontal bar
    const fieldPills = await page.locator('.field-item-horizontal').count();
    console.log(`   Field pills found: ${fieldPills}`);
    
    if (fieldPills > 0) {
      console.log('   Fields available:');
      for (let i = 0; i < Math.min(fieldPills, 5); i++) {
        const text = await page.locator('.field-item-horizontal').nth(i).textContent();
        console.log(`     - ${text}`);
      }
    }
    
    // Check for drop zones
    const hasFilterZone = await page.locator('.drop-zone-filter').count() > 0;
    const hasColumnZone = await page.locator('.drop-zone-columns').count() > 0;
    const hasRowZone = await page.locator('.drop-zone-rows').count() > 0;
    const hasValueZone = await page.locator('.drop-zone-values').count() > 0;
    
    console.log(`\n4. Drop zones check:`);
    console.log(`   Filter zone: ${hasFilterZone ? 'YES' : 'NO'}`);
    console.log(`   Column zone: ${hasColumnZone ? 'YES' : 'NO'}`);
    console.log(`   Row zone: ${hasRowZone ? 'YES' : 'NO'}`);
    console.log(`   Value zone: ${hasValueZone ? 'YES' : 'NO'}`);
    
    // Try dragging Category to Rows
    console.log('\n5. Testing drag and drop...');
    const categoryPill = page.locator('.field-item-horizontal:has-text("Category")').first();
    const rowsDropZone = page.locator('.drop-zone-rows .field-drop-zone').first();
    
    if (await categoryPill.count() > 0 && await rowsDropZone.count() > 0) {
      console.log('   Attempting to drag Category to Rows...');
      try {
        await categoryPill.dragTo(rowsDropZone);
        await page.waitForTimeout(1500);
        console.log('   ✓ Drag operation completed');
      } catch (e) {
        console.log('   ⚠ Drag failed, trying alternative...');
        // Try hover and click approach
        await categoryPill.hover();
        await page.mouse.down();
        await rowsDropZone.hover();
        await page.mouse.up();
        await page.waitForTimeout(1500);
      }
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'direct-3-final.png', fullPage: true });
    console.log('\n6. Final screenshot saved');
    
    // Check if pivot table rendered
    const pivotTable = await page.locator('.pivot-table-simple').count() > 0;
    console.log(`\n7. Pivot table rendered: ${pivotTable ? 'YES' : 'NO'}`);
    
    if (pivotTable) {
      const rows = await page.locator('.pivot-table-simple tbody tr').count();
      console.log(`   Data rows: ${rows}`);
    }
    
    console.log('\n✅ Direct pivot table test completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await page.screenshot({ path: 'direct-error.png', fullPage: true });
  } finally {
    console.log('\nClosing browser...');
    await browser.close();
  }
}

testDirectPivot().catch(console.error);