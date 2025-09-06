// src/services/syncService.ts
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Database } from '../db/database';
import TaskService from './taskService';
import { Task, SyncQueueItem } from '../types';

function nowISO() {
  return new Date().toISOString();
}

export class SyncService {
  private batchSize: number;
  private maxRetries: number;
  private serverBase: string;

  constructor(private db: Database, private _taskService: TaskService) {
    this.batchSize = Number(process.env.SYNC_BATCH_SIZE || 50);
    this.maxRetries = Number(process.env.SYNC_RETRY_ATTEMPTS || 3);
    this.serverBase = process.env.API_BASE_URL || 'http://localhost:3000/api';
    void this._taskService;
  }


  /**
 * Compatibility wrapper expected by routes/tests:
 * triggerSync() should behave like sync()
 */
async triggerSync() {
  return this.sync();
}

/**
 * Compatibility wrapper for getStatus used by routes
 * If you already have a getStatus implementation, keep it; otherwise
 * add it here to return a small status object.
 */
async getStatus() {
  // compute pending count and last_sync_timestamp similar to earlier versions
  const pendingCountRow: any = await this.db.get(`SELECT COUNT(*) as c FROM sync_queue`);
  const pending_sync_count = pendingCountRow ? Number(pendingCountRow.c || 0) : 0;

  const lastSyncRow: any = await this.db.get(`SELECT MAX(last_synced_at) as t FROM tasks WHERE last_synced_at IS NOT NULL`);
  const last_sync_timestamp = lastSyncRow ? lastSyncRow.t : null;

  return {
    pending_sync_count,
    last_sync_timestamp,
    is_online: true,
    sync_queue_size: pending_sync_count,
  };
}

  /**
   * Check connectivity by calling server health endpoint.
   * Tests mock axios.get and expect this method to exist.
   */
  async checkConnectivity(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.serverBase}/health`, { timeout: 2000 });
      return !!(res && res.data && (res.data.status === 'ok' || res.data.status));
    } catch (err) {
      return false;
    }
  }

  /**
   * Add item to sync_queue programmatically (used by tests).
   */
  async addToSyncQueue(taskId: string, operation: 'create' | 'update' | 'delete', data: Partial<Task>): Promise<void> {
    const createdAt = nowISO();
    const payload = JSON.stringify(data);
    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data, retry_count, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [uuidv4(), taskId, operation, payload, createdAt]
    );
  }

  /**
   * High-level sync entrypoint used by tests. Name "sync" is expected.
   * It will read up to batchSize items and send them to server /batch, then apply responses.
   */
  async sync() {
    const result = {
      success: true,
      synced_items: 0,
      failed_items: 0,
      errors: [] as Array<{ task_id: string; operation: string; error: string; timestamp: string }>,
    };

    // fetch items
    const items: SyncQueueItem[] = await this.db.all(
      `SELECT * FROM sync_queue ORDER BY created_at ASC LIMIT ?`,
      [this.batchSize]
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
      const res = await axios.post(`${this.serverBase}/batch`, { items: payloadItems, client_timestamp: nowISO() });
      const processed = res?.data?.processed_items ?? [];

      // apply processed results: for successes, set tasks to synced and remove queue
      for (const p of processed) {
        // find matching queue item by client_id/task_id
        const clientId = p.client_id ?? p.task_id ?? null;
        // if the server returned server_id and resolved_data, update the task row
        if (p.status === 'success') {
          const serverId = p.server_id;
          const updated_at = (p.resolved_data && p.resolved_data.updated_at) || nowISO();
          // update task row
          await this.db.run(
            `UPDATE tasks SET sync_status = 'synced', server_id = ?, last_synced_at = ?, updated_at = ? WHERE id = ?`,
            [serverId, updated_at, updated_at, clientId]
          );
          // remove queue items that relate to this clientId
          await this.db.run(`DELETE FROM sync_queue WHERE task_id = ?`, [clientId]);

          result.synced_items += 1;
        } else {
          result.failed_items += 1;
          result.errors.push({
            task_id: clientId,
            operation: 'unknown',
            error: p.error ?? 'failed',
            timestamp: nowISO(),
          });
        }
      }

      return result;
    } catch (err: any) {
      // network-level failure -> increment retry_count and maybe mark error
      for (const item of items) {
        await this.db.run(
          `UPDATE sync_queue SET retry_count = retry_count + 1, error_message = ? WHERE id = ?`,
          [String(err.message || err), item.id]
        );

        if ((item.retry_count ?? 0) + 1 >= this.maxRetries) {
          await this.db.run(`UPDATE tasks SET sync_status = 'error' WHERE id = ?`, [item.task_id]);
        }
      }

      return { success: false, synced_items: 0, failed_items: items.length, errors: [{ task_id: null, operation: 'batch', error: String(err.message || err), timestamp: nowISO() }] };
    }
  }

  // Keep previous minimal helpers if needed (e.g., processBatch) — not required by tests
  async processBatch(reqBody: { items?: any[]; client_timestamp?: string }) {
    const processed_items: Array<any> = [];

    for (const it of (reqBody.items || [])) {
      const clientId = it.task_id ?? it.client_id ?? it.data?.id ?? null;
      const serverId = `srv_${uuidv4().slice(0, 8)}`;

      const resolved_data = {
        id: serverId,
        title: it.data?.title ?? it.title ?? 'untitled',
        description: it.data?.description ?? null,
        completed: !!(it.data?.completed),
        created_at: it.data?.created_at ?? nowISO(),
        updated_at: it.data?.updated_at ?? nowISO(),
      };

      processed_items.push({
        client_id: clientId,
        server_id: serverId,
        status: 'success',
        resolved_data,
      });
    }

    return { processed_items };
  }
}

export default SyncService;
