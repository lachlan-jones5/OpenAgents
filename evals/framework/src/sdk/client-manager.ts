import { createOpencodeClient, type Session, type Message, type Part } from '@opencode-ai/sdk';

// SDK input type for text parts
type TextPartInput = {
  type: 'text';
  text: string;
  id?: string;
  synthetic?: boolean;
  ignored?: boolean;
};

export interface ClientConfig {
  baseUrl: string;
  timeout?: number;
}

export interface PromptOptions {
  text: string;
  model?: {
    providerID: string;
    modelID: string;
  };
  files?: string[];
  noReply?: boolean; // If true, only adds context without triggering AI response
}

export interface SessionInfo {
  id: string;
  title?: string;
  messages: Array<{
    info: Message;
    parts: Part[];
  }>;
}

export class ClientManager {
  private client: ReturnType<typeof createOpencodeClient>;

  constructor(config: ClientConfig) {
    this.client = createOpencodeClient({
      baseUrl: config.baseUrl,
    });
  }

  /**
   * Create a new session
   */
  async createSession(title?: string): Promise<Session> {
    const response = await this.client.session.create({
      body: {
        title: title || `Eval Session ${new Date().toISOString()}`,
      },
    });

    if (!response.data) {
      throw new Error('Failed to create session');
    }

    return response.data;
  }

  /**
   * Send a prompt to a session
   */
  async sendPrompt(sessionId: string, options: PromptOptions): Promise<{ info: Message; parts: Part[] }> {
    const parts: TextPartInput[] = [{ type: 'text', text: options.text }];

    // Add file attachments if specified
    if (options.files && options.files.length > 0) {
      // TODO: Implement file attachment support
      console.warn('File attachments not yet implemented');
    }

    const response = await this.client.session.prompt({
      path: { id: sessionId },
      body: {
        model: options.model,
        parts,
        noReply: options.noReply,
      },
    });

    if (!response.data) {
      throw new Error('Failed to send prompt');
    }

    return response.data;
  }

  /**
   * Get session details including all messages
   */
  async getSession(sessionId: string): Promise<SessionInfo> {
    const [sessionResponse, messagesResponse] = await Promise.all([
      this.client.session.get({ path: { id: sessionId } }),
      this.client.session.messages({ path: { id: sessionId } }),
    ]);

    if (!sessionResponse.data) {
      throw new Error('Failed to get session');
    }

    return {
      id: sessionResponse.data.id,
      title: sessionResponse.data.title,
      messages: messagesResponse.data || [],
    };
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<Session[]> {
    const response = await this.client.session.list();
    return response.data || [];
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const response = await this.client.session.delete({
      path: { id: sessionId },
    });
    return response.data || false;
  }

  /**
   * Abort a running session
   */
  async abortSession(sessionId: string): Promise<boolean> {
    const response = await this.client.session.abort({
      path: { id: sessionId },
    });
    return response.data || false;
  }

  /**
   * Send a command to a session
   */
  async sendCommand(sessionId: string, command: string): Promise<Message> {
    const response = await this.client.session.command({
      path: { id: sessionId },
      body: { 
        command,
        arguments: '', // Required by SDK
      },
    });

    if (!response.data) {
      throw new Error('Failed to send command');
    }

    return response.data.info;
  }

  /**
   * Respond to a permission request
   */
  async respondToPermission(
    sessionId: string,
    permissionId: string,
    approved: boolean
  ): Promise<boolean> {
    const response = await this.client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permissionId },
      body: { response: approved ? 'once' : 'reject' },
    });
    return response.data || false;
  }

  /**
   * Get the underlying SDK client for advanced usage
   */
  getClient(): ReturnType<typeof createOpencodeClient> {
    return this.client;
  }
}
