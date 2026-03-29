/**
 * Database transaction utilities
 */

import { sql } from './client.js'
import type { TransactionSql } from 'postgres'

type TransactionCallback<T> = (tx: TransactionSql<Record<string, unknown>>) => Promise<T>

/**
 * Execute a function within a database transaction
 * Automatically commits on success, rolls back on error
 */
export async function withTransaction<T>(fn: TransactionCallback<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    return (await fn(tx)) as T
  })) as T
}

/**
 * Execute multiple operations atomically
 */
export async function atomic(operations: Array<TransactionCallback<unknown>>): Promise<void> {
  await sql.begin(async (tx) => {
    for (const op of operations) {
      await op(tx)
    }
  })
}
