import { chromium } from 'playwright';

async function testEditDashboard() {
  console.log('Testing Dashboard Edit Mode\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 200
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate to the application
    console.log('1. Navigating to http://localhost:3004...');
    await page.goto('http://localhost:3004', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Click on Sample Data button to load data
    console.log('2. Loading sample data...');
    const sampleDataBtn = page.locator('button:has-text("Sample Data")');
    if (await sampleDataBtn.isVisible()) {
      await sampleDataBtn.click();
      await page.waitForTimeout(2000);
      console.log('   ✓ Sample data loaded');
    }
    
    // Click on the edit button (pencil icon) for the dashboard
    console.log('3. Looking for edit button...');
    const editBtn = page.locator('.dashboard-card button[title*="Edit"], .dashboard-item button[title*="Edit"], button:has-text("✏"), svg[data-icon="pencil"], [aria-label*="edit" i]').first();
    
    if (await editBtn.count() > 0) {
      console.log('   ✓ Found edit button, clicking...');
      await editBtn.click();
      await page.waitForTimeout(2000);
    } else {
      // Try clicking on the dashboard card itself
      console.log('   Edit button not found, trying dashboard card...');
      const dashboardCard = page.locator('text=Test Sales Pivot Dashboard').first();
      if (await dashboardCard.isVisible()) {
        await dashboardCard.click();
        await page.waitForTimeout(2000);
      }
    }
    
    // Take screenshot after opening edit mode
    await page.screenshot({ path: 'test-edit-mode.png', fullPage: true });
    console.log('4. Screenshot saved as test-edit-mode.png');
    
    // Check what's visible now
    console.log('\n5. Checking UI elements in edit mode:');
    const rowsZone = await page.locator('.row-fields, .rows-drop-zone, [data-zone="rows"]').count() > 0;
    const colsZone = await page.locator('.column-fields, .columns-drop-zone, [data-zone="columns"]').count() > 0;
    const valsZone = await page.locator('.value-fields, .values-drop-zone, [data-zone="values"]').count() > 0;
    
    console.log(`   Rows drop zone: ${rowsZone ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`   Columns drop zone: ${colsZone ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`   Values drop zone: ${valsZone ? 'FOUND' : 'NOT FOUND'}`);
    
    // Check for field pills
    const fieldPills = await page.locator('.field-pill').count();
    console.log(`   Field pills found: ${fieldPills}`);
    
    // Try a simple drag operation
    console.log('\n6. Attempting drag operation...');
    const categoryPill = page.locator('.field-pill:has-text("Category")').first();
    
    if (await categoryPill.isVisible()) {
      // Get the rows drop zone
      const rowsDropZone = page.locator('.row-fields .field-drop-zone, .rows-drop-zone').first();
      
      if (await rowsDropZone.count() > 0) {
        try {
          await categoryPill.dragTo(rowsDropZone);
          await page.waitForTimeout(1500);
          console.log('   ✓ Drag operation completed');
          
          // Check if Category is now in Rows
          const categoryInRows = await page.locator('.row-fields .field-pill:has-text("Category")').count() > 0;
          console.log(`   Category in Rows: ${categoryInRows ? 'YES' : 'NO'}`);
        } catch (e) {
          console.log('   ⚠ Drag operation failed:', e.message);
        }
      }
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'test-edit-final.png', fullPage: true });
    console.log('\n7. Final screenshot saved as test-edit-final.png');
    
    console.log('\n✅ Test completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await page.screenshot({ path: 'test-edit-error.png', fullPage: true });
  } finally {
    console.log('\nClosing browser...');
    await browser.close();
  }
}

testEditDashboard().catch(console.error);