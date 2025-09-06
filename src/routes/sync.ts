// src/routes/sync.ts
import { Router, Request, Response } from 'express';
import { Database } from '../db/database';
import SyncService from '../services/syncService';
import TaskService from '../services/taskService';
import { BatchSyncRequest } from '../types';

export function createSyncRouter(db: Database) {
  const router = Router();
  const taskService = new TaskService(db);
  const syncService = new SyncService(db, taskService);

  router.post('/sync', async (_req: Request, res: Response) => {
    try {
      const result = await syncService.triggerSync();
      return res.json(result);
    } catch (err) {
      if (err instanceof Error)
        return res.status(500).json({ error: err.message });
      return res.status(500).json({ error: 'Unknown error' });
    }
  });

  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await syncService.getStatus();
      return res.json(status);
    } catch (err) {
      if (err instanceof Error)
        return res.status(500).json({ error: err.message });
      return res.status(500).json({ error: 'Unknown error' });
    }
  });

  router.post(
    '/batch',
    async (req: Request<{}, {}, BatchSyncRequest>, res: Response) => {
      try {
        const body = req.body;
        const result = await syncService.processBatch(body);
        return res.json(result);
      } catch (err) {
        if (err instanceof Error)
          return res.status(500).json({ error: err.message });
        return res.status(500).json({ error: 'Unknown error' });
      }
    },
  );

  router.get('/health', async (_req: Request, res: Response) => {
    return res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
}
