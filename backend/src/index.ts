/**
 * Application Entry Point
 */

import { app } from './app';
import { logger } from './utils/logger';

console.log('[Index] Starting backend application...');
console.log('[Index] Imports loaded, starting app...');

// Start the application
app.start().catch((error) => {
  console.error('[Index] Failed to start application:', error);
  logger.error('Failed to start application:', error);
  process.exit(1);
});