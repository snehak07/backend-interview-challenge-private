// src/types/index.ts

// ---------- Task (application-level) ----------
/**
 * Application-level Task type used across services/routes.
 * `completed` and `is_deleted` are booleans at the service/api level
 * (database stores integers 0/1, services should convert).
 */
export interface Task {
  id: string;
  title: string;
  description?: string | null;
  completed: boolean;
  created_at?: string; // ISO timestamp
  updated_at?: string; // ISO timestamp
  is_deleted?: boolean;
  sync_status?: 'pending' | 'synced' | 'error' | string;
  server_id?: string | null;
  last_synced_at?: string | null; // ISO timestamp or null
}

// ---------- Sync queue DB row ----------
/**
 * Row shape from the sync_queue DB table.
 * `data` is stored as JSON text in DB but sometimes returned parsed by code.
 */
export interface SyncQueueItem {
  id: string;
  task_id: string;
  operation: 'create' | 'update' | 'delete' | string;
  data: string | Record<string, unknown>; // JSON string in DB or parsed object
  created_at?: string;
  retry_count?: number;
  error_message?: string | null;
}

// ---------- Batch API types (client -> server) ----------
export interface BatchItem {
  id?: string; // queue id or client id
  client_id?: string; // alias for client id
  task_id?: string;
  operation: 'create' | 'update' | 'delete' | string;
  data?: Partial<Task> | Record<string, unknown>;
  created_at?: string;
  retry_count?: number;
}

export interface BatchSyncRequest {
  items: BatchItem[];
  client_timestamp?: string;
}

// ---------- Batch API processed/response types (server -> client) ----------
export interface ProcessedItem {
  client_id?: string | null;
  server_id?: string | null;
  status: 'success' | 'error' | string;
  error?: string | null;
  resolved_data?: Partial<Task> | null;
}

/**
 * Server response for batch endpoint
 */
export interface BatchSyncResponse {
  processed_items: ProcessedItem[];
}

// ---------- Sync run result (local service) ----------
export interface SyncErrorEntry {
  task_id: string | null;
  operation: string;
  error: string;
  timestamp: string; // ISO
}

export interface SyncResult {
  success: boolean;
  synced_items: number;
  failed_items: number;
  errors: SyncErrorEntry[];
}

// ---------- Sync status endpoint shape ----------
export interface SyncStatus {
  pending_sync_count: number;
  last_sync_timestamp: string | null;
  is_online: boolean;
  sync_queue_size: number;
}
