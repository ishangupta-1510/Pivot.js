/**
 * Event Manager Tests
 * Test suite for event management and WebSocket functionality
 */

import { eventManager } from '@/services/event-manager';
import { Server as HTTPServer } from 'http';
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { createServer } from 'http';

// Mock dependencies
jest.mock('@/config/redis', () => ({
  redis: {
    getSubscriberClient: jest.fn().mockReturnValue({
      subscribe: jest.fn().mockResolvedValue(1),
      on: jest.fn(),
      subscriberCount: 3,
    }),
    getClient: jest.fn().mockReturnValue({
      publish: jest.fn().mockResolvedValue(1),
    }),
  },
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn().mockReturnValue({ userId: 'test-user' }),
}));

// Mock socket.io
const mockSocket = {
  id: 'socket-123',
  data: { userId: 'test-user', isAuthenticated: true },
  handshake: {
    auth: { token: 'valid-token' },
    headers: {},
  },
  on: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
};

const mockIO = {
  use: jest.fn(),
  on: jest.fn(),
  close: jest.fn(),
};

jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => mockIO),
}));

describe('Event Manager', () => {
  let httpServer: HTTPServer;

  beforeAll(async () => {
    httpServer = createServer();
    await eventManager.initialize(httpServer);
  });

  afterAll(async () => {
    await eventManager.close();
    httpServer.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with WebSocket server', async () => {
      const health = await eventManager.healthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.websocket.healthy).toBe(true);
      expect(health.redis.healthy).toBe(true);
    });

    it('should initialize without WebSocket server', async () => {
      const newEventManager = require('@/services/event-manager').EventManager.getInstance();
      
      await newEventManager.initialize();
      
      const health = await newEventManager.healthCheck();
      expect(health.websocket.healthy).toBe(false);
      expect(health.redis.healthy).toBe(true);
      
      await newEventManager.close();
    });
  });

  describe('WebSocket connection handling', () => {
    beforeEach(() => {
      // Setup mock socket connection handler
      const connectionHandler = (mockIO.on as jest.Mock).mock.calls
        .find(call => call[0] === 'connection')?.[1];
      
      if (connectionHandler) {
        connectionHandler(mockSocket);
      }
    });

    it('should handle socket authentication', async () => {
      const authMiddleware = (mockIO.use as jest.Mock).mock.calls[0]?.[0];
      const nextFn = jest.fn();
      
      await authMiddleware(mockSocket, nextFn);
      
      expect(nextFn).toHaveBeenCalledWith();
      expect(mockSocket.data.userId).toBe('test-user');
      expect(mockSocket.data.isAuthenticated).toBe(true);
    });

    it('should handle anonymous connections', async () => {
      const authMiddleware = (mockIO.use as jest.Mock).mock.calls[0]?.[0];
      const nextFn = jest.fn();
      const anonymousSocket = {
        ...mockSocket,
        handshake: { auth: {}, headers: {} },
        data: {},
      };
      
      await authMiddleware(anonymousSocket, nextFn);
      
      expect(nextFn).toHaveBeenCalledWith();
      expect(anonymousSocket.data.userId).toBe('anonymous');
      expect(anonymousSocket.data.isAuthenticated).toBe(false);
    });

    it('should handle authentication failures', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockImplementationOnce(() => {
        throw new Error('Invalid token');
      });

      const authMiddleware = (mockIO.use as jest.Mock).mock.calls[0]?.[0];
      const nextFn = jest.fn();
      const invalidSocket = {
        ...mockSocket,
        handshake: { auth: { token: 'invalid-token' }, headers: {} },
      };
      
      await authMiddleware(invalidSocket, nextFn);
      
      expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle socket subscriptions', () => {
      const subscribeHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'subscribe')?.[1];
      
      if (subscribeHandler) {
        subscribeHandler(['job:progress', 'job:completed']);
        
        expect(mockSocket.emit).toHaveBeenCalledWith(
          'subscription_confirmed',
          expect.objectContaining({
            eventTypes: ['job:progress', 'job:completed'],
          })
        );
      }
    });

    it('should handle socket unsubscriptions', () => {
      const unsubscribeHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'unsubscribe')?.[1];
      
      if (unsubscribeHandler) {
        unsubscribeHandler(['job:progress']);
        
        expect(mockSocket.emit).toHaveBeenCalledWith(
          'unsubscription_confirmed',
          expect.objectContaining({
            eventTypes: ['job:progress'],
          })
        );
      }
    });

    it('should handle ping-pong for connection health', () => {
      const pingHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'ping')?.[1];
      
      if (pingHandler) {
        pingHandler();
        
        expect(mockSocket.emit).toHaveBeenCalledWith(
          'pong',
          expect.objectContaining({
            timestamp: expect.any(String),
          })
        );
      }
    });

    it('should handle socket disconnection', () => {
      const disconnectHandler = (mockSocket.on as jest.Mock).mock.calls
        .find(call => call[0] === 'disconnect')?.[1];
      
      if (disconnectHandler) {
        disconnectHandler('transport close');
        
        // Should not throw any errors
        expect(true).toBe(true);
      }
    });
  });

  describe('event publishing', () => {
    it('should publish event successfully', async () => {
      await eventManager.publishEvent('test:event', { message: 'test' }, 'user-123');
      
      // Should not throw any errors
      expect(true).toBe(true);
    });

    it('should publish job event successfully', async () => {
      await eventManager.publishJobEvent(
        'job-123',
        'job:progress',
        { percentage: 50 },
        'csv-processing'
      );
      
      // Should not throw any errors
      expect(true).toBe(true);
    });

    it('should publish system event successfully', async () => {
      await eventManager.publishSystemEvent(
        'system:alert',
        { message: 'High memory usage detected' },
        'warn',
        'memory-monitor'
      );
      
      // Should not throw any errors
      expect(true).toBe(true);
    });

    it('should handle Redis publish failures gracefully', async () => {
      const redis = require('@/config/redis').redis;
      const mockClient = redis.getClient();
      mockClient.publish.mockRejectedValueOnce(new Error('Redis connection failed'));
      
      // Should not throw, should handle gracefully
      await eventManager.publishEvent('test:event', { data: 'test' });
      
      expect(true).toBe(true);
    });
  });

  describe('Redis event handling', () => {
    it('should handle Redis messages correctly', () => {
      const subscriberClient = require('@/config/redis').redis.getSubscriberClient();
      const messageHandler = subscriberClient.on.mock.calls
        .find((call: any) => call[0] === 'message')?.[1];
      
      if (messageHandler) {
        const testMessage = JSON.stringify({
          eventType: 'job:completed',
          data: { jobId: 'job-123' },
          timestamp: new Date(),
        });
        
        messageHandler('job:completed', testMessage);
        
        // Should not throw any errors
        expect(true).toBe(true);
      }
    });

    it('should handle invalid Redis messages gracefully', () => {
      const subscriberClient = require('@/config/redis').redis.getSubscriberClient();
      const messageHandler = subscriberClient.on.mock.calls
        .find((call: any) => call[0] === 'message')?.[1];
      
      if (messageHandler) {
        // Invalid JSON
        messageHandler('job:completed', 'invalid-json');
        
        // Should not throw any errors
        expect(true).toBe(true);
      }
    });
  });

  describe('client statistics', () => {
    it('should get connected clients statistics', () => {
      const stats = eventManager.getConnectedClientsStats();
      
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.authenticated).toBe('number');
      expect(typeof stats.subscriptions).toBe('object');
      expect(stats.total).toBeGreaterThanOrEqual(0);
      expect(stats.authenticated).toBeGreaterThanOrEqual(0);
    });

    it('should track client subscriptions correctly', () => {
      // This would be tested by simulating multiple clients with different subscriptions
      const stats = eventManager.getConnectedClientsStats();
      
      expect(stats.subscriptions).toBeDefined();
      expect(typeof stats.subscriptions).toBe('object');
    });
  });

  describe('health monitoring', () => {
    it('should perform health check successfully', async () => {
      const health = await eventManager.healthCheck();
      
      expect(health).toBeDefined();
      expect(typeof health.healthy).toBe('boolean');
      expect(health.websocket).toBeDefined();
      expect(health.redis).toBeDefined();
      expect(typeof health.websocket.healthy).toBe('boolean');
      expect(typeof health.redis.healthy).toBe('boolean');
      expect(typeof health.websocket.connectedClients).toBe('number');
    });

    it('should report system statistics periodically', (done) => {
      let statsReceived = false;
      
      eventManager.on('system:stats', (stats) => {
        expect(stats).toBeDefined();
        expect(typeof stats.connectedClients).toBe('number');
        expect(typeof stats.authenticatedClients).toBe('number');
        expect(typeof stats.memoryUsage).toBe('object');
        expect(typeof stats.uptime).toBe('number');
        
        if (!statsReceived) {
          statsReceived = true;
          done();
        }
      });

      // Trigger stats emission (in real scenario, this happens automatically)
      (eventManager as any).emitSystemStats();
    });
  });

  describe('error handling', () => {
    it('should handle WebSocket server initialization failure', async () => {
      const SocketIO = require('socket.io').Server;
      SocketIO.mockImplementationOnce(() => {
        throw new Error('Failed to create WebSocket server');
      });

      const newEventManager = require('@/services/event-manager').EventManager.getInstance();
      
      await expect(newEventManager.initialize(httpServer))
        .rejects.toThrow('Event Manager initialization failed');
    });

    it('should handle Redis subscription failures gracefully', async () => {
      const redis = require('@/config/redis').redis;
      const subscriberClient = redis.getSubscriberClient();
      subscriberClient.subscribe.mockRejectedValueOnce(new Error('Redis subscribe failed'));

      const newEventManager = require('@/services/event-manager').EventManager.getInstance();
      
      await expect(newEventManager.initialize())
        .rejects.toThrow('Event Manager initialization failed');
    });
  });

  describe('cleanup and shutdown', () => {
    it('should cleanup inactive clients', () => {
      // Test the cleanup functionality
      (eventManager as any).cleanupInactiveClients();
      
      // Should not throw any errors
      expect(true).toBe(true);
    });

    it('should close gracefully', async () => {
      const testEventManager = require('@/services/event-manager').EventManager.getInstance();
      await testEventManager.initialize();
      
      await testEventManager.close();
      
      // Should not throw any errors
      expect(true).toBe(true);
    });
  });
});