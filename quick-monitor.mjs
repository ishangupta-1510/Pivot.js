import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api/v1';

async function quickMonitor() {
  console.log('🔄 Quick Processing Monitor - 2 minutes\n');
  
  for (let i = 0; i < 24; i++) { // 24 * 5 seconds = 2 minutes
    try {
      const response = await fetch(`${API_BASE}/queues/stats`, {
        headers: { 'x-api-key': 'dev-api-key' }
      });
      
      if (response.ok) {
        const data = await response.json();
        const csvQueue = data.data.find(q => q.name === 'csv-processing');
        
        console.clear();
        console.log(`🕐 Time: ${new Date().toLocaleTimeString()} | Check: ${i + 1}/24`);
        console.log('=' .repeat(60));
        
        console.log(`📊 Queue: Active: ${csvQueue.counts.active} | Completed: ${csvQueue.counts.completed} | Failed: ${csvQueue.counts.failed}`);
        
        if (csvQueue.jobs.active.length > 0) {
          csvQueue.jobs.active.forEach((job, index) => {
            const progress = job.progress.percentage || 0;
            const step = job.progress.currentStep || 'Unknown';
            const rows = job.progress.processedRows || 0;
            console.log(`🚧 Job ${index + 1}: ${progress}% | ${step} | Rows: ${rows.toLocaleString()}`);
          });
        } else {
          console.log('⏸️  No active jobs currently');
          
          if (csvQueue.counts.completed > 0) {
            console.log('🎉 Jobs may have completed!');
            break;
          }
        }
      }
    } catch (error) {
      console.error('Monitor error:', error.message);
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log('\n✅ Monitor complete!');
}

quickMonitor().catch(console.error);