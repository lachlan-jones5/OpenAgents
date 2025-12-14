import { createOpencodeClient } from '@opencode-ai/sdk';

export type EventType = 
  | 'session.created'
  | 'session.updated'
  | 'session.deleted'
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'part.created'
  | 'part.updated'
  | 'part.deleted'
  | 'permission.request'
  | 'permission.response'
  | 'tool.call'
  | 'tool.result'
  | 'file.edited'
  | 'command.executed';

export interface ServerEvent {
  type: EventType;
  properties: any;
  timestamp?: number;
}

export interface PermissionRequestEvent {
  type: 'permission.request';
  properties: {
    sessionId: string;
    permissionId: string;
    message?: string;
    tool?: string;
    args?: any;
  };
}

export type EventHandler = (event: ServerEvent) => void | Promise<void>;
export type PermissionHandler = (event: PermissionRequestEvent) => Promise<boolean>;

export class EventStreamHandler {
  private client: ReturnType<typeof createOpencodeClient>;
  private eventHandlers: Map<EventType, EventHandler[]> = new Map();
  private permissionHandler: PermissionHandler | null = null;
  private isListening: boolean = false;
  private abortController: AbortController | null = null;
  private handlerIds: Map<EventHandler, string> = new Map();
  private nextHandlerId = 0;

  constructor(baseUrl: string) {
    this.client = createOpencodeClient({ baseUrl });
  }

  /**
   * Register an event handler for a specific event type
   * Returns handler ID for removal
   */
  on(eventType: EventType, handler: EventHandler): string {
    const id = `handler_${this.nextHandlerId++}`;
    this.handlerIds.set(handler, id);
    
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
    
    return id;
  }

  /**
   * Register a handler for all events
   * Returns handler ID for removal
   */
  onAny(handler: EventHandler): string {
    const id = `handler_${this.nextHandlerId++}`;
    this.handlerIds.set(handler, id);
    
    const eventTypes: EventType[] = [
      'session.created', 'session.updated',
      'message.created', 'message.updated',
      'part.created', 'part.updated',
      'permission.request', 'tool.call', 'tool.result'
    ];
    
    for (const type of eventTypes) {
      if (!this.eventHandlers.has(type)) {
        this.eventHandlers.set(type, []);
      }
      this.eventHandlers.get(type)!.push(handler);
    }
    
    return id;
  }

  /**
   * Register a permission handler
   * The handler should return true to approve, false to deny
   */
  onPermission(handler: PermissionHandler): void {
    this.permissionHandler = handler;
  }

  /**
   * Start listening to the event stream
   */
  async startListening(): Promise<void> {
    if (this.isListening) {
      throw new Error('Already listening to event stream');
    }

    this.abortController = new AbortController();
    this.isListening = true;

    try {
      const response = await this.client.event.subscribe();

      // Process events from the stream
      for await (const event of response.stream) {
        if (!this.isListening) {
          break;
        }

        const serverEvent: ServerEvent = {
          type: event.type as EventType,
          properties: event.properties,
          timestamp: Date.now(),
        };

        // Handle permission requests automatically if handler is registered
        if ((event.type as string) === 'permission.request' && this.permissionHandler) {
          try {
            const approved = await this.permissionHandler(serverEvent as PermissionRequestEvent);
            
            // Respond to the permission request with retry logic
            const { sessionId, permissionId } = event.properties as any;
            await this.respondToPermissionWithRetry(sessionId, permissionId, approved);
          } catch (error) {
            console.error('Error handling permission request:', error);
          }
        }

        // Trigger registered event handlers
        const handlers = this.eventHandlers.get(serverEvent.type) || [];
        for (const handler of handlers) {
          try {
            await handler(serverEvent);
          } catch (error) {
            console.error(`Error in event handler for ${serverEvent.type}:`, error);
          }
        }
      }
    } catch (error) {
      if (this.isListening) {
        console.error('Event stream error:', error);
        throw error;
      }
    } finally {
      this.isListening = false;
    }
  }

  /**
   * Stop listening to the event stream
   */
  stopListening(): void {
    this.isListening = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Check if currently listening
   */
  listening(): boolean {
    return this.isListening;
  }

  /**
   * Remove all event handlers
   */
  removeAllHandlers(): void {
    this.eventHandlers.clear();
    this.permissionHandler = null;
  }

  /**
   * Remove handlers for a specific event type
   */
  removeHandlers(eventType: EventType): void {
    this.eventHandlers.delete(eventType);
  }

  /**
   * Remove specific handler by reference
   */
  off(handler: EventHandler): void {
    for (const [type, handlers] of this.eventHandlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
    this.handlerIds.delete(handler);
  }

  /**
   * Remove handler from specific event type
   */
  offType(eventType: EventType, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get count of registered handlers (for debugging)
   */
  getHandlerCount(): number {
    let count = 0;
    for (const handlers of this.eventHandlers.values()) {
      count += handlers.length;
    }
    return count;
  }

  /**
   * Respond to permission request with retry logic
   * Handles transient failures when responding to permissions
   */
  private async respondToPermissionWithRetry(
    sessionId: string,
    permissionId: string,
    approved: boolean,
    maxRetries: number = 3,
    retryDelay: number = 500
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.client.postSessionIdPermissionsPermissionId({
          path: { id: sessionId, permissionID: permissionId },
          body: { response: approved ? 'once' : 'reject' },
        });
        return; // Success
      } catch (error) {
        if (attempt < maxRetries) {
          console.log(`Permission response failed, retrying (${attempt}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, retryDelay));
        } else {
          console.error('Permission response failed after retries:', error);
          throw error;
        }
      }
    }
  }
}
