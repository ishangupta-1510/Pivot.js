import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'pivot_grid_dev',
  user: 'pivot_user',
  password: 'pivot_secure_password'
});

const datasetId = '4aff8d3d-dd98-4645-b251-355d5aa0ff9f';

async function checkIssues() {
  try {
    // Get issue statistics
    const statsQuery = `
      SELECT 
        COUNT(*) AS total_issues,
        COUNT(*) FILTER (WHERE severity = 'error') AS error_count,
        COUNT(*) FILTER (WHERE severity = 'warning') AS warning_count,
        COUNT(DISTINCT row_number) AS affected_rows,
        COUNT(DISTINCT column_name) AS affected_columns
      FROM public.dataset_issues
      WHERE dataset_id = $1
    `;
    
    const statsResult = await pool.query(statsQuery, [datasetId]);
    const stats = statsResult.rows[0];
    
    console.log('📊 Issue Statistics:');
    console.log('   Total Issues:', stats.total_issues);
    console.log('   Errors:', stats.error_count);
    console.log('   Warnings:', stats.warning_count);
    console.log('   Affected Rows:', stats.affected_rows);
    console.log('   Affected Columns:', stats.affected_columns);
    
    // Get sample issues
    const issuesQuery = `
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
    
    const issuesResult = await pool.query(issuesQuery, [datasetId]);
    
    console.log('\n🔎 Sample Issues:');
    issuesResult.rows.forEach((issue, index) => {
      console.log(`  ${index + 1}. Row ${issue.row_number}, Column: ${issue.column_name}`);
      console.log(`     Severity: ${issue.severity}, Category: ${issue.category}`);
      console.log(`     Message: ${issue.message}`);
      if (issue.cell_value) {
        console.log(`     Value: "${issue.cell_value}"`);
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
    
    if (dataset) {
      console.log('\n📊 Dataset Flags:');
      console.log(`   Has Errors: ${dataset.has_errors}`);
      console.log(`   Has Warnings: ${dataset.has_warnings}`);
      console.log(`   Total Issue Count: ${dataset.issue_count}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkIssues();