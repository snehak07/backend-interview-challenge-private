// src/services/taskService.ts
import { v4 as uuidv4 } from 'uuid';
import { Database } from '../db/database';
import { Task } from '../types';

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Convert a DB row (unknown) to an application Task.
 * DB stores booleans as integers (0/1) and timestamps as strings.
 */
function rowToTask(row: unknown): Task {
  const r = row as {
    id: string;
    title: string;
    description?: string | null;
    completed?: number | boolean;
    created_at?: string | null;
    updated_at?: string | null;
    is_deleted?: number | boolean;
    sync_status?: string | null;
    server_id?: string | null;
    last_synced_at?: string | null;
  };

  return {
    id: String(r.id),
    title: String(r.title),
    description: r.description ?? undefined,
    // coerce DB 0/1 to boolean; also handle boolean if already converted
    completed:
      typeof r.completed === 'boolean'
        ? r.completed
        : !!Number(r.completed ?? 0),
    created_at: r.created_at ?? nowISO(),
    updated_at: r.updated_at ?? nowISO(),
    is_deleted:
      typeof r.is_deleted === 'boolean'
        ? r.is_deleted
        : !!Number(r.is_deleted ?? 0),
    sync_status: r.sync_status ?? 'pending',
    server_id: r.server_id ?? null,
    last_synced_at: r.last_synced_at ?? null,
  };
}

export class TaskService {
  constructor(private db: Database) {}

  async createTask(input: {
    title?: string;
    description?: string | null;
    completed?: boolean;
  }): Promise<Task> {
    const title = (input.title ?? '').trim();
    if (!title) throw new Error('Title is required');

    const id = uuidv4();
    const now = nowISO();
    const description = input.description ?? null;
    const completedNum = input.completed ? 1 : 0;

    const insertSql = `
      INSERT INTO tasks (
        id, title, description, completed, created_at, updated_at,
        is_deleted, sync_status, server_id, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', NULL, NULL)
    `;

    await this.db.run(insertSql, [
      id,
      title,
      description,
      completedNum,
      now,
      now,
    ]);

    // enqueue create operation in sync_queue
    const queueSql = `
      INSERT INTO sync_queue (id, task_id, operation, data, retry_count, created_at)
      VALUES (?, ?, 'create', ?, 0, ?)
    `;
    const payload = JSON.stringify({
      id,
      title,
      description,
      completed: !!input.completed,
      updated_at: now,
    });
    await this.db.run(queueSql, [uuidv4(), id, payload, now]);

    const row = await this.db.get<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE id = ?`,
      [id],
    );
    return rowToTask(row);
  }

  async getTaskById(id: string): Promise<Task> {
    const row = await this.db.get<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE id = ?`,
      [id],
    );
    if (!row) throw new Error('Task not found');
    return rowToTask(row);
  }

  /**
   * Update a task. Return updated Task or null if not found.
   */
  async updateTask(
    id: string,
    updates: {
      title?: string;
      description?: string | null;
      completed?: boolean;
    },
  ): Promise<Task | null> {
    const existingRow = await this.db.get<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE id = ?`,
      [id],
    );
    if (!existingRow) return null;

    const existing = rowToTask(existingRow);

    const newTitle =
      updates.title !== undefined
        ? String(updates.title).trim()
        : existing.title;
    if (!newTitle) throw new Error('Title cannot be empty');

    const newDescription =
      updates.description !== undefined
        ? updates.description
        : (existing.description ?? null);

    const existingCompletedNum = existing.completed ? 1 : 0;
    const newCompletedNum =
      updates.completed !== undefined
        ? updates.completed
          ? 1
          : 0
        : existingCompletedNum;

    const updatedAt = nowISO();

    const updateSql = `
      UPDATE tasks
      SET title = ?, description = ?, completed = ?, updated_at = ?, sync_status = 'pending'
      WHERE id = ?
    `;
    await this.db.run(updateSql, [
      newTitle,
      newDescription,
      newCompletedNum,
      updatedAt,
      id,
    ]);

    // enqueue update
    const queueSql = `
      INSERT INTO sync_queue (id, task_id, operation, data, retry_count, created_at)
      VALUES (?, ?, 'update', ?, 0, ?)
    `;
    const payload = JSON.stringify({
      id,
      title: newTitle,
      description: newDescription,
      completed: !!newCompletedNum,
      updated_at: updatedAt,
    });
    await this.db.run(queueSql, [uuidv4(), id, payload, updatedAt]);

    const row = await this.db.get<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE id = ?`,
      [id],
    );
    return rowToTask(row);
  }

  /**
   * Soft delete a task. Return true on success, false if not found.
   */
  async deleteTask(id: string): Promise<boolean> {
    const existingRow = await this.db.get<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE id = ?`,
      [id],
    );
    if (!existingRow) return false;

    const updatedAt = nowISO();
    const sql = `
      UPDATE tasks
      SET is_deleted = 1, updated_at = ?, sync_status = 'pending'
      WHERE id = ?
    `;
    await this.db.run(sql, [updatedAt, id]);

    // enqueue delete
    const queueSql = `
      INSERT INTO sync_queue (id, task_id, operation, data, retry_count, created_at)
      VALUES (?, ?, 'delete', ?, 0, ?)
    `;
    const payload = JSON.stringify({ id, updated_at: updatedAt });
    await this.db.run(queueSql, [uuidv4(), id, payload, updatedAt]);

    return true;
  }

  async getAllTasks(): Promise<Task[]> {
    const rows = await this.db.all<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE is_deleted = 0 ORDER BY created_at DESC`,
      [],
    );
    return rows.map(rowToTask);
  }

  async getTasksNeedingSync(): Promise<Task[]> {
    const rows = await this.db.all<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE sync_status IN ('pending','error') ORDER BY updated_at ASC`,
      [],
    );
    return rows.map(rowToTask);
  }
}

export default TaskService;
