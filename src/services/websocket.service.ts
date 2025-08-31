/**
 * WebSocket Service
 * Handles real-time updates from backend
 */

import { io, Socket } from 'socket.io-client';
import config from '@/config/environment';

export type EventCallback = (data: any) => void;

class WebSocketService {
  private socket: Socket | null = null;
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * Connect to WebSocket server
   */
  connect(token?: string): void {
    if (!config.websocket.enabled) {
      console.log('WebSocket disabled in configuration');
      return;
    }

    if (this.socket?.connected) {
      console.log('WebSocket already connected');
      return;
    }

    try {
      this.socket = io(config.websocket.url, {
        auth: {
          token: token || 'dev-token',
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      this.setupEventHandlers();
      console.log('WebSocket connection initiated');
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
    }
  }

  /**
   * Setup core event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('WebSocket connected successfully');
      this.emit('connected', { timestamp: new Date() });
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.log('WebSocket disconnected:', reason);
      this.emit('disconnected', { reason, timestamp: new Date() });
    });

    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      console.error('WebSocket connection error:', error.message);
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.emit('connection_failed', { 
          message: 'Max reconnection attempts reached',
          attempts: this.reconnectAttempts,
        });
      }
    });

    // Job events
    this.socket.on('job:waiting', (data) => this.emit('job:waiting', data));
    this.socket.on('job:active', (data) => this.emit('job:active', data));
    this.socket.on('job:progress', (data) => this.emit('job:progress', data));
    this.socket.on('job:completed', (data) => this.emit('job:completed', data));
    this.socket.on('job:failed', (data) => this.emit('job:failed', data));
    this.socket.on('job:stalled', (data) => this.emit('job:stalled', data));

    // System events
    this.socket.on('system:health', (data) => this.emit('system:health', data));
    this.socket.on('system:alert', (data) => this.emit('system:alert', data));
    this.socket.on('system:stats', (data) => this.emit('system:stats', data));

    // Connection management
    this.socket.on('pong', (data) => this.emit('pong', data));
    this.socket.on('subscription_confirmed', (data) => this.emit('subscription_confirmed', data));
    this.socket.on('unsubscription_confirmed', (data) => this.emit('unsubscription_confirmed', data));
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(eventTypes: string | string[]): void {
    if (!this.socket?.connected) {
      console.warn('Cannot subscribe: WebSocket not connected');
      return;
    }

    this.socket.emit('subscribe', eventTypes);
    console.log('Subscribed to events:', eventTypes);
  }

  /**
   * Unsubscribe from specific event types
   */
  unsubscribe(eventTypes: string | string[]): void {
    if (!this.socket?.connected) {
      console.warn('Cannot unsubscribe: WebSocket not connected');
      return;
    }

    this.socket.emit('unsubscribe', eventTypes);
    console.log('Unsubscribed from events:', eventTypes);
  }

  /**
   * Send ping to check connection health
   */
  ping(): void {
    if (!this.socket?.connected) {
      console.warn('Cannot ping: WebSocket not connected');
      return;
    }

    this.socket.emit('ping');
  }

  /**
   * Register event listener
   */
  on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }

    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
      
      if (listeners.size === 0) {
        this.eventListeners.delete(event);
      }
    }
  }

  /**
   * Emit event to all registered listeners
   */
  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.eventListeners.clear();
      console.log('WebSocket disconnected');
    }
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  /**
   * Get socket instance (for advanced usage)
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
export default websocketService;