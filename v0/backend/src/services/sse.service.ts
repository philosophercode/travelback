import { Response } from 'express';
import { logger } from '../utils/logger';

/**
 * SSE Service - Manages Server-Sent Events connections for real-time updates
 */
export class SSEService {
  private clients: Map<string, Set<Response>> = new Map();

  /**
   * Register a client for a specific trip
   */
  registerClient(tripId: string, res: Response): void {
    if (!this.clients.has(tripId)) {
      this.clients.set(tripId, new Set());
    }

    const tripClients = this.clients.get(tripId)!;
    tripClients.add(res);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection message
    this.sendToClient(res, {
      type: 'connected',
      data: { tripId, message: 'Connected to trip status stream' },
    });

    // Handle client disconnect
    res.on('close', () => {
      logger.debug(`SSE client disconnected for trip ${tripId}`);
      tripClients.delete(res);
      if (tripClients.size === 0) {
        this.clients.delete(tripId);
      }
    });

    logger.debug(`SSE client registered for trip ${tripId} (${tripClients.size} total)`);
  }

  /**
   * Send event to all clients watching a trip
   */
  sendToTrip(tripId: string, event: SSEEvent): void {
    const tripClients = this.clients.get(tripId);
    if (!tripClients || tripClients.size === 0) {
      return;
    }

    const message = this.formatSSEMessage(event);
    const deadClients: Response[] = [];

    tripClients.forEach((res) => {
      try {
        res.write(message);
      } catch (error) {
        logger.warn(`Failed to send SSE message to client`, error);
        deadClients.push(res);
      }
    });

    // Remove dead clients
    deadClients.forEach((res) => {
      tripClients.delete(res);
    });

    if (tripClients.size === 0) {
      this.clients.delete(tripId);
    }

    logger.debug(`Sent SSE event to ${tripClients.size} clients for trip ${tripId}`);
  }

  /**
   * Send event to a specific client
   */
  private sendToClient(res: Response, event: SSEEvent): void {
    try {
      const message = this.formatSSEMessage(event);
      res.write(message);
    } catch (error) {
      logger.warn(`Failed to send SSE message to client`, error);
    }
  }

  /**
   * Format event as SSE message
   */
  private formatSSEMessage(event: SSEEvent): string {
    const data = JSON.stringify(event.data);
    return `event: ${event.type}\ndata: ${data}\n\n`;
  }

  /**
   * Close all connections for a trip
   */
  closeTripConnections(tripId: string): void {
    const tripClients = this.clients.get(tripId);
    if (!tripClients) {
      return;
    }

    tripClients.forEach((res) => {
      try {
        res.end();
      } catch (error) {
        logger.warn(`Error closing SSE connection`, error);
      }
    });

    this.clients.delete(tripId);
    logger.debug(`Closed all SSE connections for trip ${tripId}`);
  }

  /**
   * Get number of active connections for a trip
   */
  getConnectionCount(tripId: string): number {
    return this.clients.get(tripId)?.size || 0;
  }
}

/**
 * SSE Event structure
 */
export interface SSEEvent {
  type: string;
  data: unknown;
}

export const sseService = new SSEService();

