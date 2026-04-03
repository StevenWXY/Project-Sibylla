import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  AiGatewayError,
  AiGatewayService,
  type GatewayChatRequest,
  type GatewayEmbeddingRequest,
} from '../services/ai-gateway.service.js'

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
})

const chatSchema = z.object({
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(8192).optional(),
  stream: z.boolean().optional(),
})

const embeddingSchema = z.object({
  input: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  model: z.string().min(1).optional(),
  dimensions: z.number().int().min(32).max(3072).optional(),
})

const summarizeSchema = z.object({
  text: z.string().min(1),
  model: z.string().min(1).optional(),
})

function handleAiError(error: unknown, reply: FastifyReply): FastifyReply {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid AI request data',
        details: error.errors,
      },
    })
  }

  if (error instanceof AiGatewayError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    })
  }

  throw error
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate)

  app.post('/chat', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = chatSchema.parse(request.body) as GatewayChatRequest
      const result = await AiGatewayService.chat(request.user.userId, body)
      return reply.send(result)
    } catch (error) {
      return handleAiError(error, reply)
    }
  })

  app.post('/embeddings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = embeddingSchema.parse(request.body) as GatewayEmbeddingRequest
      const result = await AiGatewayService.embeddings(request.user.userId, body)
      return reply.send(result)
    } catch (error) {
      return handleAiError(error, reply)
    }
  })

  app.post('/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = summarizeSchema.parse(request.body)
      const result = await AiGatewayService.summarize(request.user.userId, body.text, body.model)
      return reply.send(result)
    } catch (error) {
      return handleAiError(error, reply)
    }
  })
}
