const express = require('express');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const app = express();
const PORT = process.env.PORT || 3005;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Create Redis connection
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: 3,
});

// Create queues for monitoring
const csvProcessingQueue = new Queue('csv-processing', { connection });
const emailNotificationQueue = new Queue('email-notifications', { connection });
const dataCleanupQueue = new Queue('data-cleanup', { connection });

// Setup Bull Board
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [
    new BullMQAdapter(csvProcessingQueue),
    new BullMQAdapter(emailNotificationQueue),
    new BullMQAdapter(dataCleanupQueue),
  ],
  serverAdapter: serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    queues: ['csv-processing', 'email-notifications', 'data-cleanup']
  });
});

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/admin/queues');
});

app.listen(PORT, () => {
  console.log(`🚀 Bull Board Dashboard running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/admin/queues`);
});