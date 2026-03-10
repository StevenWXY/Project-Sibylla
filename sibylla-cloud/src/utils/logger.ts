/**
 * Application logger
 * Uses pino for structured logging
 */

import pino from 'pino'
import { config } from '../config/index.js'

const loggerOptions: pino.LoggerOptions = {
  level: config.logLevel,
}

if (config.isDevelopment) {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  }
}

export const logger = pino.default(loggerOptions)
