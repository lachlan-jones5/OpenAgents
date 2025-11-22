/**
 * SessionReader - Read OpenCode session data from local storage
 * 
 * Reads session info, messages, and parts from the OpenCode session storage.
 * Handles project path encoding and graceful error handling.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SessionInfo, Message, Part } from '../types/index.js';
import {
  getSessionInfoPath,
  getSessionMessagePath,
  getSessionPartPath,
} from '../config.js';

/**
 * Read and parse OpenCode session data
 */
export class SessionReader {
  private projectPath: string;
  private sessionStoragePath?: string;

  constructor(projectPath: string, sessionStoragePath?: string) {
    this.projectPath = projectPath;
    this.sessionStoragePath = sessionStoragePath;
  }

  /**
   * Get session metadata
   */
  getSessionInfo(sessionId: string): SessionInfo | null {
    try {
      const infoPath = getSessionInfoPath(this.projectPath, this.sessionStoragePath);
      const filePath = path.join(infoPath, `${sessionId}.json`);
      
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as SessionInfo;
    } catch (error) {
      console.error(`Error reading session info for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * List all available sessions
   */
  listSessions(): SessionInfo[] {
    try {
      const infoPath = getSessionInfoPath(this.projectPath, this.sessionStoragePath);
      
      if (!fs.existsSync(infoPath)) {
        return [];
      }

      const files = fs.readdirSync(infoPath);
      const sessions: SessionInfo[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionId = file.replace('.json', '');
          const info = this.getSessionInfo(sessionId);
          if (info) {
            sessions.push(info);
          }
        }
      }

      // Sort by creation time (newest first)
      return sessions.sort((a, b) => b.time.created - a.time.created);
    } catch (error) {
      console.error('Error listing sessions:', error);
      return [];
    }
  }

  /**
   * Get all messages for a session
   */
  getMessages(sessionId: string): Message[] {
    try {
      const messagePath = getSessionMessagePath(this.projectPath, this.sessionStoragePath);
      const sessionMessagePath = path.join(messagePath, sessionId);

      if (!fs.existsSync(sessionMessagePath)) {
        return [];
      }

      const files = fs.readdirSync(sessionMessagePath);
      const messages: Message[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(sessionMessagePath, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const message = JSON.parse(content) as Message;
          messages.push(message);
        }
      }

      // Sort by creation time
      return messages.sort((a, b) => a.time.created - b.time.created);
    } catch (error) {
      console.error(`Error reading messages for session ${sessionId}:`, error);
      return [];
    }
  }

  /**
   * Get a specific message
   */
  getMessage(sessionId: string, messageId: string): Message | null {
    try {
      const messagePath = getSessionMessagePath(this.projectPath, this.sessionStoragePath);
      const filePath = path.join(messagePath, sessionId, `${messageId}.json`);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as Message;
    } catch (error) {
      console.error(`Error reading message ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Get all parts for a message
   */
  getParts(sessionId: string, messageId: string): Part[] {
    try {
      const partPath = getSessionPartPath(this.projectPath, this.sessionStoragePath);
      const messagePartPath = path.join(partPath, sessionId, messageId);

      if (!fs.existsSync(messagePartPath)) {
        return [];
      }

      const files = fs.readdirSync(messagePartPath);
      const parts: Part[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(messagePartPath, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const part = JSON.parse(content) as Part;
          parts.push(part);
        }
      }

      // Sort by creation time if available
      return parts.sort((a, b) => {
        const aTime = a.time?.created || 0;
        const bTime = b.time?.created || 0;
        return aTime - bTime;
      });
    } catch (error) {
      console.error(`Error reading parts for message ${messageId}:`, error);
      return [];
    }
  }

  /**
   * Get a specific part
   */
  getPart(sessionId: string, messageId: string, partId: string): Part | null {
    try {
      const partPath = getSessionPartPath(this.projectPath, this.sessionStoragePath);
      const filePath = path.join(partPath, sessionId, messageId, `${partId}.json`);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as Part;
    } catch (error) {
      console.error(`Error reading part ${partId}:`, error);
      return null;
    }
  }

  /**
   * Get complete session data (info + messages + parts)
   */
  getCompleteSession(sessionId: string): {
    info: SessionInfo | null;
    messages: Array<{
      message: Message;
      parts: Part[];
    }>;
  } {
    const info = this.getSessionInfo(sessionId);
    const messages = this.getMessages(sessionId);

    const messagesWithParts = messages.map(message => ({
      message,
      parts: this.getParts(sessionId, message.id),
    }));

    return {
      info,
      messages: messagesWithParts,
    };
  }
}
