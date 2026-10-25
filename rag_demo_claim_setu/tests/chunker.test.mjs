// rag_demo_claim_setu/tests/chunker.test.mjs
import { describe, it, expect } from 'vitest';
import { chunkPolicyText } from '../src/chunker.mjs';

describe('chunkPolicyText', () => {
  it('should split document structurally into chunks', () => {
    const raw = `
SECTION 1: ACCIDENTAL INSURANCE
1.1 Definitions
• Insured / Insured Person: The individual(s) named.

Clause 1.2 Table of Benefits
Event | Compensation
Accidental Death | 100%
Permanent Total Disability | 100%
`;
    const chunks = chunkPolicyText(raw);
    
    // Expect 2 or 3 chunks depending on bullet/size triggers, but let's check structure
    expect(chunks.length).toBeGreaterThan(0);
    
    const firstChunk = chunks[0];
    expect(firstChunk.section_title).toContain('SECTION 1: ACCIDENTAL INSURANCE');
    expect(firstChunk.clause_ref).toBe('1.1');
    expect(firstChunk.chunk_text).toContain('Definitions');
    expect(firstChunk.chunk_text).toContain('Insured / Insured Person');

    const tableChunk = chunks.find(c => c.clause_ref === '1.2');
    expect(tableChunk).toBeDefined();
    // Check if table row converted to item/value
    expect(tableChunk.chunk_text).toContain('Item: Accidental Death - Value: 100%');
  });
});
