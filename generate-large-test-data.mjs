import fs from 'fs';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

// Configuration
const ROWS = 100000; // 1 lakh rows
const COLS = 100; // 100 columns
const OUTPUT_FILE = 'test-100K-100col.csv';
const BATCH_SIZE = 1000; // Write in batches for memory efficiency

console.log(`🚀 Starting generation of ${ROWS.toLocaleString()} x ${COLS} CSV file...`);
console.time('CSV Generation');

// Data type generators
const dataGenerators = {
  string: (row, col) => {
    const templates = [
      `Product_${row}_${col}`,
      `Category_${Math.floor(Math.random() * 50)}`,
      `Region_${['North', 'South', 'East', 'West'][Math.floor(Math.random() * 4)]}`,
      `Status_${['Active', 'Pending', 'Completed', 'Cancelled'][Math.floor(Math.random() * 4)]}`,
      `Customer_${row % 1000}`,
      `Vendor_${col}_${row % 100}`,
      `Type_${String.fromCharCode(65 + (row % 26))}${col}`,
      `SKU${String(row).padStart(6, '0')}`,
    ];
    return templates[col % templates.length];
  },
  
  number: (row, col) => {
    const types = [
      Math.random() * 10000, // Decimal
      Math.floor(Math.random() * 1000), // Integer
      (row * col) % 10000, // Calculated
      parseFloat((Math.random() * 100).toFixed(2)), // Price-like
      Math.floor(Math.random() * 100) + 1, // Quantity
      parseFloat((Math.random() * 0.5).toFixed(4)), // Percentage
      row + col, // Sequential
      Math.floor(Math.random() * 1000000), // Large number
    ];
    return types[col % types.length];
  },
  
  date: (row, col) => {
    const baseDate = new Date('2020-01-01');
    const daysToAdd = row + (col * 10);
    const date = new Date(baseDate);
    date.setDate(date.getDate() + daysToAdd);
    
    const formats = [
      date.toISOString().split('T')[0], // YYYY-MM-DD
      date.toLocaleDateString('en-US'), // MM/DD/YYYY
      date.toISOString(), // Full ISO
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, // YYYY-MM
    ];
    return formats[col % formats.length];
  },
  
  boolean: (row, col) => {
    return (row + col) % 2 === 0 ? 'true' : 'false';
  },
  
  email: (row, col) => {
    return `user${row}_${col}@example.com`;
  },
  
  currency: (row, col) => {
    const amount = (Math.random() * 10000).toFixed(2);
    const currencies = ['$', '€', '£', '¥'];
    return `${currencies[col % currencies.length]}${amount}`;
  },
  
  percentage: (row, col) => {
    return `${(Math.random() * 100).toFixed(2)}%`;
  },
  
  phone: (row, col) => {
    return `+1-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`;
  },
  
  url: (row, col) => {
    return `https://example.com/item/${row}/${col}`;
  },
  
  json: (row, col) => {
    return JSON.stringify({ id: row, value: col, type: 'data' });
  }
};

// Determine column types with mixed distribution
function getColumnType(col) {
  const distribution = [
    'string', 'string', 'string', 'number', 'number', 'number', 
    'date', 'boolean', 'email', 'currency', 'percentage', 'phone', 
    'url', 'json', 'string', 'number'
  ];
  return distribution[col % distribution.length];
}

// Generate headers with type indicators
function generateHeaders() {
  const headers = [];
  for (let i = 0; i < COLS; i++) {
    const type = getColumnType(i);
    headers.push(`Col_${i}_${type}`);
  }
  return headers.join(',') + '\n';
}

// Generate a single row
function generateRow(rowIndex) {
  const row = [];
  for (let col = 0; col < COLS; col++) {
    const type = getColumnType(col);
    const generator = dataGenerators[type] || dataGenerators.string;
    let value = generator(rowIndex, col);
    
    // Handle special characters in CSV
    if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
      value = `"${value.replace(/"/g, '""')}"`;
    }
    
    row.push(value);
  }
  return row.join(',') + '\n';
}

// Create write stream
const writeStream = createWriteStream(OUTPUT_FILE);

// Write headers
writeStream.write(generateHeaders());

// Generate and write data in batches
let rowsWritten = 0;
let batch = '';

for (let i = 0; i < ROWS; i++) {
  batch += generateRow(i);
  
  // Write batch when it reaches the batch size
  if ((i + 1) % BATCH_SIZE === 0) {
    writeStream.write(batch);
    batch = '';
    rowsWritten = i + 1;
    
    // Progress update
    if (rowsWritten % 10000 === 0) {
      const progress = ((rowsWritten / ROWS) * 100).toFixed(1);
      console.log(`📊 Progress: ${rowsWritten.toLocaleString()} / ${ROWS.toLocaleString()} rows (${progress}%)`);
    }
  }
}

// Write remaining rows
if (batch) {
  writeStream.write(batch);
}

// Close stream and show stats
writeStream.end(() => {
  console.timeEnd('CSV Generation');
  
  // Get file stats
  const stats = fs.statSync(OUTPUT_FILE);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log('\n✅ CSV Generation Complete!');
  console.log('📁 File Details:');
  console.log(`   - Filename: ${OUTPUT_FILE}`);
  console.log(`   - Rows: ${ROWS.toLocaleString()}`);
  console.log(`   - Columns: ${COLS}`);
  console.log(`   - File Size: ${fileSizeMB} MB`);
  console.log(`   - Data Types: strings, numbers, dates, booleans, emails, currencies, percentages, phones, URLs, JSON`);
  
  // Sample data preview
  console.log('\n📋 Sample Data Types per Column:');
  for (let i = 0; i < Math.min(10, COLS); i++) {
    console.log(`   - Column ${i}: ${getColumnType(i)}`);
  }
  console.log(`   ... and ${COLS - 10} more columns`);
});