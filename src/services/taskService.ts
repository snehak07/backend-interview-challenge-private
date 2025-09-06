// src/services/taskService.ts
import { v4 as uuidv4 } from 'uuid';
import { Database } from '../db/database';
import { Task } from '../types';

function nowISO(): string {
  return new Date().toISOString();
}

function rowToTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    completed: !!row.completed,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
    updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
    is_deleted: !!row.is_deleted,
    sync_status: row.sync_status ?? 'pending',
    server_id: row.server_id ?? undefined,
    last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : undefined,
  } as Task;
}

export class TaskService {
  constructor(private db: Database) {}

  async createTask(input: { title?: string; description?: string | null; completed?: boolean }): Promise<Task> {
    const title = (input.title ?? '').trim();
    if (!title) throw new Error('Title is required');

    const id = uuidv4();
    const now = nowISO();
    const description = input.description ?? null;
    const completed = input.completed ? 1 : 0;

    const insertSql = `
      INSERT INTO tasks (
        id, title, description, completed, created_at, updated_at,
        is_deleted, sync_status, server_id, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', NULL, NULL)
    `;
    await this.db.run(insertSql, [id, title, description, completed, now, now]);

    // enqueue create operation
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

    const row = await this.db.get(`SELECT * FROM tasks WHERE id = ?`, [id]);
    return rowToTask(row);
  }

  async getTaskById(id: string): Promise<Task> {
    const row = await this.db.get(`SELECT * FROM tasks WHERE id = ?`, [id]);
    if (!row) throw new Error('Task not found');
    return rowToTask(row);
  }

  /**
   * Return null if task doesn't exist (tests expect null)
   */
  async updateTask(id: string, updates: { title?: string; description?: string | null; completed?: boolean }): Promise<Task | null> {
    const existing = await this.db.get(`SELECT * FROM tasks WHERE id = ?`, [id]);
    if (!existing) return null; // <-- changed to return null

    const newTitle = updates.title !== undefined ? String(updates.title).trim() : existing.title;
    if (!newTitle) throw new Error('Title cannot be empty');

    const newDescription = updates.description !== undefined ? updates.description : existing.description;
    const newCompleted = updates.completed !== undefined ? (updates.completed ? 1 : 0) : existing.completed;
    const updatedAt = nowISO();

    const updateSql = `
      UPDATE tasks
      SET title = ?, description = ?, completed = ?, updated_at = ?, sync_status = 'pending'
      WHERE id = ?
    `;
    await this.db.run(updateSql, [newTitle, newDescription, newCompleted, updatedAt, id]);

    // enqueue update
    const queueSql = `
      INSERT INTO sync_queue (id, task_id, operation, data, retry_count, created_at)
      VALUES (?, ?, 'update', ?, 0, ?)
    `;
    const payload = JSON.stringify({
      id,
      title: newTitle,
      description: newDescription,
      completed: !!newCompleted,
      updated_at: updatedAt,
    });
    await this.db.run(queueSql, [uuidv4(), id, payload, updatedAt]);

    const row = await this.db.get(`SELECT * FROM tasks WHERE id = ?`, [id]);
    return rowToTask(row);
  }

  /**
   * Soft delete a task. Return true on success, false if not found.
   */
  async deleteTask(id: string): Promise<boolean> {
    const existing = await this.db.get(`SELECT * FROM tasks WHERE id = ?`, [id]);
    if (!existing) return false; // <-- return false if missing

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
    const rows = await this.db.all(`SELECT * FROM tasks WHERE is_deleted = 0 ORDER BY created_at DESC`, []);
    return rows.map(rowToTask);
  }

  async getTasksNeedingSync(): Promise<Task[]> {
    const rows = await this.db.all(
      `SELECT * FROM tasks WHERE sync_status IN ('pending','error') ORDER BY updated_at ASC`,
      []
    );
    return rows.map(rowToTask);
  }
}

export default TaskService;
