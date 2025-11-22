import { spawn, ChildProcess } from 'child_process';

export interface ServerConfig {
  port?: number;
  hostname?: string;
  printLogs?: boolean;
  logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  timeout?: number; // ms to wait for server to start
}

export class ServerManager {
  private process: ChildProcess | null = null;
  private port: number;
  private hostname: string;
  private isRunning: boolean = false;

  constructor(private config: ServerConfig = {}) {
    this.port = config.port || 0; // 0 = random port
    this.hostname = config.hostname || '127.0.0.1';
  }

  /**
   * Start the opencode server
   */
  async start(): Promise<{ url: string; port: number }> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    return new Promise((resolve, reject) => {
      const args = ['serve'];

      if (this.port !== 0) {
        args.push('--port', this.port.toString());
      }
      if (this.hostname) {
        args.push('--hostname', this.hostname);
      }
      if (this.config.printLogs) {
        args.push('--print-logs');
      }
      if (this.config.logLevel) {
        args.push('--log-level', this.config.logLevel);
      }

      // Spawn opencode serve
      this.process = spawn('opencode', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      let stdout = '';
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          this.stop();
          reject(new Error(`Server failed to start within ${this.config.timeout || 5000}ms`));
        }
      }, this.config.timeout || 5000);

      // Listen for server startup message
      this.process.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        
        // Look for "opencode server listening on http://..."
        const match = stdout.match(/opencode server listening on (http:\/\/[^\s]+)/);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          
          const url = match[1];
          const portMatch = url.match(/:(\d+)$/);
          this.port = portMatch ? parseInt(portMatch[1]) : this.port;
          this.isRunning = true;

          resolve({ url, port: this.port });
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        
        // Also check stderr for the startup message
        const match = stderr.match(/opencode server listening on (http:\/\/[^\s]+)/);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          
          const url = match[1];
          const portMatch = url.match(/:(\d+)$/);
          this.port = portMatch ? parseInt(portMatch[1]) : this.port;
          this.isRunning = true;

          resolve({ url, port: this.port });
        }
      });

      this.process.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`Failed to start server: ${error.message}`));
        }
      });

      this.process.on('exit', (code) => {
        this.isRunning = false;
        if (!resolved && code !== 0) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`Server exited with code ${code}\nstderr: ${stderr}`));
        }
      });
    });
  }

  /**
   * Stop the opencode server
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      this.process.on('exit', () => {
        this.isRunning = false;
        this.process = null;
        resolve();
      });

      // Try graceful shutdown first
      this.process.kill('SIGTERM');

      // Force kill after 3 seconds
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 3000);
    });
  }

  /**
   * Get the server URL
   */
  getUrl(): string | null {
    if (!this.isRunning) {
      return null;
    }
    return `http://${this.hostname}:${this.port}`;
  }

  /**
   * Check if server is running
   */
  running(): boolean {
    return this.isRunning;
  }

  /**
   * Get the server port
   */
  getPort(): number | null {
    return this.isRunning ? this.port : null;
  }
}
