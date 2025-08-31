import { DataRow, StreamingParserOptions, ProgressInfo } from '../../types';

export class StreamingCSVParser {
  private static readonly DEFAULT_OPTIONS: Required<StreamingParserOptions> = {
    chunkSize: 64 * 1024,
    maxRows: 100000,
    sampleRate: 1,
    delimiter: ',',
    hasHeader: true,
    skipEmptyLines: true,
    onProgress: () => {},
    onError: () => {}
  };

  static async parseFile(file: File, options: Partial<StreamingParserOptions> = {}): Promise<DataRow[]> {
    const config = { ...this.DEFAULT_OPTIONS, ...options };
    const reader = new FileReader();
    
    return new Promise((resolve, reject) => {
      const result: DataRow[] = [];
      let buffer = '';
      let headers: string[] = [];
      let totalBytes = file.size;
      let processedBytes = 0;
      let rowsProcessed = 0;
      let isFirstChunk = true;

      const processChunk = (chunk: string, isLastChunk: boolean = false) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        
        if (!isLastChunk) {
          buffer = lines.pop() || '';
        } else {
          buffer = '';
        }

        lines.forEach((line, index) => {
          if (config.skipEmptyLines && !line.trim()) return;

          if (isFirstChunk && index === 0 && config.hasHeader) {
            headers = this.parseLine(line, config.delimiter);
            return;
          }

          if (rowsProcessed >= config.maxRows) return;
          if (Math.random() > config.sampleRate) return;

          const values = this.parseLine(line, config.delimiter);
          if (values.length === 0) return;

          const row: DataRow = {};
          const fieldNames = headers.length > 0 ? headers : values.map((_, i) => `column_${i + 1}`);

          fieldNames.forEach((header, i) => {
            const value = values[i] || '';
            row[header] = this.parseValue(value);
          });

          result.push(row);
          rowsProcessed++;
        });

        isFirstChunk = false;
      };

      reader.onload = (e) => {
        const chunk = e.target?.result as string;
        processedBytes += chunk.length;

        processChunk(chunk, processedBytes >= totalBytes);

        const progress: ProgressInfo = {
          bytesProcessed: processedBytes,
          totalBytes,
          rowsProcessed,
          percentage: Math.round((processedBytes / totalBytes) * 100),
          memoryUsage: this.estimateMemoryUsage(result),
          processingSpeed: processedBytes / (Date.now() / 1000)
        };

        config.onProgress(progress);

        if (processedBytes >= totalBytes || rowsProcessed >= config.maxRows) {
          resolve(result);
        } else {
          this.readNextChunk();
        }
      };

      reader.onerror = () => {
        const error = new Error('Failed to read file');
        config.onError(error);
        reject(error);
      };

      let currentPosition = 0;
      const readNextChunk = () => {
        const end = Math.min(currentPosition + config.chunkSize, file.size);
        const blob = file.slice(currentPosition, end);
        currentPosition = end;
        reader.readAsText(blob);
      };

      this.readNextChunk = readNextChunk;
      readNextChunk();
    });
  }

  private static parseLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
      i++;
    }

    result.push(current.trim());
    return result;
  }

  private static parseValue(value: string): any {
    if (!value || value.trim() === '') return null;

    value = value.trim();
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Try boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Try number
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && isFinite(numValue) && value === numValue.toString()) {
      return numValue;
    }

    // Try date
    const dateValue = new Date(value);
    if (!isNaN(dateValue.getTime()) && this.isValidDateString(value)) {
      return dateValue;
    }

    return value;
  }

  private static isValidDateString(str: string): boolean {
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{2}\/\d{2}\/\d{4}$/,
      /^\d{2}-\d{2}-\d{4}$/,
      /^\d{4}\/\d{2}\/\d{2}$/,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    ];

    return datePatterns.some(pattern => pattern.test(str));
  }

  private static estimateMemoryUsage(data: DataRow[]): number {
    if (data.length === 0) return 0;
    const sampleRow = JSON.stringify(data[0]);
    return sampleRow.length * data.length * 2;
  }

  private static readNextChunk: () => void = () => {};
}

export const parseCSVStreaming = StreamingCSVParser.parseFile;