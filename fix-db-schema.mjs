import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://pivot_user:pivot_secure_password@localhost:5432/pivot_grid_dev'
});

async function fixDatabaseSchema() {
  try {
    await client.connect();
    console.log('Connected to database\n');
    
    // Check current schema for upload_jobs table
    const schemaResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'jobs' AND table_name = 'upload_jobs'
      ORDER BY ordinal_position
    `);
    
    console.log('Current upload_jobs schema:');
    console.log('=' .repeat(80));
    schemaResult.rows.forEach(row => {
      console.log(`${row.column_name}: ${row.data_type} ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // The error shows: "text versus character varying"
    // Let's fix the status column type if needed
    console.log('\n🔧 Fixing status column type...');
    
    try {
      // Check if status column is text or varchar
      const statusColumn = schemaResult.rows.find(row => row.column_name === 'status');
      
      if (statusColumn && statusColumn.data_type === 'text') {
        console.log('Status column is TEXT type, converting to VARCHAR...');
        await client.query(`
          ALTER TABLE jobs.upload_jobs 
          ALTER COLUMN status TYPE VARCHAR(50)
        `);
        console.log('✅ Status column converted to VARCHAR');
      } else if (statusColumn && statusColumn.data_type === 'character varying') {
        console.log('Status column is already VARCHAR - checking constraints...');
        
        // Make sure it can handle our status values
        await client.query(`
          ALTER TABLE jobs.upload_jobs 
          ALTER COLUMN status TYPE VARCHAR(50)
        `);
        console.log('✅ Status column size adjusted');
      }
      
      // Also check progress_percentage column
      const progressColumn = schemaResult.rows.find(row => row.column_name === 'progress_percentage');
      if (progressColumn && progressColumn.data_type !== 'numeric') {
        console.log('Fixing progress_percentage column...');
        await client.query(`
          ALTER TABLE jobs.upload_jobs 
          ALTER COLUMN progress_percentage TYPE NUMERIC(5,2)
        `);
        console.log('✅ Progress column fixed');
      }
      
      // Check rows_processed column
      const rowsColumn = schemaResult.rows.find(row => row.column_name === 'rows_processed');
      if (rowsColumn && rowsColumn.data_type !== 'bigint') {
        console.log('Fixing rows_processed column...');
        await client.query(`
          ALTER TABLE jobs.upload_jobs 
          ALTER COLUMN rows_processed TYPE BIGINT
        `);
        console.log('✅ Rows processed column fixed');
      }
      
    } catch (error) {
      console.log('⚠️  Schema fix error:', error.message);
    }
    
    // Also clean up any stuck jobs
    console.log('\n🧹 Cleaning up stuck processing jobs...');
    
    const updateResult = await client.query(`
      UPDATE jobs.upload_jobs 
      SET status = 'failed', 
          error_message = 'Restarted due to Redis connection issues',
          updated_at = NOW()
      WHERE status = 'processing' 
      AND created_at < NOW() - INTERVAL '10 minutes'
      RETURNING id, original_filename
    `);
    
    console.log(`✅ Updated ${updateResult.rowCount} stuck jobs`);
    updateResult.rows.forEach(row => {
      console.log(`  - ${row.id}: ${row.original_filename}`);
    });
    
    // Show final schema
    console.log('\n📋 Final schema:');
    const finalSchema = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'jobs' AND table_name = 'upload_jobs'
      ORDER BY ordinal_position
    `);
    
    finalSchema.rows.forEach(row => {
      console.log(`${row.column_name}: ${row.data_type} ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

fixDatabaseSchema();