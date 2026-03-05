/**
 * Development seed data
 * Creates test user and workspace for development
 *
 * Usage: npx tsx seeds/dev.ts
 */

import { hash } from '@node-rs/argon2'
import { sql, closeDatabaseConnection } from '../src/db/index.js'

async function seed(): Promise<void> {
  console.log('🌱 Seeding development database...')

  try {
    // Create test user
    const passwordHash = await hash('password123')

    const userResult = await sql`
      INSERT INTO users (email, password_hash, name, email_verified)
      VALUES ('dev@sibylla.io', ${passwordHash}, 'Dev User', true)
      ON CONFLICT (email) DO UPDATE SET 
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash
      RETURNING id
    `
    const userId = (userResult[0] as { id: string }).id
    console.log('✅ Created test user: dev@sibylla.io (password: password123)')

    // Create test workspace
    const workspaceResult = await sql`
      INSERT INTO workspaces (name, description, icon)
      VALUES ('Test Workspace', 'A workspace for development testing', '🧪')
      ON CONFLICT DO NOTHING
      RETURNING id
    `

    let workspaceId: string

    if (workspaceResult.length > 0) {
      workspaceId = (workspaceResult[0] as { id: string }).id
      console.log('✅ Created test workspace: Test Workspace')
    } else {
      // Get existing workspace
      const existing = await sql`
        SELECT id FROM workspaces WHERE name = 'Test Workspace' LIMIT 1
      `
      workspaceId = (existing[0] as { id: string }).id
      console.log('ℹ️  Test workspace already exists')
    }

    // Add user as admin
    await sql`
      INSERT INTO workspace_members (user_id, workspace_id, role)
      VALUES (${userId}, ${workspaceId}, 'admin')
      ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = 'admin'
    `
    console.log('✅ Added user as workspace admin')

    console.log('')
    console.log('🎉 Seeding complete!')
    console.log('')
    console.log('Test credentials:')
    console.log('  Email: dev@sibylla.io')
    console.log('  Password: password123')
  } catch (error) {
    console.error('❌ Seeding failed:', error)
    process.exitCode = 1
  } finally {
    await closeDatabaseConnection()
  }
}

seed()
