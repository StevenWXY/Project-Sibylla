import * as path from 'path'
import { promises as fs } from 'fs'
import type { AiGatewayClient, AiGatewayChatRequest } from '../ai-gateway-client'
import type { ClassificationResult, DocumentCategory } from './types'
import { logger } from '../../utils/logger'

const LOG_PREFIX = '[AiClassifier]'

const LOW_CONFIDENCE_THRESHOLD = 0.6
const AI_TIMEOUT_MS = 10000

const ENGLISH_STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'about', 'up', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
  'him', 'his', 'she', 'her', 'they', 'them', 'their', 'what', 'which',
  'who', 'whom',
])

export class AiClassifier {
  private promptTemplate: string | null = null

  constructor(
    private readonly gatewayClient: AiGatewayClient,
    private readonly loggerRef: typeof logger = logger
  ) {}

  async classify(text: string, fileName: string): Promise<ClassificationResult> {
    try {
      const title = this.extractTitle(fileName)
      const firstParagraph = text.slice(0, 500)
      const keywords = this.extractKeywords(text)

      const template = await this.loadPromptTemplate()
      const renderedPrompt = template
        .replace('{{title}}', title)
        .replace('{{firstParagraph}}', firstParagraph)
        .replace('{{keywords}}', keywords.join(', '))

      const request: AiGatewayChatRequest = {
        model: '',
        messages: [{ role: 'user', content: renderedPrompt }],
        temperature: 0.3,
        maxTokens: 256,
      }

      const response = await Promise.race([
        this.gatewayClient.chat(request),
        this.createTimeout(AI_TIMEOUT_MS),
      ])

      const parsed = this.parseAiResponse(response.content)

      if (parsed.confidence < LOW_CONFIDENCE_THRESHOLD) {
        this.loggerRef.info(`${LOG_PREFIX} Low confidence, falling back to unknown`, {
          originalCategory: parsed.category,
          confidence: parsed.confidence,
        })
        return {
          category: 'unknown',
          targetPath: this.generateTargetPath('unknown', title),
          confidence: parsed.confidence,
          tags: parsed.tags,
        }
      }

      return {
        category: parsed.category,
        targetPath: this.generateTargetPath(parsed.category, title),
        confidence: parsed.confidence,
        tags: parsed.tags,
      }
    } catch (error) {
      this.loggerRef.warn(`${LOG_PREFIX} Classification failed, returning unknown`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        category: 'unknown',
        targetPath: this.generateTargetPath('unknown', this.extractTitle(fileName)),
        confidence: 0,
        tags: [],
      }
    }
  }

  private extractTitle(fileName: string): string {
    return fileName.replace(/\.(pdf|docx?|txt|md)$/i, '').trim()
  }

  extractKeywords(text: string): string[] {
    if (!text || text.trim().length === 0) return []

    const chineseSegments: string[] = []
    const englishSegments: string[] = []

    const parts = text.split(/([a-zA-Z][\w'-]*[a-zA-Z]|[\u4e00-\u9fff]+)/g)
    for (const part of parts) {
      if (/[\u4e00-\u9fff]/.test(part)) {
        chineseSegments.push(part)
      } else if (/^[a-zA-Z]/.test(part)) {
        englishSegments.push(part.toLowerCase())
      }
    }

    const chineseWords: string[] = []
    for (const seg of chineseSegments) {
      const tokens = seg.split(/[，。！？、；：""''（）\s]+/)
      for (const token of tokens) {
        if (token.length >= 2) {
          chineseWords.push(token)
        }
      }
    }

    const filteredEnglish = englishSegments.filter((w) => !ENGLISH_STOP_WORDS.has(w) && w.length > 2)

    const wordFreq = new Map<string, number>()
    for (const word of [...chineseWords, ...filteredEnglish]) {
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1)
    }

    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word)
  }

  generateTargetPath(category: DocumentCategory, title: string): string {
    const now = new Date()
    const yyyy = now.getFullYear().toString()
    const mm = (now.getMonth() + 1).toString().padStart(2, '0')
    const dd = now.getDate().toString().padStart(2, '0')
    const safeTitle = title.replace(/[/\\:*?"<>|]/g, '_')

    switch (category) {
      case 'meeting':
        return `docs/meetings/${yyyy}/${yyyy}-${mm}-${dd}-${safeTitle}.md`
      case 'contract':
        return `docs/contracts/${yyyy}/${safeTitle}.md`
      case 'tech_doc':
        return `docs/tech/${safeTitle}.md`
      case 'article':
        return `docs/reading/${yyyy}-${mm}/${safeTitle}.md`
      case 'unknown':
      default:
        return `imports/untriaged/${safeTitle}.md`
    }
  }

  private async loadPromptTemplate(): Promise<string> {
    if (this.promptTemplate) return this.promptTemplate

    const possiblePaths = [
      path.join(process.resourcesPath ?? '', 'prompts', 'import', 'classify.md'),
      path.join(__dirname, '..', '..', '..', 'resources', 'prompts', 'import', 'classify.md'),
      path.resolve(__dirname, '../../../../resources/prompts/import/classify.md'),
    ]

    for (const p of possiblePaths) {
      try {
        const content = await fs.readFile(p, 'utf-8')
        const bodyStart = content.indexOf('---', 3)
        this.promptTemplate = bodyStart >= 0 ? content.slice(bodyStart + 3).trim() : content.trim()
        return this.promptTemplate
      } catch {
        continue
      }
    }

    this.loggerRef.warn(`${LOG_PREFIX} Prompt template not found, using inline fallback`)
    return this.getInlinePrompt()
  }

  private getInlinePrompt(): string {
    return `请根据以下文档信息，推断其分类。

## 文档信息
- 标题：{{title}}
- 首段内容：{{firstParagraph}}
- 关键词：{{keywords}}

## 分类类别
- meeting：会议纪要
- contract：合同文档
- tech_doc：技术文档
- article：文章/博客
- unknown：无法识别

## 输出格式
请返回 JSON：
{"category": "meeting|contract|tech_doc|article|unknown", "confidence": 0.0, "tags": ["tag1"], "reason": "理由"}`
  }

  private parseAiResponse(content: string): { category: DocumentCategory; confidence: number; tags: string[] } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response')
      }
      const parsed = JSON.parse(jsonMatch[0]) as {
        category: string
        confidence: number
        tags: string[]
      }

      const validCategories: DocumentCategory[] = ['meeting', 'contract', 'tech_doc', 'article', 'unknown']
      const category = validCategories.includes(parsed.category as DocumentCategory)
        ? (parsed.category as DocumentCategory)
        : 'unknown'

      return {
        category,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      }
    } catch (error) {
      this.loggerRef.warn(`${LOG_PREFIX} Failed to parse AI response`, {
        content: content.slice(0, 200),
        error: error instanceof Error ? error.message : String(error),
      })
      return { category: 'unknown', confidence: 0, tags: [] }
    }
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`AI classification timeout after ${ms}ms`)), ms)
    )
  }
}
