import sqlite3 from 'sqlite3';

const sqlite = sqlite3.verbose();

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: number;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  sync_status?: string;
  server_id?: string;
  last_synced_at?: string;
}

export class Database {
  private db: sqlite3.Database;

  constructor(filename: string = ':memory:') {
    this.db = new sqlite.Database(filename);
  }

  async initialize(): Promise<void> {
    await this.createTables();
  }

  private async createTables(): Promise<void> {
    const createTasksTable = `
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        completed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'pending',
        server_id TEXT,
        last_synced_at DATETIME
      )
    `;

    const createSyncQueueTable = `
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `;

    // Server-side storage to simulate a real backend for batch processing
    // Keeps mapping from client_id -> server task along with last-write-wins timestamps
    const createServerTasksTable = `
      CREATE TABLE IF NOT EXISTS server_tasks (
        id TEXT PRIMARY KEY,                 -- server-assigned id (srv_*)
        client_id TEXT UNIQUE,               -- client/local id
        title TEXT NOT NULL,
        description TEXT,
        completed INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this.run(createTasksTable);
    await this.run(createSyncQueueTable);
    await this.run(createServerTasksTable);
  }

  run(sql: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err: unknown) => {
        if (err) reject(err as Error);
        else resolve();
      });
    });
  }

  get<T = unknown>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err: unknown, row?: T) => {
        if (err) reject(err as Error);
        else resolve(row);
      });
    });
  }

  all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err: unknown, rows: T[]) => {
        if (err) reject(err as Error);
        else resolve(rows);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err: unknown) => {
        if (err) reject(err as Error);
        else resolve();
      });
    });
  }
}
