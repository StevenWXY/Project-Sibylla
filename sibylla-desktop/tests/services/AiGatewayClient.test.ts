import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AiGatewayClient } from '../../src/main/services/ai-gateway-client'

describe('AiGatewayClient.chatStream', () => {
  let client: AiGatewayClient

  beforeEach(() => {
    client = new AiGatewayClient('http://localhost:3000')
  })

  async function createMockStream(chunks: string[]): Promise<ReadableStream<Uint8Array>> {
    const encoder = new TextEncoder()
    const sseChunks = chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
    sseChunks.push('data: [DONE]\n\n')
    const encoded = encoder.encode(sseChunks.join(''))
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoded)
        controller.close()
      },
    })
  }

  it('should yield content chunks from SSE stream', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: await createMockStream(['Hello', ' World', '!']),
    })
    vi.stubGlobal('fetch', mockFetch)

    const chunks: string[] = []
    for await (const chunk of client.chatStream({ model: 'test', messages: [] })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Hello', ' World', '!'])
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/ai/chat',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"stream":true'),
      })
    )
  })

  it('should throw on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }))

    const generator = client.chatStream({ model: 'test', messages: [] })
    await expect(generator.next()).rejects.toThrow('AI gateway stream request failed: 500')
  })

  it('should throw when response body is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    }))

    const generator = client.chatStream({ model: 'test', messages: [] })
    await expect(generator.next()).rejects.toThrow('AI gateway stream response body is null')
  })

  it('should handle split SSE lines across reads', async () => {
    const encoder = new TextEncoder()
    const chunk1 = 'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }) + '\nda'
    const chunk2 = 'ta: ' + JSON.stringify({ choices: [{ delta: { content: 'lo' } }] }) + '\n\ndata: [DONE]\n\n'

    let readIndex = 0
    const reads = [encoder.encode(chunk1), encoder.encode(chunk2)]

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(reads[0])
        controller.enqueue(reads[1])
        controller.close()
      },
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    }))

    const chunks: string[] = []
    for await (const chunk of client.chatStream({ model: 'test', messages: [] })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Hel', 'lo'])
  })

  it('should yield raw text when JSON parsing fails', async () => {
    const encoder = new TextEncoder()
    const sseData = 'data: raw text chunk\n\ndata: [DONE]\n\n'
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseData))
        controller.close()
      },
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    }))

    const chunks: string[] = []
    for await (const chunk of client.chatStream({ model: 'test', messages: [] })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['raw text chunk'])
  })

  it('should pass access token in headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        },
      }),
    }))

    const generator = client.chatStream(
      { model: 'test', messages: [] },
      'test-token-123'
    )
    await generator.next()

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      })
    )
  })

  it('should pass AbortSignal to fetch', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        },
      }),
    }))

    const generator = client.chatStream(
      { model: 'test', messages: [] },
      undefined,
      controller.signal
    )
    await generator.next()

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: controller.signal,
      })
    )
  })

  it('should skip non-data lines', async () => {
    const encoder = new TextEncoder()
    const sseData = ': comment\n\nevent: message\n\ndata: ' + JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }) + '\n\ndata: [DONE]\n\n'
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseData))
        controller.close()
      },
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    }))

    const chunks: string[] = []
    for await (const chunk of client.chatStream({ model: 'test', messages: [] })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['ok'])
  })
})
