import type Database from 'better-sqlite3'
import type { ExtractionPostProcessor, ExtractionReport, ExtractionInput, ExtractionCandidate } from '../memory/types'
import { logger } from '../../utils/logger'

interface DismissAggregateRow {
  notification_type: string
  source_provider: string | null
  total: number
  dismissed: number
}

export class NotificationPreferenceExtractor implements ExtractionPostProcessor {
  constructor(
    private readonly db: Database.Database,
  ) {}

  process(_report: ExtractionReport, _context: ExtractionInput): ExtractionCandidate[] {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

    const rows = this.db.prepare(`
      SELECT
        notification_type,
        source_provider,
        COUNT(*) as total,
        SUM(CASE WHEN action = 'dismiss' THEN 1 ELSE 0 END) as dismissed
      FROM notification_actions
      WHERE created_at > ?
      GROUP BY notification_type, source_provider
      HAVING total > 5
    `).all(sevenDaysAgo) as DismissAggregateRow[]

    const candidates: ExtractionCandidate[] = []

    for (const row of rows) {
      const dismissalRate = row.dismissed / row.total

      if (dismissalRate > 0.8 && row.total > 5) {
        const sourceLabel = row.source_provider ?? 'all'
        const confidence = Math.min(dismissalRate, 0.95)

        candidates.push({
          section: 'user_preference',
          content: `User is not interested in ${row.notification_type} notifications (source: ${sourceLabel}), 7-day dismissal rate ${(dismissalRate * 100).toFixed(0)}% (sample size ${row.total})`,
          confidence,
          reasoning: `Automated detection: ${row.dismissed}/${row.total} dismissals in 7 days`,
          sourceLogIds: [],
          metadata: {
            type: row.notification_type,
            sourceProvider: row.source_provider,
            dismissalRate,
            sampleSize: row.total,
          },
        })
      }
    }

    logger.info('notification-preference-extractor.candidates', { count: candidates.length })
    return candidates
  }
}
