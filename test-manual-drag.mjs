import { chromium } from 'playwright';

async function testPivotManual() {
  console.log('Manual Pivot Table Test\n');
  console.log('This test will open the browser and wait for manual configuration.\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate to the application
    console.log('1. Opening http://localhost:3004...');
    await page.goto('http://localhost:3004', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Take initial screenshot
    await page.screenshot({ path: 'manual-1-initial.png', fullPage: true });
    console.log('   ✓ Initial screenshot saved\n');
    
    // Instructions for manual testing
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('MANUAL TESTING INSTRUCTIONS:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('Please perform the following actions in the browser:\n');
    console.log('1. Click "Sample Data" button to load sample data');
    console.log('2. If you see a Dashboard Manager:');
    console.log('   - Look for a way to open/edit the pivot table');
    console.log('   - Or create a new dashboard');
    console.log('3. Once in the pivot table view:');
    console.log('   - Drag "Category" to the Rows area');
    console.log('   - Drag "Region" to the Columns area');
    console.log('   - Drag "Sales" to the Values area');
    console.log('4. Try changing the aggregator from Count to Sum');
    console.log('5. Test the "Add Calculated Field" button\n');
    console.log('Press Enter when you have completed the manual configuration...');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Wait for user input
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
    
    console.log('\nCapturing final state...');
    
    // Take final screenshot
    await page.screenshot({ path: 'manual-2-configured.png', fullPage: true });
    console.log('✓ Final screenshot saved as manual-2-configured.png\n');
    
    // Check what's visible
    console.log('Checking current state:');
    console.log('─────────────────────────');
    
    const dashboardManager = await page.locator('.dashboard-manager, [class*="dashboard"]').count() > 0;
    const pivotTable = await page.locator('.pivot-table').count() > 0;
    const pivotUI = await page.locator('.pivot-table-ui, .pivottable-ui').count() > 0;
    const aggregatorVisible = await page.locator('.aggregator-selector').count() > 0;
    const fieldsVisible = await page.locator('.field-pill').count();
    
    console.log(`Dashboard Manager visible: ${dashboardManager ? 'YES' : 'NO'}`);
    console.log(`Pivot Table rendered: ${pivotTable ? 'YES' : 'NO'}`);
    console.log(`Pivot UI visible: ${pivotUI ? 'YES' : 'NO'}`);
    console.log(`Aggregator selector visible: ${aggregatorVisible ? 'YES' : 'NO'}`);
    console.log(`Field pills visible: ${fieldsVisible}`);
    
    if (pivotTable) {
      const rows = await page.locator('.pivot-table tbody tr').count();
      const cols = await page.locator('.pivot-table thead th').count();
      const cells = await page.locator('.pivot-table .data-cell').count();
      
      console.log(`\nPivot table details:`);
      console.log(`  - Data rows: ${rows}`);
      console.log(`  - Header columns: ${cols}`);
      console.log(`  - Data cells: ${cells}`);
    }
    
    // Check for fields in drop zones
    const rowFields = await page.locator('.row-fields .field-pill').count();
    const colFields = await page.locator('.column-fields .field-pill').count();
    const valFields = await page.locator('.value-fields .field-pill').count();
    
    if (rowFields > 0 || colFields > 0 || valFields > 0) {
      console.log(`\nField configuration:`);
      console.log(`  - Fields in Rows: ${rowFields}`);
      console.log(`  - Fields in Columns: ${colFields}`);
      console.log(`  - Fields in Values: ${valFields}`);
    }
    
    console.log('\n✅ Manual test completed!');
    console.log('\nSUMMARY:');
    console.log('────────');
    console.log('The frontend code has been reverted to use internal pivot logic.');
    console.log('All functionality should now be working as before.');
    console.log('Please verify that drag-and-drop and pivot table rendering work correctly.');
    
  } catch (error) {
    console.error('\n❌ Error during test:', error.message);
    await page.screenshot({ path: 'manual-error.png', fullPage: true });
  } finally {
    console.log('\nClosing browser...');
    await browser.close();
  }
}

// Enable stdin for user input
process.stdin.resume();
process.stdin.setEncoding('utf8');

// Run the test
testPivotManual().catch(console.error);