import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api/v1';

async function monitorProcessing() {
  console.log('🔄 Monitoring CSV Processing...\n');
  
  let attempts = 0;
  const maxAttempts = 60; // Monitor for 5 minutes
  
  while (attempts < maxAttempts) {
    try {
      // Get queue status
      const queueResponse = await fetch(`${API_BASE}/queues/stats`, {
        headers: { 'x-api-key': 'dev-api-key' }
      });
      
      if (queueResponse.ok) {
        const queueData = await queueResponse.json();
        const csvQueue = queueData.data.find(q => q.name === 'csv-processing');
        
        console.clear();
        console.log('🔄 CSV Processing Monitor');
        console.log('=' .repeat(50));
        console.log(`Time: ${new Date().toLocaleTimeString()}`);
        console.log(`Attempt: ${attempts + 1}/${maxAttempts}\n`);
        
        console.log('📊 Queue Status:');
        console.log(`   - Waiting: ${csvQueue.counts.waiting}`);
        console.log(`   - Active: ${csvQueue.counts.active}`);
        console.log(`   - Completed: ${csvQueue.counts.completed}`);
        console.log(`   - Failed: ${csvQueue.counts.failed}\n`);
        
        if (csvQueue.jobs.active.length > 0) {
          const activeJob = csvQueue.jobs.active[0];
          console.log('🚧 Active Job:');
          console.log(`   - ID: ${activeJob.id}`);
          console.log(`   - Progress: ${activeJob.progress.percentage}%`);
          console.log(`   - Step: ${activeJob.progress.currentStep}`);
          console.log(`   - Rows Processed: ${activeJob.progress.processedRows || 0}`);
          console.log(`   - Total Rows: ${activeJob.progress.totalRows || 'Unknown'}\n`);
          
          // If processing data, show more details
          if (activeJob.progress.percentage > 20) {
            const speed = activeJob.progress.processingSpeed || 0;
            console.log(`   - Processing Speed: ${speed} rows/sec`);
            
            if (activeJob.progress.totalRows && speed > 0) {
              const remaining = activeJob.progress.totalRows - (activeJob.progress.processedRows || 0);
              const estimatedSeconds = Math.round(remaining / speed);
              const estimatedMinutes = Math.round(estimatedSeconds / 60);
              console.log(`   - Estimated time remaining: ${estimatedMinutes} minutes`);
            }
          }
        } else {
          console.log('⏸️  No active jobs');
        }
        
        if (csvQueue.jobs.failed.length > 0) {
          console.log('\n❌ Failed Jobs:');
          csvQueue.jobs.failed.slice(0, 3).forEach(job => {
            console.log(`   - ${job.id}: ${job.error}`);
          });
        }
        
        // Check if processing is complete
        if (csvQueue.counts.active === 0 && csvQueue.counts.waiting === 0) {
          console.log('\n✅ No active processing jobs');
          
          // Check if we have a recently completed job
          if (csvQueue.counts.completed > 0) {
            console.log('🎉 Processing may be complete! Checking database...');
            break;
          }
        }
      }
      
    } catch (error) {
      console.error('Error monitoring:', error.message);
    }
    
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
  }
  
  // Final check of database
  console.log('\n🔍 Final Database Check...');
  try {
    const { execSync } = await import('child_process');
    execSync('node check-dataset-rows.mjs', { stdio: 'inherit' });
  } catch (error) {
    console.error('Could not run database check:', error.message);
  }
}

monitorProcessing().catch(console.error);