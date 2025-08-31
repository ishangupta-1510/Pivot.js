import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://pivot_user:pivot_secure_password@localhost:5432/pivot_grid_dev'
});

async function checkDatasetRows() {
  try {
    await client.connect();
    console.log('Connected to database\n');
    
    // Check total rows in dataset_rows
    const totalRowsResult = await client.query('SELECT COUNT(*) as total_rows FROM dataset_rows');
    console.log('Total rows in dataset_rows table:', totalRowsResult.rows[0].total_rows);
    
    // Check rows per dataset
    const datasetsResult = await client.query(`
      SELECT 
        d.id,
        d.name,
        d.original_filename,
        d.total_rows as expected_rows,
        d.status,
        COUNT(dr.row_index) as actual_rows,
        d.created_at
      FROM datasets d
      LEFT JOIN dataset_rows dr ON dr.dataset_id = d.id
      GROUP BY d.id
      ORDER BY d.created_at DESC
      LIMIT 10
    `);
    
    console.log('\nDatasets and their row counts:');
    console.log('=' .repeat(100));
    datasetsResult.rows.forEach(row => {
      console.log(`Dataset: ${row.name}`);
      console.log(`  - ID: ${row.id}`);
      console.log(`  - File: ${row.original_filename}`);
      console.log(`  - Expected rows: ${row.expected_rows}`);
      console.log(`  - Actual rows: ${row.actual_rows}`);
      console.log(`  - Status: ${row.status}`);
      console.log(`  - Created: ${row.created_at}`);
      console.log('  - Discrepancy:', row.expected_rows - row.actual_rows, 'rows missing');
      console.log('-'.repeat(100));
    });
    
    // Check upload jobs status
    const jobsResult = await client.query(`
      SELECT 
        id as job_id,
        status,
        original_filename,
        file_size,
        rows_processed,
        total_rows_estimated,
        progress_percentage,
        error_message,
        created_at,
        completed_at
      FROM jobs.upload_jobs
      WHERE original_filename LIKE '%100K%'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    console.log('\nUpload Jobs for 100K files:');
    console.log('=' .repeat(100));
    jobsResult.rows.forEach(job => {
      console.log(`Job ID: ${job.job_id}`);
      console.log(`  - File: ${job.original_filename}`);
      console.log(`  - Status: ${job.status}`);
      console.log(`  - Progress: ${job.progress_percentage}%`);
      console.log(`  - Rows processed: ${job.rows_processed || 0}`);
      console.log(`  - Total estimated: ${job.total_rows_estimated || 'N/A'}`);
      console.log(`  - Error: ${job.error_message || 'None'}`);
      console.log(`  - Created: ${job.created_at}`);
      console.log(`  - Completed: ${job.completed_at || 'Not completed'}`);
      console.log('-'.repeat(100));
    });
    
    // Check if there are any rows at all for the test file
    const testFileRows = await client.query(`
      SELECT COUNT(*) as count
      FROM dataset_rows dr
      JOIN datasets d ON dr.dataset_id = d.id
      WHERE d.original_filename LIKE '%test-100K-100col.csv%'
    `);
    
    console.log('\nRows for test-100K-100col.csv:', testFileRows.rows[0].count);
    
    // Sample a few rows if they exist
    if (testFileRows.rows[0].count > 0) {
      const sampleRows = await client.query(`
        SELECT dr.row_index, dr.data
        FROM dataset_rows dr
        JOIN datasets d ON dr.dataset_id = d.id
        WHERE d.original_filename LIKE '%test-100K-100col.csv%'
        ORDER BY dr.row_index
        LIMIT 3
      `);
      
      console.log('\nSample rows:');
      sampleRows.rows.forEach(row => {
        console.log(`Row ${row.row_index}:`, JSON.stringify(row.data).substring(0, 200) + '...');
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkDatasetRows();