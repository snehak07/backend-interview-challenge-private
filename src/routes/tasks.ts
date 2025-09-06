// src/routes/tasks.ts
import { Router, Request, Response } from 'express';
import { Database } from '../db/database';
import TaskService from '../services/taskService';

export function createTaskRouter(db: Database) {
  const router = Router();
  const taskService = new TaskService(db);

  function errorResponse(res: Response, status: number, message: string, path: string) {
    return res.status(status).json({
      error: message,
      timestamp: new Date().toISOString(),
      path,
    });
  }

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const tasks = await taskService.getAllTasks();
      return res.status(200).json(tasks);
    } catch (err: any) {
      console.error('GET /tasks error', err);
      return errorResponse(res, 500, 'Internal Server Error', '/api/tasks');
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const task = await taskService.getTaskById(id);
      return res.status(200).json(task);
    } catch (err: any) {
      if (err && /not found/i.test(String(err.message))) {
        return errorResponse(res, 404, 'Task not found', req.originalUrl);
      }
      console.error(`GET /tasks/${req.params.id} error`, err);
      return errorResponse(res, 500, 'Internal Server Error', req.originalUrl);
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { title, description } = req.body ?? {};
      if (!title || String(title).trim() === '') {
        return errorResponse(res, 400, 'Title is required', req.originalUrl);
      }
      const created = await taskService.createTask({
        title: String(title).trim(),
        description: description ?? null,
      });
      return res.status(201).json(created);
    } catch (err: any) {
      console.error('POST /tasks error', err);
      return errorResponse(res, 500, 'Internal Server Error', req.originalUrl);
    }
  });

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { title, description, completed } = req.body ?? {};
      if (title !== undefined && String(title).trim() === '') {
        return errorResponse(res, 400, 'Title cannot be empty', req.originalUrl);
      }
      const updated = await taskService.updateTask(id, {
        title: title !== undefined ? String(title) : undefined,
        description: description !== undefined ? description : undefined,
        completed: completed !== undefined ? Boolean(completed) : undefined,
      });
      return res.status(200).json(updated);
    } catch (err: any) {
      if (err && /not found/i.test(String(err.message))) {
        return errorResponse(res, 404, 'Task not found', req.originalUrl);
      }
      console.error(`PUT /tasks/${req.params.id} error`, err);
      return errorResponse(res, 500, 'Internal Server Error', req.originalUrl);
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await taskService.deleteTask(id);
      return res.status(204).send();
    } catch (err: any) {
      if (err && /not found/i.test(String(err.message))) {
        return errorResponse(res, 404, 'Task not found', req.originalUrl);
      }
      console.error(`DELETE /tasks/${req.params.id} error`, err);
      return errorResponse(res, 500, 'Internal Server Error', req.originalUrl);
    }
  });

  return router;
}
