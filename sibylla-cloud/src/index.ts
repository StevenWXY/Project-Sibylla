/**
 * Sibylla Cloud Service
 * Entry point
 */

import { buildApp } from './app.js'
import { config } from './config/index.js'
import { logger } from './utils/logger.js'
import { closeDatabaseConnection, waitForDatabase } from './db/index.js'

async function start(): Promise<void> {
  // Wait for database to be ready
  const dbReady = await waitForDatabase(30, 1000)
  if (!dbReady) {
    logger.warn('Starting without database connection - some features may be unavailable')
  }

  const app = await buildApp()

  try {
    await app.listen({
      port: config.port,
      host: config.host,
    })
    logger.info(`Server listening on ${config.host}:${config.port}`)
  } catch (err) {
    logger.error(err, 'Failed to start server')
    process.exit(1)
  }
}

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']
signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info(`Received ${signal}, shutting down gracefully...`)
    await closeDatabaseConnection()
    process.exit(0)
  })
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(error, 'Uncaught exception')
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection')
  process.exit(1)
})

start()
