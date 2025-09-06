// src/routes/sync.ts
import { Router, Request, Response } from 'express';
import { Database } from '../db/database';
import TaskService from '../services/taskService';
import SyncService from '../services/syncService';

export function createSyncRouter(db: Database) {
  const router = Router();
  const taskService = new TaskService(db);
  const syncService = new SyncService(db, taskService);

  function errorResponse(res: Response, status: number, message: string, path: string) {
    return res.status(status).json({
      error: message,
      timestamp: new Date().toISOString(),
      path,
    });
  }

  router.post('/sync', async (_req: Request, res: Response) => {
    try {
      const result = await syncService.triggerSync();
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('POST /api/sync error', err);
      return errorResponse(res, 500, 'Sync failed', '/api/sync');
    }
  });

  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await syncService.getStatus();
      return res.status(200).json(status);
    } catch (err: any) {
      console.error('GET /api/status error', err);
      return errorResponse(res, 500, 'Could not get status', '/api/status');
    }
  });

  router.post('/batch', async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const result = await syncService.processBatch(body);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('POST /api/batch error', err);
      return errorResponse(res, 500, 'Batch processing failed', '/api/batch');
    }
  });

  router.get('/health', (_req: Request, res: Response) => {
    return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
}
