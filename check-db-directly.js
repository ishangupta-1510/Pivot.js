/**
 * Check database directly for CSV data format
 */

const { Client } = require('pg');

async function checkDatabase() {
  console.log('🔍 Connecting to database directly...');

  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'pivot_grid_dev',
    user: 'pivot_user',
    password: 'pivot_secure_password',
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Check datasets table
    console.log('\n📋 Recent datasets:');
    const datasetsQuery = `
      SELECT id, name, status, total_rows, created_at 
      FROM public.datasets 
      ORDER BY created_at DESC 
      LIMIT 3
    `;
    const datasetsResult = await client.query(datasetsQuery);
    console.table(datasetsResult.rows);

    if (datasetsResult.rows.length > 0) {
      const latestDatasetId = datasetsResult.rows[0].id;
      
      // Check dataset_rows table for data format
      console.log(`\n🔍 Checking data format for dataset: ${latestDatasetId}`);
      const rowsQuery = `
        SELECT row_index, data 
        FROM public.dataset_rows 
        WHERE dataset_id = $1 
        ORDER BY row_index 
        LIMIT 5
      `;
      const rowsResult = await client.query(rowsQuery, [latestDatasetId]);
      
      console.log('\n📊 Dataset rows:');
      rowsResult.rows.forEach((row, index) => {
        console.log(`\n--- Row ${index + 1} (index: ${row.row_index}) ---`);
        console.log('Raw data:', JSON.stringify(row.data, null, 2));
        
        // Check data format
        if (typeof row.data === 'object' && row.data) {
          const keys = Object.keys(row.data);
          console.log('Data keys:', keys);
          
          if (keys.some(key => !isNaN(key))) {
            console.log('❌ PROBLEM: Using numeric indices as keys');
          } else {
            console.log('✅ GOOD: Using column names as keys');
          }
        }
      });
    }

    // Check jobs table for the latest upload options
    console.log('\n📋 Recent upload jobs:');
    const jobsQuery = `
      SELECT id, filename, status, rows_processed, created_at 
      FROM jobs.upload_jobs 
      ORDER BY created_at DESC 
      LIMIT 3
    `;
    const jobsResult = await client.query(jobsQuery);
    console.table(jobsResult.rows);

  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

checkDatabase().catch(console.error);