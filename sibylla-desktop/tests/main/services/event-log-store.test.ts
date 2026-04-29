import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { EventLogStore } from '../../../src/main/services/event-log-store'
import type { SibyllaEvent } from '../../../src/main/services/event-bus-types'

function createEvent(overrides: Partial<SibyllaEvent> = {}): SibyllaEvent {
  const d = new Date()
  return {
    id: '01TEST-ID',
    type: 'trace.span-ended',
    source: 'test',
    timestamp: d.getTime(),
    payload: { data: 'test' },
    ...overrides,
  }
}

describe('EventLogStore', () => {
  let tmpDir: string
  let store: EventLogStore

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-test-'))
    store = new EventLogStore(tmpDir)
    await store.initialize()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should append events as JSONL lines', async () => {
    const event = createEvent()
    store.append(event)
    await store.flush()

    const month = `${new Date(event.timestamp).getFullYear()}-${String(new Date(event.timestamp).getMonth() + 1).padStart(2, '0')}`
    const content = await fs.readFile(path.join(tmpDir, `${month}.jsonl`), 'utf-8')

    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toEqual(event)
  })

  it('should write to different monthly files', async () => {
    const janEvent = createEvent({ timestamp: new Date('2026-01-15').getTime() })
    const febEvent = createEvent({ timestamp: new Date('2026-02-15').getTime() })

    store.append(janEvent)
    store.append(febEvent)
    await store.flush()

    const files = await fs.readdir(tmpDir)
    expect(files).toContain('2026-01.jsonl')
    expect(files).toContain('2026-02.jsonl')
  })

  it('should read events by month', async () => {
    const event1 = createEvent({ id: 'ev-1', timestamp: new Date('2026-03-10').getTime() })
    const event2 = createEvent({ id: 'ev-2', timestamp: new Date('2026-03-20').getTime() })

    store.append(event1)
    store.append(event2)
    await store.flush()

    const events = await store.read('2026-03')
    expect(events).toHaveLength(2)
    expect(events[0].id).toBe('ev-1')
    expect(events[1].id).toBe('ev-2')
  })

  it('should skip invalid lines when reading', async () => {
    const filePath = path.join(tmpDir, '2026-04.jsonl')
    await fs.appendFile(filePath, '\n')
    await fs.appendFile(filePath, 'not-json\n')
    await fs.appendFile(filePath, '{"id":"valid","type":"trace.span-ended","source":"t","timestamp":1,"payload":null}\n')

    const events = await store.read('2026-04')
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('valid')
  })

  it('should return empty array for non-existent month', async () => {
    const events = await store.read('2099-12')
    expect(events).toEqual([])
  })

  it('should cleanup files older than specified months', async () => {
    store.append(createEvent({ timestamp: new Date('2025-01-15').getTime() }))
    store.append(createEvent({ timestamp: new Date('2025-06-15').getTime() }))
    await store.flush()

    const deleted = await store.cleanup(6)
    expect(deleted).toBeGreaterThanOrEqual(0)
  })

  it('should create directory on initialize()', async () => {
    const newDir = path.join(tmpDir, 'sub', 'events')
    const newStore = new EventLogStore(newDir)
    await newStore.initialize()

    const stat = await fs.stat(newDir)
    expect(stat.isDirectory()).toBe(true)
  })
})
