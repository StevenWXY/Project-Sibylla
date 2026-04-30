import { describe, it, expect } from 'vitest'
import { V2_BUDGET_WEIGHTS, V2_DEFAULT_TOKEN_BUDGET } from '../../../../../src/main/services/context-engine/types-v2'

describe('V2 Budget Weights', () => {
  it('should have weights that sum to 1.0', () => {
    const sum = Object.values(V2_BUDGET_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it('should have correct weight values', () => {
    expect(V2_BUDGET_WEIGHTS.always).toBe(0.30)
    expect(V2_BUDGET_WEIGHTS['ai-mode']).toBe(0.10)
    expect(V2_BUDGET_WEIGHTS.memory).toBe(0.15)
    expect(V2_BUDGET_WEIGHTS.skill).toBe(0.15)
    expect(V2_BUDGET_WEIGHTS['cross-source']).toBe(0.15)
    expect(V2_BUDGET_WEIGHTS.manual).toBe(0.10)
    expect(V2_BUDGET_WEIGHTS.collab).toBe(0.05)
  })

  it('should have default token budget', () => {
    expect(V2_DEFAULT_TOKEN_BUDGET).toBe(50000)
  })
})
