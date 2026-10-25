// rag_demo_claim_setu/tests/query_planner.test.mjs
import { describe, it, expect } from 'vitest';
import { buildQueries } from '../src/query_planner.mjs';

describe('buildQueries', () => {
  it('should generate waiting period queries', () => {
    const queries = buildQueries({ code: 'WAITING_PERIOD', item: 'Cataract' });
    expect(queries).toHaveLength(2);
    expect(queries[0]).toBe('waiting period for Cataract');
    expect(queries[1]).toBe('waiting period for pre-existing conditions relevant to Cataract');
  });

  it('should generate fallback query for unknown code', () => {
    const queries = buildQueries({ code: 'UNKNOWN_CODE', item: 'XYZ', claimFact: 'Fact1' });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('Explain the policy');
    expect(queries[0]).toContain('XYZ');
    expect(queries[0]).toContain('Fact1');
  });
});
