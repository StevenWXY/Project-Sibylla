import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AiClassifier } from '../../../../src/main/services/import/ai-classifier'
import type { AiGatewayClient, AiGatewayChatResponse } from '../../../../src/main/services/ai-gateway-client'

function createMockGatewayClient(response: Partial<AiGatewayChatResponse> = {}): AiGatewayClient {
  return {
    chat: vi.fn().mockResolvedValue({
      id: 'test-id',
      model: 'test-model',
      provider: 'mock',
      content: response.content ?? '{"category":"tech_doc","confidence":0.9,"tags":["api"]}',
      finishReason: 'stop',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 },
      intercepted: false,
      warnings: [],
      ...response,
    }),
  } as unknown as AiGatewayClient
}

describe('AiClassifier', () => {
  let classifier: AiClassifier

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('classify', () => {
    it('should classify a meeting document', async () => {
      const client = createMockGatewayClient({
        content: '{"category":"meeting","confidence":0.85,"tags":["周会","项目A"],"reason":"包含参会人和决议"}',
      })
      classifier = new AiClassifier(client)
      const result = await classifier.classify(
        '会议纪要：参会人张三、李四。决议：下周一交付。',
        '项目周会.pdf'
      )
      expect(result.category).toBe('meeting')
      expect(result.confidence).toBe(0.85)
      expect(result.tags).toContain('周会')
    })

    it('should classify a contract document', async () => {
      const client = createMockGatewayClient({
        content: '{"category":"contract","confidence":0.9,"tags":["合同","甲方"],"reason":"包含合同条款"}',
      })
      classifier = new AiClassifier(client)
      const result = await classifier.classify(
        '甲方与乙方签署合同，金额为 100 万元。',
        '服务合同.pdf'
      )
      expect(result.category).toBe('contract')
      expect(result.confidence).toBe(0.9)
    })

    it('should classify a tech document', async () => {
      const client = createMockGatewayClient({
        content: '{"category":"tech_doc","confidence":0.88,"tags":["API","架构"],"reason":"包含 API 文档"}',
      })
      classifier = new AiClassifier(client)
      const result = await classifier.classify(
        'REST API 文档。架构：微服务。',
        'api-reference.pdf'
      )
      expect(result.category).toBe('tech_doc')
      expect(result.confidence).toBe(0.88)
    })

    it('should classify an article', async () => {
      const client = createMockGatewayClient({
        content: '{"category":"article","confidence":0.75,"tags":["观点","论述"],"reason":"包含观点和引用"}',
      })
      classifier = new AiClassifier(client)
      const result = await classifier.classify(
        '本文探讨了人工智能的未来发展方向。',
        'ai-future.pdf'
      )
      expect(result.category).toBe('article')
    })

    it('should return unknown for low confidence', async () => {
      const client = createMockGatewayClient({
        content: '{"category":"meeting","confidence":0.3,"tags":[],"reason":"不确定"}',
      })
      classifier = new AiClassifier(client)
      const result = await classifier.classify('随机文本内容', 'random.pdf')
      expect(result.category).toBe('unknown')
      expect(result.targetPath).toContain('untriaged')
    })

    it('should return unknown when AI call fails', async () => {
      const client = {
        chat: vi.fn().mockRejectedValue(new Error('Network error')),
      } as unknown as AiGatewayClient
      classifier = new AiClassifier(client)
      const result = await classifier.classify('some text', 'test.pdf')
      expect(result.category).toBe('unknown')
      expect(result.confidence).toBe(0)
    })

    it('should return unknown for invalid JSON response', async () => {
      const client = createMockGatewayClient({
        content: 'This is not JSON',
      })
      classifier = new AiClassifier(client)
      const result = await classifier.classify('text', 'file.pdf')
      expect(result.category).toBe('unknown')
    })
  })

  describe('extractKeywords', () => {
    beforeEach(() => {
      const client = createMockGatewayClient()
      classifier = new AiClassifier(client)
    })

    it('should extract Chinese keywords', () => {
      const text = '人工智能 技术 发展 迅速。人工智能 改变了 世界。机器学习 是 人工智能 的重要分支。深度学习 推动了 技术进步。'
      const keywords = classifier.extractKeywords(text)
      expect(keywords.length).toBeGreaterThan(0)
    })

    it('should extract English keywords', () => {
      const keywords = classifier.extractKeywords('TypeScript is a programming language. TypeScript provides type safety. Programming languages have different paradigms. Type safety prevents runtime errors.')
      expect(keywords.length).toBeGreaterThan(0)
    })

    it('should return empty array for empty text', () => {
      const keywords = classifier.extractKeywords('')
      expect(keywords).toEqual([])
    })
  })

  describe('generateTargetPath', () => {
    beforeEach(() => {
      const client = createMockGatewayClient()
      classifier = new AiClassifier(client)
    })

    it('should generate meeting path', () => {
      const result = classifier.generateTargetPath('meeting', '项目周会')
      expect(result).toMatch(/^docs\/meetings\/\d{4}\/\d{4}-\d{2}-\d{2}-项目周会\.md$/)
    })

    it('should generate contract path', () => {
      const result = classifier.generateTargetPath('contract', '服务合同')
      expect(result).toMatch(/^docs\/contracts\/\d{4}\/服务合同\.md$/)
    })

    it('should generate tech_doc path', () => {
      const result = classifier.generateTargetPath('tech_doc', 'API Reference')
      expect(result).toBe('docs/tech/API Reference.md')
    })

    it('should generate article path', () => {
      const result = classifier.generateTargetPath('article', 'AI未来')
      expect(result).toMatch(/^docs\/reading\/\d{4}-\d{2}\/AI未来\.md$/)
    })

    it('should generate untriaged path for unknown', () => {
      const result = classifier.generateTargetPath('unknown', 'test')
      expect(result).toBe('imports/untriaged/test.md')
    })
  })
})
