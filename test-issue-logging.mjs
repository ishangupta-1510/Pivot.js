import FormData from 'form-data';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'pivot_grid_db',
  user: 'postgres',
  password: 'postgres123'
});

async function uploadTestFile() {
  console.log('🚀 Starting test file upload with intentional errors...\n');
  
  const filePath = path.join(__dirname, 'test-errors.csv');
  const fileStats = fs.statSync(filePath);
  
  console.log('📄 Test file details:');
  console.log(`   Path: ${filePath}`);
  console.log(`   Size: ${(fileStats.size / 1024).toFixed(2)} KB`);
  console.log(`   Contains: 15 rows with various validation errors\n`);
  
  // Create form data
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('name', 'Test Error Dataset');
  form.append('description', 'Test dataset with intentional errors for validation');
  form.append('hasHeaders', 'true');
  form.append('delimiter', ',');
  
  console.log('📤 Uploading file to backend...');
  
  try {
    const response = await fetch('http://localhost:3001/api/v1/upload/csv', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${result.message}`);
    }
    
    console.log('✅ Upload successful!');
    console.log(`   Dataset ID: ${result.data.dataset.id}`);
    console.log(`   Job ID: ${result.data.job.id}`);
    console.log(`   Status: ${result.data.job.status}\n`);
    
    return {
      datasetId: result.data.dataset.id,
      jobId: result.data.job.id
    };
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    throw error;
  }
}

async function waitForProcessing(jobId, maxWaitTime = 60000) {
  console.log('⏳ Waiting for processing to complete...');
  
  const startTime = Date.now();
  let lastStatus = '';
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await fetch(`http://localhost:3001/api/v1/upload/jobs/${jobId}`);
      const result = await response.json();
      
      if (result.data.status !== lastStatus) {
        console.log(`   Status: ${result.data.status} (${result.data.progress}%)`);
        lastStatus = result.data.status;
      }
      
      if (result.data.status === 'completed' || result.data.status === 'failed') {
        console.log(`\n✅ Processing ${result.data.status}!`);
        return result.data;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('   Error checking status:', error.message);
    }
  }
  
  throw new Error('Processing timeout');
}

async function checkIssues(datasetId) {
  console.log('\n🔍 Checking logged issues...\n');
  
  try {
    // Get issue statistics
    const statsQuery = `
      SELECT 
        COUNT(*) AS total_issues,
        COUNT(*) FILTER (WHERE severity = 'error') AS error_count,
        COUNT(*) FILTER (WHERE severity = 'warning') AS warning_count,
        COUNT(*) FILTER (WHERE severity = 'info') AS info_count,
        COUNT(DISTINCT row_number) AS affected_rows,
        COUNT(DISTINCT column_name) AS affected_columns
      FROM public.dataset_issues
      WHERE dataset_id = $1
    `;
    
    const statsResult = await pool.query(statsQuery, [datasetId]);
    const stats = statsResult.rows[0];
    
    console.log('📊 Issue Statistics:');
    console.log(`   Total Issues: ${stats.total_issues}`);
    console.log(`   Errors: ${stats.error_count}`);
    console.log(`   Warnings: ${stats.warning_count}`);
    console.log(`   Info: ${stats.info_count}`);
    console.log(`   Affected Rows: ${stats.affected_rows}`);
    console.log(`   Affected Columns: ${stats.affected_columns}\n`);
    
    // Get detailed issues grouped by category
    const issuesQuery = `
      SELECT 
        category,
        severity,
        COUNT(*) as count,
        array_agg(DISTINCT column_name) as columns,
        array_agg(DISTINCT row_number ORDER BY row_number) as rows
      FROM public.dataset_issues
      WHERE dataset_id = $1
      GROUP BY category, severity
      ORDER BY severity, category
    `;
    
    const issuesResult = await pool.query(issuesQuery, [datasetId]);
    
    console.log('📋 Issues by Category:');
    issuesResult.rows.forEach(issue => {
      console.log(`\n   ${issue.severity.toUpperCase()} - ${issue.category}:`);
      console.log(`     Count: ${issue.count}`);
      console.log(`     Columns: ${issue.columns.filter(c => c).join(', ') || 'N/A'}`);
      console.log(`     Rows: ${issue.rows.filter(r => r).slice(0, 5).join(', ')}${issue.rows.length > 5 ? '...' : ''}`);
    });
    
    // Get sample of actual issues
    const sampleQuery = `
      SELECT 
        row_number,
        column_name,
        severity,
        category,
        message,
        cell_value
      FROM public.dataset_issues
      WHERE dataset_id = $1
      ORDER BY row_number, column_name
      LIMIT 10
    `;
    
    const sampleResult = await pool.query(sampleQuery, [datasetId]);
    
    console.log('\n\n🔎 Sample Issues (first 10):');
    sampleResult.rows.forEach((issue, index) => {
      console.log(`\n   ${index + 1}. Row ${issue.row_number || 'N/A'}, Column: ${issue.column_name || 'N/A'}`);
      console.log(`      Severity: ${issue.severity}`);
      console.log(`      Category: ${issue.category}`);
      console.log(`      Message: ${issue.message}`);
      if (issue.cell_value) {
        console.log(`      Value: "${issue.cell_value}"`);
      }
    });
    
    // Check dataset flags
    const datasetQuery = `
      SELECT has_errors, has_warnings, issue_count
      FROM public.datasets
      WHERE id = $1
    `;
    
    const datasetResult = await pool.query(datasetQuery, [datasetId]);
    const dataset = datasetResult.rows[0];
    
    console.log('\n\n📊 Dataset Flags:');
    console.log(`   Has Errors: ${dataset.has_errors}`);
    console.log(`   Has Warnings: ${dataset.has_warnings}`);
    console.log(`   Total Issue Count: ${dataset.issue_count}`);
    
  } catch (error) {
    console.error('❌ Error checking issues:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('================================');
    console.log('  CSV Issue Logging Test');
    console.log('================================\n');
    
    // Upload the test file
    const { datasetId, jobId } = await uploadTestFile();
    
    // Wait for processing to complete
    await waitForProcessing(jobId);
    
    // Allow time for issue flushing
    console.log('⏳ Waiting for issue logging to flush...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check the logged issues
    await checkIssues(datasetId);
    
    console.log('\n\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();