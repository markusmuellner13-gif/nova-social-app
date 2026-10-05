import { describe, it, expect } from 'vitest';
import { claudeCostUsd, dailyBudgetUsd, DEFAULT_DAILY_BUDGET_USD } from './aiBudget';

describe('claudeCostUsd (Claude Haiku 4.5 list prices)', () => {
  it('prices input and output tokens', () => {
    // 1M in at $1 + 1M out at $5
    expect(claudeCostUsd({ input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(6, 6);
  });

  it('adds $0.01 per web search', () => {
    expect(claudeCostUsd({ server_tool_use: { web_search_requests: 4 } })).toBeCloseTo(0.04, 6);
  });

  it('prices a typical web-search hunt around ten cents', () => {
    const cost = claudeCostUsd({ input_tokens: 45_000, output_tokens: 4_000, server_tool_use: { web_search_requests: 4 } });
    expect(cost).toBeGreaterThan(0.08);
    expect(cost).toBeLessThan(0.12);
  });

  it('counts cache reads at a tenth of the input price', () => {
    expect(claudeCostUsd({ cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.1, 6);
  });

  it('is zero for a missing or malformed usage block', () => {
    expect(claudeCostUsd(undefined)).toBe(0);
    expect(claudeCostUsd({ input_tokens: -5, output_tokens: Number.NaN })).toBe(0);
  });
});

describe('dailyBudgetUsd', () => {
  it('defaults when unset or mistyped, so spend is never unbounded by accident', () => {
    expect(dailyBudgetUsd(undefined)).toBe(DEFAULT_DAILY_BUDGET_USD);
    expect(dailyBudgetUsd('')).toBe(DEFAULT_DAILY_BUDGET_USD);
    expect(dailyBudgetUsd('lots')).toBe(DEFAULT_DAILY_BUDGET_USD);
    expect(dailyBudgetUsd('-1')).toBe(DEFAULT_DAILY_BUDGET_USD);
  });

  it('accepts dollars and cents, and 0 as "no cap"', () => {
    expect(dailyBudgetUsd('1.25')).toBe(1.25);
    expect(dailyBudgetUsd('0')).toBe(0);
  });
});
