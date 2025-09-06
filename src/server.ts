// src/server.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Database } from './db/database';
import { createTaskRouter } from './routes/tasks';
import { createSyncRouter } from './routes/sync';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

// initialize DB
const db = new Database(process.env.DATABASE_URL || './data/tasks.sqlite3');
//
// routes (pass db)
app.use('/api/tasks', createTaskRouter(db));
app.use('/api', createSyncRouter(db));

// error handler
app.use(errorHandler);

async function start() {
  try {
    await db.initialize();
    console.log('Database initialized');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
