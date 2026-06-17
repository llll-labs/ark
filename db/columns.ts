import { sql } from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Shared column helpers for core (`ark.*`) and app (`public.*`) schemas.
 *
 * `uuidPk` uses the `uuidv7()` DB default owned by the initial core migration so
 * PGlite and Postgres share the same primary-key default everywhere.
 */
export function uuidPk() {
  return uuid('id').primaryKey().default(sql`uuidv7()`)
}

/** Standard audit timestamps including soft-delete (`deleted_at`). */
export function timestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  }
}

/** Audit timestamps without soft-delete, for tables that are never soft-deleted. */
export function timestampsNoSoftDelete() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }
}
