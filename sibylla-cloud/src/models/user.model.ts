/**
 * User model
 * Database operations for users table
 */

import { sql } from '../db/client.js'
import type { User, CreateUserInput } from '../types/database.js'

/**
 * Map database row to User type
 */
function mapToUser(row: Record<string, unknown>): User {
  return {
    id: row['id'] as string,
    email: row['email'] as string,
    passwordHash: row['password_hash'] as string,
    name: row['name'] as string,
    avatarUrl: row['avatar_url'] as string | null,
    emailVerified: row['email_verified'] as boolean,
    lastLoginAt: row['last_login_at'] ? new Date(row['last_login_at'] as string) : null,
    createdAt: new Date(row['created_at'] as string),
    updatedAt: new Date(row['updated_at'] as string),
  }
}

export const UserModel = {
  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const result = await sql`
      SELECT id, email, password_hash, name, avatar_url,
             email_verified, last_login_at, created_at, updated_at
      FROM users
      WHERE id = ${id}
    `
    return result[0] ? mapToUser(result[0] as Record<string, unknown>) : null
  },

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await sql`
      SELECT id, email, password_hash, name, avatar_url,
             email_verified, last_login_at, created_at, updated_at
      FROM users
      WHERE email = ${email.toLowerCase()}
    `
    return result[0] ? mapToUser(result[0] as Record<string, unknown>) : null
  },

  /**
   * Create a new user
   */
  async create(input: CreateUserInput): Promise<User> {
    const result = await sql`
      INSERT INTO users (email, password_hash, name, avatar_url)
      VALUES (${input.email.toLowerCase()}, ${input.passwordHash},
              ${input.name}, ${input.avatarUrl || null})
      RETURNING id, email, password_hash, name, avatar_url,
                email_verified, last_login_at, created_at, updated_at
    `
    return mapToUser(result[0] as Record<string, unknown>)
  },

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    await sql`
      UPDATE users
      SET last_login_at = NOW()
      WHERE id = ${id}
    `
  },

  /**
   * Delete user
   */
  async delete(id: string): Promise<boolean> {
    const result = await sql`
      DELETE FROM users
      WHERE id = ${id}
      RETURNING id
    `
    return result.length > 0
  },
}
