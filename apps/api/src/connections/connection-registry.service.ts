import { Injectable } from '@nestjs/common';

type LiveConnection = {
  connectionString: string;
  schema: string;
  expiresAt: number;
};

const TTL_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class ConnectionRegistry {
  private readonly live = new Map<string, LiveConnection>();

  private key(userId: string, dataSourceId: string): string {
    return `${userId}:${dataSourceId}`;
  }

  set(
    userId: string,
    dataSourceId: string,
    connectionString: string,
    schema: string,
  ): void {
    this.live.set(this.key(userId, dataSourceId), {
      connectionString,
      schema,
      expiresAt: Date.now() + TTL_MS,
    });
  }

  get(userId: string, dataSourceId: string): LiveConnection | null {
    const key = this.key(userId, dataSourceId);
    const conn = this.live.get(key);
    if (!conn) return null;
    if (Date.now() > conn.expiresAt) {
      this.live.delete(key);
      return null;
    }
    conn.expiresAt = Date.now() + TTL_MS;
    return conn;
  }

  has(userId: string, dataSourceId: string): boolean {
    return this.get(userId, dataSourceId) !== null;
  }

  clearUser(userId: string): void {
    const prefix = `${userId}:`;
    for (const key of this.live.keys()) {
      if (key.startsWith(prefix)) {
        this.live.delete(key);
      }
    }
  }
}
