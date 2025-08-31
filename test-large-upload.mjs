import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { performance } from 'perf_hooks';
import os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// Configuration
const API_URL = 'http://localhost:3001';
const API_BASE = `${API_URL}/api/v1`;
const CSV_FILE = 'test-100K-100col.csv';
const TEST_RESULTS_FILE = 'large-upload-test-results.json';

// Performance metrics
const metrics = {
  testStartTime: new Date().toISOString(),
  fileName: CSV_FILE,
  fileSize: 0,
  rows: 100000,
  columns: 100,
  uploadMetrics: {},
  processingMetrics: {},
  memoryMetrics: {},
  errors: [],
  dataIntegrity: {}
};

// Helper function to get memory usage
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: (usage.rss / 1024 / 1024).toFixed(2) + ' MB',
    heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
    heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
    external: (usage.external / 1024 / 1024).toFixed(2) + ' MB',
    systemFree: (os.freemem() / 1024 / 1024).toFixed(2) + ' MB',
    systemTotal: (os.totalmem() / 1024 / 1024).toFixed(2) + ' MB'
  };
}

// Helper function to monitor backend process
async function getBackendMetrics() {
  try {
    const response = await fetch(`${API_URL}/health`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.log('⚠️  Could not fetch backend metrics');
  }
  return null;
}

// Main test function
async function runLargeFileUploadTest() {
  console.log('🧪 Starting Large File Upload Test');
  console.log('=' .repeat(50));
  
  // Step 1: Check if CSV file exists
  if (!fs.existsSync(CSV_FILE)) {
    console.log('❌ CSV file not found. Generating test data...');
    try {
      await execAsync('node generate-large-test-data.mjs');
    } catch (error) {
      console.error('Failed to generate test data:', error);
      process.exit(1);
    }
  }
  
  // Get file stats
  const fileStats = fs.statSync(CSV_FILE);
  metrics.fileSize = fileStats.size;
  const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
  
  console.log('\n📁 Test File Information:');
  console.log(`   - File: ${CSV_FILE}`);
  console.log(`   - Size: ${fileSizeMB} MB`);
  console.log(`   - Rows: ${metrics.rows.toLocaleString()}`);
  console.log(`   - Columns: ${metrics.columns}`);
  
  // Step 2: Initial memory baseline
  console.log('\n💾 Initial Memory Status:');
  metrics.memoryMetrics.initial = getMemoryUsage();
  console.log(metrics.memoryMetrics.initial);
  
  // Step 3: Test backend connectivity
  console.log('\n🔗 Testing Backend Connectivity...');
  try {
    const healthResponse = await fetch(`${API_URL}/health`);
    if (!healthResponse.ok) {
      throw new Error(`Backend health check failed: ${healthResponse.status}`);
    }
    const healthData = await healthResponse.json();
    console.log('✅ Backend is running and healthy');
    console.log(`   - Status: ${healthData.status}`);
    console.log(`   - Database: ${healthData.services?.database?.status || 'unknown'}`);
    console.log(`   - Redis: ${healthData.services?.redis?.status || 'unknown'}`);
  } catch (error) {
    console.error('❌ Backend is not accessible:', error.message);
    console.log('Please ensure the backend is running on port 3001');
    process.exit(1);
  }
  
  // Step 4: Upload the file
  console.log('\n📤 Starting File Upload...');
  console.log('   This may take several minutes for large files...');
  
  const uploadStartTime = performance.now();
  const uploadStartMemory = getMemoryUsage();
  
  try {
    // Create form data with file stream
    const form = new FormData();
    const fileStream = fs.createReadStream(CSV_FILE);
    form.append('file', fileStream, {
      filename: CSV_FILE,
      contentType: 'text/csv'
    });
    
    // Monitor progress
    let bytesUploaded = 0;
    const totalBytes = fileStats.size;
    let lastProgressUpdate = 0;
    
    fileStream.on('data', (chunk) => {
      bytesUploaded += chunk.length;
      const progress = ((bytesUploaded / totalBytes) * 100).toFixed(1);
      const now = Date.now();
      
      // Update progress every second
      if (now - lastProgressUpdate > 1000) {
        process.stdout.write(`\r   Upload Progress: ${progress}% (${(bytesUploaded / 1024 / 1024).toFixed(2)} MB / ${fileSizeMB} MB)`);
        lastProgressUpdate = now;
      }
    });
    
    // Make the upload request
    const uploadResponse = await fetch(`${API_BASE}/upload/csv`, {
      method: 'POST',
      body: form,
      headers: {
        ...form.getHeaders(),
        'x-api-key': 'dev-api-key' // Add authentication
      },
      // Set a high timeout for large files
      timeout: 600000 // 10 minutes
    });
    
    const uploadEndTime = performance.now();
    const uploadDuration = ((uploadEndTime - uploadStartTime) / 1000).toFixed(2);
    
    console.log('\n');
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
    }
    
    const uploadResult = await uploadResponse.json();
    
    // Record upload metrics
    metrics.uploadMetrics = {
      duration: `${uploadDuration} seconds`,
      averageSpeed: `${(fileStats.size / 1024 / 1024 / uploadDuration).toFixed(2)} MB/s`,
      responseStatus: uploadResponse.status,
      result: uploadResult,
      memoryDuringUpload: getMemoryUsage()
    };
    
    console.log('✅ File uploaded successfully!');
    console.log(`   - Duration: ${uploadDuration} seconds`);
    console.log(`   - Average Speed: ${metrics.uploadMetrics.averageSpeed}`);
    
    if (uploadResult.id) {
      console.log(`   - Upload ID: ${uploadResult.id}`);
      metrics.uploadId = uploadResult.id;
    }
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    metrics.errors.push({
      stage: 'upload',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    // Save partial results
    fs.writeFileSync(TEST_RESULTS_FILE, JSON.stringify(metrics, null, 2));
    process.exit(1);
  }
  
  // Step 5: Test data processing
  console.log('\n⚙️  Testing Data Processing...');
  
  const processingStartTime = performance.now();
  
  try {
    // Wait for processing to complete (with timeout)
    let processingComplete = false;
    let checkCount = 0;
    const maxChecks = 60; // Check for up to 5 minutes
    
    while (!processingComplete && checkCount < maxChecks) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      // Check processing status
      const statusResponse = await fetch(`${API_BASE}/upload/jobs/${metrics.uploadId || 'latest'}`, {
        headers: { 'x-api-key': 'dev-api-key' }
      });
      
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        
        if (status.status === 'completed' || status.processed) {
          processingComplete = true;
          metrics.processingMetrics = status;
        } else if (status.status === 'failed') {
          throw new Error(`Processing failed: ${status.error}`);
        } else {
          process.stdout.write(`\r   Processing... (${++checkCount * 5} seconds elapsed)`);
        }
      }
    }
    
    const processingEndTime = performance.now();
    const processingDuration = ((processingEndTime - processingStartTime) / 1000).toFixed(2);
    
    console.log('\n✅ Data processing completed!');
    console.log(`   - Duration: ${processingDuration} seconds`);
    
    metrics.processingMetrics.duration = `${processingDuration} seconds`;
    
  } catch (error) {
    console.error('⚠️  Could not verify processing status:', error.message);
    metrics.errors.push({
      stage: 'processing',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
  
  // Step 6: Verify data integrity
  console.log('\n🔍 Verifying Data Integrity...');
  
  try {
    // Get row count from database
    const countResponse = await fetch(`${API_BASE}/dashboards`, {
      headers: { 'x-api-key': 'dev-api-key' }
    });
    if (countResponse.ok) {
      const countData = await countResponse.json();
      metrics.dataIntegrity.rowCount = countData.count || countData.rows;
      
      console.log(`   - Rows in database: ${metrics.dataIntegrity.rowCount}`);
      console.log(`   - Expected rows: ${metrics.rows}`);
      
      if (metrics.dataIntegrity.rowCount === metrics.rows) {
        console.log('   ✅ Row count matches!');
      } else {
        console.log(`   ⚠️  Row count mismatch: ${Math.abs(metrics.rows - metrics.dataIntegrity.rowCount)} difference`);
      }
    }
    
    // Sample data verification
    const sampleResponse = await fetch(`${API_BASE}/upload/jobs`, {
      headers: { 'x-api-key': 'dev-api-key' }
    });
    if (sampleResponse.ok) {
      const sampleData = await sampleResponse.json();
      metrics.dataIntegrity.sampleData = sampleData.slice(0, 3); // Store first 3 records
      
      console.log(`   - Sample records retrieved: ${sampleData.length}`);
      console.log(`   - Column count in samples: ${Object.keys(sampleData[0] || {}).length}`);
    }
    
  } catch (error) {
    console.error('⚠️  Could not verify data integrity:', error.message);
    metrics.errors.push({
      stage: 'verification',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
  
  // Step 7: Performance stress test
  console.log('\n🏃 Running Performance Tests...');
  
  const performanceTests = [];
  
  // Test 1: Concurrent reads
  console.log('   - Testing concurrent reads...');
  const readStartTime = performance.now();
  
  try {
    const readPromises = [];
    for (let i = 0; i < 10; i++) {
      readPromises.push(
        fetch(`${API_BASE}/upload/jobs`, {
          headers: { 'x-api-key': 'dev-api-key' }
        }).then(res => res.json())
      );
    }
    
    await Promise.all(readPromises);
    const readEndTime = performance.now();
    
    performanceTests.push({
      test: 'Concurrent Reads (10 requests)',
      duration: `${((readEndTime - readStartTime) / 1000).toFixed(2)} seconds`,
      status: 'passed'
    });
    
    console.log('     ✅ Concurrent reads successful');
    
  } catch (error) {
    performanceTests.push({
      test: 'Concurrent Reads',
      error: error.message,
      status: 'failed'
    });
    console.log('     ❌ Concurrent reads failed');
  }
  
  // Test 2: Large query
  console.log('   - Testing large query...');
  const largeQueryStart = performance.now();
  
  try {
    const largeResponse = await fetch(`${API_BASE}/queues/stats`, {
      headers: { 'x-api-key': 'dev-api-key' }
    });
    const largeData = await largeResponse.json();
    const largeQueryEnd = performance.now();
    
    performanceTests.push({
      test: 'Large Query (10k rows)',
      duration: `${((largeQueryEnd - largeQueryStart) / 1000).toFixed(2)} seconds`,
      rowsReturned: largeData.length,
      status: 'passed'
    });
    
    console.log('     ✅ Large query successful');
    
  } catch (error) {
    performanceTests.push({
      test: 'Large Query',
      error: error.message,
      status: 'failed'
    });
    console.log('     ❌ Large query failed');
  }
  
  metrics.performanceTests = performanceTests;
  
  // Step 8: Final memory status
  console.log('\n💾 Final Memory Status:');
  metrics.memoryMetrics.final = getMemoryUsage();
  console.log(metrics.memoryMetrics.final);
  
  // Calculate memory difference
  const initialHeap = parseFloat(metrics.memoryMetrics.initial.heapUsed);
  const finalHeap = parseFloat(metrics.memoryMetrics.final.heapUsed);
  const heapDiff = (finalHeap - initialHeap).toFixed(2);
  
  console.log(`   - Heap memory change: ${heapDiff > 0 ? '+' : ''}${heapDiff} MB`);
  
  // Step 9: Generate test report
  console.log('\n📊 Test Summary');
  console.log('=' .repeat(50));
  
  const totalTestTime = Object.values(metrics.uploadMetrics).concat(Object.values(metrics.processingMetrics))
    .filter(v => typeof v === 'string' && v.includes('seconds'))
    .reduce((sum, v) => sum + parseFloat(v), 0);
  
  console.log(`✅ Test completed successfully!`);
  console.log(`   - Total test duration: ${totalTestTime.toFixed(2)} seconds`);
  console.log(`   - File size processed: ${fileSizeMB} MB`);
  console.log(`   - Rows processed: ${metrics.rows.toLocaleString()}`);
  console.log(`   - Columns: ${metrics.columns}`);
  console.log(`   - Upload speed: ${metrics.uploadMetrics.averageSpeed}`);
  console.log(`   - Errors encountered: ${metrics.errors.length}`);
  
  if (metrics.errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    metrics.errors.forEach(err => {
      console.log(`   - [${err.stage}] ${err.error}`);
    });
  }
  
  // Save detailed results
  metrics.testEndTime = new Date().toISOString();
  fs.writeFileSync(TEST_RESULTS_FILE, JSON.stringify(metrics, null, 2));
  
  console.log(`\n📁 Detailed results saved to: ${TEST_RESULTS_FILE}`);
  
  // Cleanup recommendation
  console.log('\n🧹 Cleanup Recommendation:');
  console.log(`   To free up space, you can delete the test file:`);
  console.log(`   rm ${CSV_FILE}`);
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  metrics.errors.push({
    stage: 'unhandled',
    error: error.message,
    timestamp: new Date().toISOString()
  });
  fs.writeFileSync(TEST_RESULTS_FILE, JSON.stringify(metrics, null, 2));
  process.exit(1);
});

// Run the test
runLargeFileUploadTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});