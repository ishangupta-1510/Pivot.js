/**
 * Event Manager
 * Centralized event management with WebSocket broadcasting and Redis pub/sub
 */

import { EventEmitter } from 'events';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { redis } from '@/config/redis';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import jwt from 'jsonwebtoken';

export interface EventPayload {
  eventType: string;
  data: any;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
}

export interface JobEventPayload extends EventPayload {
  jobId: string;
  queueName?: string;
}

export interface SystemEventPayload extends EventPayload {
  level: 'info' | 'warn' | 'error';
  component: string;
}

interface ConnectedClient {
  socket: Socket;
  userId?: string;
  subscriptions: Set<string>;
  lastActivity: Date;
}

class EventManager extends EventEmitter {
  private static instance: EventManager;
  private io: SocketIOServer | null = null;
  private clients = new Map<string, ConnectedClient>();
  private subscriberClient: any = null;
  private isInitialized = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  public static getInstance(): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager();
    }
    return EventManager.instance;
  }

  public async initialize(httpServer?: HTTPServer): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Event Manager already initialized');
      return;
    }

    try {
      // Initialize Redis subscriber for pub/sub
      this.subscriberClient = redis.getSubscriberClient();
      await this.setupRedisSubscriptions();

      // Initialize WebSocket server if HTTP server provided
      if (httpServer) {
        await this.initializeWebSocket(httpServer);
      }

      // Setup periodic cleanup
      this.setupHeartbeat();

      // Setup system event handlers
      this.setupSystemEventHandlers();

      this.isInitialized = true;
      logger.info('✅ Event Manager initialized successfully', {
        websocketEnabled: !!httpServer,
        redisEnabled: true,
      });

    } catch (error) {
      logger.error('❌ Event Manager initialization failed:', error);
      throw new Error(`Event Manager initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async initializeWebSocket(httpServer: HTTPServer): Promise<void> {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.websocket.corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: config.websocket.pingTimeout,
      pingInterval: config.websocket.pingInterval,
      transports: ['websocket', 'polling'],
    });

    this.io.use(this.authenticateSocket.bind(this));

    this.io.on('connection', (socket: Socket) => {
      this.handleSocketConnection(socket);
    });

    logger.info('🌐 WebSocket server initialized', {
      corsOrigin: config.websocket.corsOrigin,
      pingTimeout: config.websocket.pingTimeout,
    });
  }

  private async authenticateSocket(socket: Socket, next: (err?: Error) => void): Promise<void> {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token) {
        // Allow anonymous connections for public events
        socket.data.userId = 'anonymous';
        socket.data.isAuthenticated = false;
        next();
        return;
      }

      const decoded = jwt.verify(token.replace('Bearer ', ''), config.auth.jwtSecret) as any;
      socket.data.userId = decoded.userId;
      socket.data.isAuthenticated = true;
      
      logger.debug('🔐 Socket authenticated', {
        socketId: socket.id,
        userId: decoded.userId,
      });

      next();
    } catch (error) {
      logger.warn('❌ Socket authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  }

  private handleSocketConnection(socket: Socket): void {
    const client: ConnectedClient = {
      socket,
      userId: socket.data.userId,
      subscriptions: new Set(),
      lastActivity: new Date(),
    };

    this.clients.set(socket.id, client);

    logger.info('🔌 Client connected', {
      socketId: socket.id,
      userId: client.userId,
      totalClients: this.clients.size,
    });

    // Handle subscription requests
    socket.on('subscribe', (eventTypes: string | string[]) => {
      this.handleSubscription(socket.id, eventTypes);
    });

    socket.on('unsubscribe', (eventTypes: string | string[]) => {
      this.handleUnsubscription(socket.id, eventTypes);
    });

    // Handle ping for connection health
    socket.on('ping', () => {
      const client = this.clients.get(socket.id);
      if (client) {
        client.lastActivity = new Date();
        socket.emit('pong', { timestamp: new Date().toISOString() });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleSocketDisconnection(socket.id, reason);
    });

    // Send initial connection confirmation
    socket.emit('connected', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      authenticated: socket.data.isAuthenticated,
    });
  }

  private handleSubscription(socketId: string, eventTypes: string | string[]): void {
    const client = this.clients.get(socketId);
    if (!client) return;

    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    
    types.forEach(type => {
      client.subscriptions.add(type);
    });

    logger.debug('📡 Client subscribed', {
      socketId,
      eventTypes: types,
      totalSubscriptions: client.subscriptions.size,
    });

    client.socket.emit('subscription_confirmed', {
      eventTypes: types,
      timestamp: new Date().toISOString(),
    });
  }

  private handleUnsubscription(socketId: string, eventTypes: string | string[]): void {
    const client = this.clients.get(socketId);
    if (!client) return;

    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    
    types.forEach(type => {
      client.subscriptions.delete(type);
    });

    logger.debug('📡 Client unsubscribed', {
      socketId,
      eventTypes: types,
      remainingSubscriptions: client.subscriptions.size,
    });

    client.socket.emit('unsubscription_confirmed', {
      eventTypes: types,
      timestamp: new Date().toISOString(),
    });
  }

  private handleSocketDisconnection(socketId: string, reason: string): void {
    const client = this.clients.get(socketId);
    if (client) {
      logger.info('🔌 Client disconnected', {
        socketId,
        userId: client.userId,
        reason,
        totalClients: this.clients.size - 1,
      });

      this.clients.delete(socketId);
    }
  }

  private async setupRedisSubscriptions(): Promise<void> {
    // Subscribe to job events
    await this.subscriberClient.subscribe('job:*');
    
    // Subscribe to system events
    await this.subscriberClient.subscribe('system:*');
    
    // Subscribe to dataset events
    await this.subscriberClient.subscribe('dataset:*');

    this.subscriberClient.on('message', (channel: string, message: string) => {
      try {
        const eventData = JSON.parse(message);
        this.handleRedisEvent(channel, eventData);
      } catch (error) {
        logger.error('❌ Failed to parse Redis message:', { channel, message, error });
      }
    });

    logger.info('📡 Redis subscriptions established', {
      channels: ['job:*', 'system:*', 'dataset:*'],
    });
  }

  private handleRedisEvent(channel: string, eventData: any): void {
    // Re-emit as local event
    this.emit(channel, eventData);

    // Broadcast to WebSocket clients
    this.broadcastToClients(channel, eventData);

    logger.debug('📨 Redis event processed', { channel, eventData });
  }

  private setupSystemEventHandlers(): void {
    // Handle job events
    this.on('job:waiting', (data) => this.broadcastJobEvent('job:waiting', data));
    this.on('job:active', (data) => this.broadcastJobEvent('job:active', data));
    this.on('job:completed', (data) => this.broadcastJobEvent('job:completed', data));
    this.on('job:failed', (data) => this.broadcastJobEvent('job:failed', data));
    this.on('job:progress', (data) => this.broadcastJobEvent('job:progress', data));
    this.on('job:stalled', (data) => this.broadcastJobEvent('job:stalled', data));

    // Handle system events
    this.on('system:health', (data) => this.broadcastSystemEvent('system:health', data));
    this.on('system:alert', (data) => this.broadcastSystemEvent('system:alert', data));
    this.on('system:maintenance', (data) => this.broadcastSystemEvent('system:maintenance', data));

    logger.debug('🎯 System event handlers configured');
  }

  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.cleanupInactiveClients();
      this.emitSystemStats();
    }, 30000); // Every 30 seconds

    logger.debug('💓 Heartbeat interval configured');
  }

  private cleanupInactiveClients(): void {
    const now = new Date();
    const timeout = 5 * 60 * 1000; // 5 minutes
    let cleaned = 0;

    for (const [socketId, client] of this.clients.entries()) {
      if (now.getTime() - client.lastActivity.getTime() > timeout) {
        client.socket.disconnect(true);
        this.clients.delete(socketId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`🧹 Cleaned up ${cleaned} inactive clients`);
    }
  }

  private emitSystemStats(): void {
    const stats = {
      connectedClients: this.clients.size,
      authenticatedClients: Array.from(this.clients.values())
        .filter(c => c.socket.data.isAuthenticated).length,
      totalEvents: this.listenerCount('*'),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    };

    this.emit('system:stats', stats);
  }

  public async publishEvent(eventType: string, data: any, userId?: string): Promise<void> {
    const payload: EventPayload = {
      eventType,
      data,
      timestamp: new Date(),
      userId,
    };

    // Emit local event
    this.emit(eventType, payload);

    // Publish to Redis for distributed systems
    try {
      await redis.getClient().publish(eventType, JSON.stringify(payload));
    } catch (error) {
      logger.error('❌ Failed to publish event to Redis:', { eventType, error });
    }

    logger.debug('📤 Event published', { eventType, userId, dataSize: JSON.stringify(data).length });
  }

  public async publishJobEvent(jobId: string, eventType: string, data: any, queueName?: string): Promise<void> {
    const payload: JobEventPayload = {
      eventType,
      data,
      timestamp: new Date(),
      jobId,
      queueName,
    };

    await this.publishEvent(eventType, payload);
  }

  public async publishSystemEvent(
    eventType: string, 
    data: any, 
    level: 'info' | 'warn' | 'error' = 'info',
    component: string = 'system'
  ): Promise<void> {
    const payload: SystemEventPayload = {
      eventType,
      data,
      timestamp: new Date(),
      level,
      component,
    };

    await this.publishEvent(eventType, payload);
  }

  private broadcastJobEvent(eventType: string, data: any): void {
    this.broadcastToClients(eventType, data, (client) => {
      // Only send job events to authenticated users or job owners
      return client.socket.data.isAuthenticated && 
             client.subscriptions.has(eventType);
    });
  }

  private broadcastSystemEvent(eventType: string, data: any): void {
    this.broadcastToClients(eventType, data, (client) => {
      return client.subscriptions.has(eventType);
    });
  }

  private broadcastToClients(
    eventType: string, 
    data: any, 
    filter?: (client: ConnectedClient) => boolean
  ): void {
    if (!this.io) return;

    let broadcastCount = 0;

    for (const client of this.clients.values()) {
      if (!filter || filter(client)) {
        client.socket.emit(eventType, {
          ...data,
          timestamp: new Date().toISOString(),
        });
        client.lastActivity = new Date();
        broadcastCount++;
      }
    }

    if (broadcastCount > 0) {
      logger.debug('📡 Event broadcasted', {
        eventType,
        clientsNotified: broadcastCount,
        totalClients: this.clients.size,
      });
    }
  }

  public getConnectedClientsStats(): {
    total: number;
    authenticated: number;
    subscriptions: Record<string, number>;
  } {
    const subscriptions: Record<string, number> = {};

    for (const client of this.clients.values()) {
      for (const subscription of client.subscriptions) {
        subscriptions[subscription] = (subscriptions[subscription] || 0) + 1;
      }
    }

    return {
      total: this.clients.size,
      authenticated: Array.from(this.clients.values())
        .filter(c => c.socket.data.isAuthenticated).length,
      subscriptions,
    };
  }

  public async healthCheck(): Promise<{
    healthy: boolean;
    websocket: { healthy: boolean; connectedClients: number };
    redis: { healthy: boolean; subscriptions: number };
  }> {
    const websocketHealthy = this.io !== null;
    const redisHealthy = this.subscriberClient !== null;

    return {
      healthy: websocketHealthy && redisHealthy,
      websocket: {
        healthy: websocketHealthy,
        connectedClients: this.clients.size,
      },
      redis: {
        healthy: redisHealthy,
        subscriptions: this.subscriberClient ? this.subscriberClient.subscriberCount : 0,
      },
    };
  }

  public async close(): Promise<void> {
    logger.info('🔌 Closing Event Manager...');

    // Clear heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Disconnect all WebSocket clients
    if (this.io) {
      for (const client of this.clients.values()) {
        client.socket.disconnect(true);
      }
      this.clients.clear();
      
      this.io.close();
      this.io = null;
    }

    // Close Redis subscriber
    if (this.subscriberClient) {
      await this.subscriberClient.unsubscribe();
      this.subscriberClient = null;
    }

    // Remove all listeners
    this.removeAllListeners();

    this.isInitialized = false;
    logger.info('✅ Event Manager closed successfully');
  }
}

// Export singleton instance
export const eventManager = EventManager.getInstance();