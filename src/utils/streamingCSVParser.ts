/**
 * Streaming CSV Parser - Handles large CSV files by processing them in chunks
 * Prevents memory overflow and provides progress feedback
 */

export interface StreamingParserOptions {
  chunkSize?: number;
  maxRows?: number;
  sampleRate?: number;
  onProgress?: (progress: ProgressInfo) => void;
  onChunk?: (chunk: any[], isComplete: boolean) => void;
}

export interface ProgressInfo {
  bytesRead: number;
  totalBytes: number;
  rowsProcessed: number;
  percentage: number;
  estimatedRowsTotal?: number;
  memoryUsage?: number;
}

export class StreamingCSVParser {
  private file: File;
  private options: StreamingParserOptions;
  private headers: string[] = [];
  private buffer: string = '';
  private rowsProcessed: number = 0;
  private bytesRead: number = 0;
  private aborted: boolean = false;
  
  constructor(file: File, options: StreamingParserOptions = {}) {
    this.file = file;
    this.options = {
      chunkSize: 64 * 1024, // 64KB chunks
      maxRows: 1000000, // 1M row limit
      sampleRate: 1, // Process every row (1 = all, 0.1 = 10% sample)
      ...options
    };
  }

  async parse(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const results: any[] = [];
      let offset = 0;
      let isFirstChunk = true;

      const readNextChunk = () => {
        if (this.aborted || offset >= this.file.size) {
          // Finalize and return results
          this.finalizeResults(results);
          resolve(results);
          return;
        }

        const chunkEnd = Math.min(offset + this.options.chunkSize!, this.file.size);
        const blob = this.file.slice(offset, chunkEnd);
        reader.readAsText(blob);
      };

      reader.onload = (e) => {
        const chunk = e.target?.result as string;
        if (!chunk) return;

        this.bytesRead = offset + chunk.length;
        this.buffer += chunk;
        
        // Process complete lines from buffer
        const processedRows = this.processBuffer(isFirstChunk);
        results.push(...processedRows);
        
        isFirstChunk = false;
        offset += chunk.length;

        // Update progress
        this.reportProgress();

        // Check limits
        if (this.rowsProcessed >= this.options.maxRows!) {
          console.warn(`Reached maximum row limit (${this.options.maxRows}). Truncating data.`);
          this.finalizeResults(results);
          resolve(results);
          return;
        }

        // Continue reading or finish
        if (offset < this.file.size) {
          // Use setTimeout to prevent blocking
          setTimeout(readNextChunk, 0);
        } else {
          this.finalizeResults(results);
          resolve(results);
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      // Start reading
      readNextChunk();
    });
  }

  private processBuffer(isFirstChunk: boolean): any[] {
    const lines = this.buffer.split('\n');
    
    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || '';
    
    const processedRows: any[] = [];
    
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      // Extract headers from first line
      if (isFirstChunk && index === 0) {
        this.headers = this.parseCSVLine(trimmedLine);
        return;
      }

      // Skip processing based on sample rate
      if (Math.random() > this.options.sampleRate!) {
        return;
      }

      // Parse data row
      const values = this.parseCSVLine(trimmedLine);
      if (values.length === 0) return;

      const row: any = {};
      this.headers.forEach((header, idx) => {
        const value = values[idx]?.trim() || '';
        // Try to parse as number
        const numValue = parseFloat(value);
        row[header] = isNaN(numValue) ? value : numValue;
      });

      processedRows.push(row);
      this.rowsProcessed++;
    });

    return processedRows;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result.map(field => field.replace(/^"|"$/g, '')); // Remove quotes
  }

  private reportProgress() {
    if (this.options.onProgress) {
      const percentage = Math.round((this.bytesRead / this.file.size) * 100);
      
      // Estimate total rows based on current progress
      const estimatedRowsTotal = this.rowsProcessed > 0 
        ? Math.round((this.rowsProcessed / this.bytesRead) * this.file.size)
        : undefined;

      const progress: ProgressInfo = {
        bytesRead: this.bytesRead,
        totalBytes: this.file.size,
        rowsProcessed: this.rowsProcessed,
        percentage,
        estimatedRowsTotal,
        memoryUsage: this.getMemoryUsage()
      };

      this.options.onProgress(progress);
    }
  }

  private getMemoryUsage(): number {
    // Estimate memory usage (not exact, but helpful)
    if ('memory' in performance) {
      return (performance as any).memory?.usedJSHeapSize || 0;
    }
    return 0;
  }

  private finalizeResults(results: any[]) {
    // Process any remaining buffer content
    if (this.buffer.trim()) {
      const values = this.parseCSVLine(this.buffer.trim());
      if (values.length > 0) {
        const row: any = {};
        this.headers.forEach((header, idx) => {
          const value = values[idx]?.trim() || '';
          const numValue = parseFloat(value);
          row[header] = isNaN(numValue) ? value : numValue;
        });
        results.push(row);
        this.rowsProcessed++;
      }
    }

    // Final progress report
    this.reportProgress();

    console.log(`Streaming CSV Parser completed:`);
    console.log(`- Rows processed: ${this.rowsProcessed.toLocaleString()}`);
    console.log(`- File size: ${Math.round(this.file.size / 1024)} KB`);
    console.log(`- Memory usage: ${Math.round(this.getMemoryUsage() / 1024 / 1024)} MB`);
  }

  abort() {
    this.aborted = true;
  }
}

// Utility function for easy usage
export async function parseCSVStreaming(
  file: File, 
  options: StreamingParserOptions = {}
): Promise<any[]> {
  const parser = new StreamingCSVParser(file, options);
  return parser.parse();
}