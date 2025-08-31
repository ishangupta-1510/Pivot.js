import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { performance } from 'perf_hooks';

const API_URL = 'http://localhost:3001';
const API_BASE = `${API_URL}/api/v1`;
const CSV_FILE = 'test-100K-100col.csv';

console.log('🚀 Large CSV Upload Test');
console.log('=' .repeat(50));

// Check file exists
if (!fs.existsSync(CSV_FILE)) {
  console.error('❌ Test file not found. Please run: node generate-large-test-data.mjs');
  process.exit(1);
}

const fileStats = fs.statSync(CSV_FILE);
const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);

console.log('\n📁 File Details:');
console.log(`   - File: ${CSV_FILE}`);
console.log(`   - Size: ${fileSizeMB} MB`);
console.log(`   - Rows: 100,000`);
console.log(`   - Columns: 100`);

// Test backend
console.log('\n🔗 Testing Backend...');
try {
  const healthResponse = await fetch(`${API_URL}/health`);
  const healthData = await healthResponse.json();
  console.log(`✅ Backend Status: ${healthData.status}`);
} catch (error) {
  console.error('❌ Backend not accessible. Please start the backend first.');
  process.exit(1);
}

// Upload file
console.log('\n📤 Uploading File...');
const uploadStart = performance.now();

try {
  const form = new FormData();
  const fileStream = fs.createReadStream(CSV_FILE);
  
  // Track upload progress
  let bytesUploaded = 0;
  fileStream.on('data', (chunk) => {
    bytesUploaded += chunk.length;
    const progress = ((bytesUploaded / fileStats.size) * 100).toFixed(1);
    process.stdout.write(`\r   Progress: ${progress}% (${(bytesUploaded / 1024 / 1024).toFixed(2)} MB / ${fileSizeMB} MB)`);
  });
  
  form.append('file', fileStream, {
    filename: CSV_FILE,
    contentType: 'text/csv'
  });
  
  const response = await fetch(`${API_BASE}/upload/csv`, {
    method: 'POST',
    body: form,
    headers: {
      ...form.getHeaders(),
      'x-api-key': 'dev-api-key'
    }
  });
  
  console.log('\n');
  
  const uploadTime = ((performance.now() - uploadStart) / 1000).toFixed(2);
  
  if (response.ok) {
    const result = await response.json();
    console.log('✅ Upload Successful!');
    console.log(`   - Time: ${uploadTime} seconds`);
    console.log(`   - Speed: ${(fileStats.size / 1024 / 1024 / uploadTime).toFixed(2)} MB/s`);
    console.log(`   - Job ID: ${result.jobId || result.id || 'N/A'}`);
    
    if (result.jobId || result.id) {
      const jobId = result.jobId || result.id;
      
      // Check job status
      console.log('\n⏳ Checking Processing Status...');
      let attempts = 0;
      const maxAttempts = 30;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await fetch(`${API_BASE}/upload/jobs/${jobId}`, {
          headers: { 'x-api-key': 'dev-api-key' }
        });
        
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          
          if (status.status === 'completed' || status.state === 'completed') {
            console.log('✅ Processing Complete!');
            console.log(`   - Total rows processed: ${status.processedRows || status.totalRows || 'Unknown'}`);
            console.log(`   - Processing time: ${status.processingTime || 'Unknown'}`);
            break;
          } else if (status.status === 'failed' || status.state === 'failed') {
            console.log('❌ Processing Failed!');
            console.log(`   - Error: ${status.error || 'Unknown error'}`);
            break;
          } else {
            process.stdout.write(`\r   Status: ${status.status || status.state || 'processing'}... (${++attempts}/${maxAttempts})`);
          }
        } else {
          console.log(`\n⚠️  Could not check status: ${statusResponse.status}`);
          break;
        }
      }
      
      if (attempts >= maxAttempts) {
        console.log('\n⚠️  Processing is taking longer than expected');
      }
    }
    
    // Final statistics
    console.log('\n📊 Test Summary:');
    console.log(`   - File size: ${fileSizeMB} MB`);
    console.log(`   - Upload time: ${uploadTime} seconds`);
    console.log(`   - Upload speed: ${(fileStats.size / 1024 / 1024 / uploadTime).toFixed(2)} MB/s`);
    console.log(`   - Rows: 100,000`);
    console.log(`   - Columns: 100`);
    console.log(`   - Total cells: 10,000,000`);
    
    // Memory usage
    const memUsage = process.memoryUsage();
    console.log('\n💾 Memory Usage:');
    console.log(`   - RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   - Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    
  } else {
    const errorText = await response.text();
    console.error(`❌ Upload Failed: ${response.status}`);
    console.error(`   Error: ${errorText}`);
  }
  
} catch (error) {
  console.error('❌ Test Failed:', error.message);
  process.exit(1);
}

console.log('\n✅ Test Complete!');
console.log('To remove test file: rm test-100K-100col.csv');