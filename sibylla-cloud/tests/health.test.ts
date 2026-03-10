/**
 * Health check endpoint tests
 * Tests the health check API endpoints
 *
 * Note: Tests run without database, so health status may be degraded
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

describe('Health Check Endpoints', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('GET /api/v1/health', () => {
    it('should return 200 with health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      })

      expect(response.statusCode).toBe(200)

      const body = JSON.parse(response.body) as Record<string, unknown>
      expect(['ok', 'degraded']).toContain(body['status'])
      expect(body).toHaveProperty('timestamp')
      expect(body).toHaveProperty('version')
      expect(body).toHaveProperty('checks')
    })

    it('should return valid ISO timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      })

      const body = JSON.parse(response.body) as { timestamp: string }
      const timestamp = new Date(body.timestamp)
      expect(timestamp.toISOString()).toBe(body.timestamp)
    })
  })

  describe('GET /api/v1/health/ready', () => {
    it('should return 200 with ready status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/ready',
      })

      expect(response.statusCode).toBe(200)

      const body = JSON.parse(response.body) as Record<string, unknown>
      expect(body).toHaveProperty('ready')
      expect(body).toHaveProperty('database')
    })
  })

  describe('GET /api/v1/health/live', () => {
    it('should return 200 with live status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/live',
      })

      expect(response.statusCode).toBe(200)

      const body = JSON.parse(response.body) as Record<string, unknown>
      expect(body).toHaveProperty('live', true)
    })
  })
})
