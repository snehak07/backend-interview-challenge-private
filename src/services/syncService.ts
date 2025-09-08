// src/services/syncService.ts
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Database } from '../db/database';
import TaskService from './taskService';
import { Task, SyncQueueItem } from '../types';

function nowISO() {
  return new Date().toISOString();
}

// Types for DB rows
type CountRow = { c: number };
type LastSyncRow = { t: string | null };

// Types for processBatch
type IncomingItem = {
  task_id?: string;
  client_id?: string;
  data?: Partial<Task>;
  title?: string;
  description?: string | null;
  completed?: boolean;
  created_at?: string;
  updated_at?: string;
  operation?: 'create' | 'update' | 'delete' | string;
};

type ProcessedItem = {
  client_id: string | null;
  server_id: string;
  task_id?: string | null;
  status: 'success' | 'error';
  resolved_data: Partial<Task>;
  operation?: 'create' | 'update' | 'delete' | string;
  conflict?: boolean;
};

type ServerTaskRow = {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  completed: number; // 0/1
  is_deleted: number; // 0/1
  created_at: string;
  updated_at: string;
};

export class SyncService {
  private batchSize: number;
  private maxRetries: number;
  private serverBase: string;

  constructor(
    private db: Database,
    private _taskService: TaskService,
  ) {
    this.batchSize = Number(process.env.SYNC_BATCH_SIZE || 50);
    this.maxRetries = Number(process.env.SYNC_RETRY_ATTEMPTS || 3);
    this.serverBase = process.env.API_BASE_URL || 'http://localhost:3000/api';
    void this._taskService;
  }

  /** Compatibility wrapper expected by routes/tests */
  async triggerSync() {
    return this.sync();
  }

  /** Get sync status (pending count, last sync time, etc.) */
  async getStatus() {
    const pendingCountRow: CountRow | undefined = await this.db.get(
      `SELECT COUNT(*) as c FROM sync_queue`,
    );
    const pending_sync_count = pendingCountRow
      ? Number(pendingCountRow.c || 0)
      : 0;

    const lastSyncRow: LastSyncRow | undefined = await this.db.get(
      `SELECT MAX(last_synced_at) as t FROM tasks WHERE last_synced_at IS NOT NULL`,
    );
    const last_sync_timestamp = lastSyncRow ? lastSyncRow.t : null;

    return {
      pending_sync_count,
      last_sync_timestamp,
      is_online: true,
      sync_queue_size: pending_sync_count,
    };
  }

  /** Check connectivity by calling server health endpoint. */
  async checkConnectivity(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.serverBase}/health`, {
        timeout: 2000,
      });
      return !!(
        res &&
        res.data &&
        (res.data.status === 'ok' || res.data.status)
      );
    } catch {
      return false;
    }
  }

  /** Add item to sync_queue programmatically (used by tests). */
  async addToSyncQueue(
    taskId: string,
    operation: 'create' | 'update' | 'delete',
    data: Partial<Task>,
  ): Promise<void> {
    const createdAt = nowISO();
    const payload = JSON.stringify(data);
    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data, retry_count, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [uuidv4(), taskId, operation, payload, createdAt],
    );
  }

  /** High-level sync entrypoint used by tests */
  async sync() {
    const result = {
      success: true,
      synced_items: 0,
      failed_items: 0,
      errors: [] as Array<{
        task_id: string | null;
        operation: string;
        error: string;
        timestamp: string;
      }>,
    };

    // fetch items
    const items: SyncQueueItem[] = await this.db.all(
      `SELECT * FROM sync_queue ORDER BY created_at ASC LIMIT ?`,
      [this.batchSize],
    );

    if (!items || items.length === 0) return result;

    // build payload for server
    const payloadItems = items.map((it) => ({
      id: it.id,
      task_id: it.task_id,
      operation: it.operation,
      data: typeof it.data === 'string' ? JSON.parse(it.data) : it.data,
      created_at: it.created_at,
      retry_count: it.retry_count,
    }));

    try {
      const res = await axios.post(`${this.serverBase}/batch`, {
        items: payloadItems,
        client_timestamp: nowISO(),
      });
      const processed: ProcessedItem[] = res?.data?.processed_items ?? [];

      // apply processed results
      for (const p of processed) {
        const clientId = p.client_id ?? p.task_id ?? null;

        if (p.status === 'success') {
          const serverId = p.server_id;
          const updated_at =
            (p.resolved_data && p.resolved_data.updated_at) || nowISO();

          // update task row
          await this.db.run(
            `UPDATE tasks SET sync_status = 'synced', server_id = ?, last_synced_at = ?, updated_at = ? WHERE id = ?`,
            [serverId, updated_at, updated_at, clientId],
          );
          // remove queue item
          await this.db.run(`DELETE FROM sync_queue WHERE task_id = ?`, [
            clientId,
          ]);

          result.synced_items += 1;

          // Surface conflict information even on success
          if (p.conflict) {
            result.errors.push({
              task_id: clientId,
              operation: (p.operation as string) || 'update',
              error: 'Conflict resolved using last-write-wins',
              timestamp: nowISO(),
            });
          }
        } else {
          result.failed_items += 1;
          result.errors.push({
            task_id: clientId,
            operation: 'unknown',
            error: 'failed',
            timestamp: nowISO(),
          });
        }
      }

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      // update retry counts
      for (const item of items) {
        await this.db.run(
          `UPDATE sync_queue SET retry_count = retry_count + 1, error_message = ? WHERE id = ?`,
          [message, item.id],
        );

        if ((item.retry_count ?? 0) + 1 >= this.maxRetries) {
          await this.db.run(
            `UPDATE tasks SET sync_status = 'error' WHERE id = ?`,
            [item.task_id],
          );
        }
      }

      return {
        success: false,
        synced_items: 0,
        failed_items: items.length,
        errors: [
          {
            task_id: null,
            operation: 'batch',
            error: message,
            timestamp: nowISO(),
          },
        ],
      };
    }
  }

  /** Realistic batch processor storing items in server_tasks with last-write-wins */
  async processBatch(reqBody: {
    items?: IncomingItem[];
    client_timestamp?: string;
  }) {
    const processed_items: ProcessedItem[] = [];

    for (const it of reqBody.items || []) {
      const clientId: string | null =
        it.task_id ??
        it.client_id ??
        (it.data?.id as string | undefined) ??
        null;
      const op: string = it.operation || 'update';

      // Normalize incoming payload
      const incoming: Required<Pick<Task, 'title'>> & Partial<Task> = {
        title: (it.data?.title ?? it.title ?? 'untitled') as string,
        description: (it.data?.description ?? null) as string | null,
        completed: !!(it.data?.completed ?? false),
        created_at: it.data?.created_at ?? nowISO(),
        updated_at: it.data?.updated_at ?? nowISO(),
      };

      // Fetch existing server record by client_id
      const existing = await this.db.get<ServerTaskRow>(
        `SELECT * FROM server_tasks WHERE client_id = ?`,
        [clientId],
      );

      // Helper to coerce boolean -> integer for DB
      const toInt = (b: boolean | number | undefined) => (b ? 1 : 0);

      let serverId: string;

      try {
        const incomingUpdatedAt = incoming.updated_at ?? nowISO();
        if (op === 'delete') {
          // Mark as deleted server-side (soft delete)
          if (existing) {
            await this.db.run(
              `UPDATE server_tasks SET is_deleted = 1, updated_at = ? WHERE id = ?`,
              [incomingUpdatedAt, existing.id],
            );
            serverId = existing.id;
          } else {
            // Create a tombstone so future updates know it was deleted server-side
            serverId = `srv_${uuidv4().slice(0, 8)}`;
            await this.db.run(
              `INSERT INTO server_tasks (id, client_id, title, description, completed, is_deleted, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
              [
                serverId,
                clientId,
                incoming.title,
                incoming.description ?? null,
                toInt(incoming.completed ?? false),
                incoming.created_at ?? incomingUpdatedAt,
                incomingUpdatedAt,
              ],
            );
          }
        } else if (!existing) {
          // Create new server record
          serverId = `srv_${uuidv4().slice(0, 8)}`;
          await this.db.run(
            `INSERT INTO server_tasks (id, client_id, title, description, completed, is_deleted, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
            [
              serverId,
              clientId,
              incoming.title,
              incoming.description ?? null,
              toInt(incoming.completed ?? false),
              incoming.created_at ?? incomingUpdatedAt,
              incomingUpdatedAt,
            ],
          );
        } else {
          // Update with last-write-wins: only apply if incoming.updated_at is newer
          const isNewer =
            !existing.updated_at || incomingUpdatedAt >= existing.updated_at;
          serverId = existing.id;
          if (isNewer) {
            await this.db.run(
              `UPDATE server_tasks
               SET title = ?, description = ?, completed = ?, is_deleted = 0, updated_at = ?
               WHERE id = ?`,
              [
                incoming.title,
                incoming.description ?? null,
                toInt(incoming.completed ?? false),
                incomingUpdatedAt,
                existing.id,
              ],
            );
          }
        }

        // Return resolved_data reflecting server state after operation
        const serverRow = await this.db.get<ServerTaskRow>(
          `SELECT * FROM server_tasks WHERE client_id = ?`,
          [clientId],
        );

        // Determine conflict: when an existing row existed and incoming was older
        const conflict =
          !!existing && !!serverRow && incomingUpdatedAt < serverRow.updated_at;

        const resolved: Partial<Task> = serverRow
          ? {
              id: serverRow.id,
              title: serverRow.title,
              description: serverRow.description ?? null,
              completed: Boolean(Number(serverRow.completed ?? 0)),
              created_at: serverRow.created_at,
              updated_at: serverRow.updated_at,
            }
          : {
              id: serverId!,
              title: incoming.title,
              description: incoming.description ?? null,
              completed: Boolean(incoming.completed),
              created_at: incoming.created_at,
              updated_at: incoming.updated_at,
            };

        processed_items.push({
          client_id: clientId ?? null,
          server_id: (serverRow?.id ?? serverId) as string,
          status: 'success',
          resolved_data: resolved,
          operation: op as 'create' | 'update' | 'delete',
          conflict,
        });
      } catch {
        processed_items.push({
          client_id: clientId ?? null,
          server_id: '' as unknown as string,
          status: 'error',
          resolved_data: {},
          operation: op as 'create' | 'update' | 'delete',
        });
      }
    }

    return { processed_items };
  }
}

export default SyncService;
