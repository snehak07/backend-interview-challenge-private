// src/routes/tasks.ts
import { Router, Request, Response } from 'express';
import { Database } from '../db/database'; // <-- named import
import TaskService from '../services/taskService';
import { Task } from '../types';

export function createTaskRouter(db: Database) {
  const router = Router();
  const taskService = new TaskService(db);

  // GET /api/tasks
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const tasks: Task[] = await taskService.getAllTasks();
      return res.json(tasks);
    } catch (err) {
      if (err instanceof Error)
        return res.status(500).json({ error: err.message });
      return res.status(500).json({ error: 'Unknown error' });
    }
  });

  // GET /api/tasks/:id
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const task = await taskService.getTaskById(id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      return res.json(task);
    } catch (err) {
      if (err instanceof Error)
        return res.status(500).json({ error: err.message });
      return res.status(500).json({ error: 'Unknown error' });
    }
  });

  // POST /api/tasks
  router.post('/', async (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<
        Omit<Task, 'id' | 'created_at' | 'updated_at'>
      >;
      const created = await taskService.createTask(body);
      return res.status(201).json(created);
    } catch (err) {
      if (err instanceof Error)
        return res.status(400).json({ error: err.message });
      return res.status(500).json({ error: 'Unknown error' });
    }
  });

  // PUT /api/tasks/:id
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body as Partial<
        Omit<Task, 'id' | 'created_at' | 'updated_at'>
      >;
      const updated = await taskService.updateTask(id, updates);
      if (!updated) return res.status(404).json({ error: 'Task not found' });
      return res.json(updated);
    } catch (err) {
      if (err instanceof Error)
        return res.status(400).json({ error: err.message });
      return res.status(500).json({ error: 'Unknown error' });
    }
  });

  // DELETE /api/tasks/:id
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const ok = await taskService.deleteTask(id);
      if (!ok) return res.status(404).json({ error: 'Task not found' });
      return res.status(204).send();
    } catch (err) {
      if (err instanceof Error)
        return res.status(500).json({ error: err.message });
      return res.status(500).json({ error: 'Unknown error' });
    }
  });

  return router;
}
