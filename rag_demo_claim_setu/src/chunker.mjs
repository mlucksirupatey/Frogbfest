// rag_demo_claim_setu/src/chunker.mjs

/**
 * Perform structural chunking of policy text based on sections and clauses.
 * @param {string} text Normalized policy text
 * @returns {Array<{ chunkText: string, sectionTitle: string|null, clauseRef: string|null }>}
 */
export function chunkPolicyText(text) {
  const lines = text.split('\n');
  const chunks = [];
  
  let currentSection = null;
  let currentClauseRef = null;
  let currentChunkLines = [];
  
  // A rough estimate: 1 word ~ 1.3 tokens. 
  // We'll aim to flush around ~400-500 words if a natural boundary isn't found,
  // but ideally flush on structural markers.
  const MAX_WORDS = 450;
  
  function getWordCount(linesArr) {
    return linesArr.join(' ').split(/\s+/).length;
  }
  
  function flushChunk() {
    if (currentChunkLines.length === 0) return;
    
    // Convert table structures in this chunk if they exist (e.g. key | value)
    const processedLines = currentChunkLines.map(line => {
      if (line.includes(' | ')) {
        const parts = line.split(' | ').map(p => p.trim());
        return `Item: ${parts[0]} - Value: ${parts[1]}`;
      }
      return line;
    });

    const chunkText = processedLines.join('\n').trim();
    if (chunkText.length > 0) {
      chunks.push({
        chunkText,
        sectionTitle: currentSection,
        clauseRef: currentClauseRef,
      });
    }
    
    currentChunkLines = [];
  }

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Detect section headers (e.g. "SECTION 1:", "SECTION 1 -")
    const sectionMatch = trimmedLine.match(/^SECTION\s+\d+[:\-]?\s*(.*)/i);
    if (sectionMatch) {
      flushChunk();
      currentSection = trimmedLine;
      currentClauseRef = null;
      currentChunkLines.push(trimmedLine);
      continue;
    }

    // Detect clause headers (e.g. "1.2 Table of", "Clause 4.2:")
    const clauseMatch = trimmedLine.match(/^(\d+\.\d+)\s*(.*)/) || trimmedLine.match(/^Clause\s+(\d+\.\d+)[:\-]?\s*(.*)/i);
    if (clauseMatch) {
      if (currentChunkLines.length > 0 && !(currentChunkLines.length === 1 && currentChunkLines[0] === currentSection)) {
        flushChunk();
      }
      currentClauseRef = clauseMatch[1];
      currentChunkLines.push(trimmedLine);
      continue;
    }

    // Detect definitions or bold items (e.g. "• Permanent Total Disability (PTD):")
    const bulletMatch = trimmedLine.match(/^[•\-\*]\s+(.+?):/);
    if (bulletMatch && getWordCount(currentChunkLines) > 100) {
      // If the chunk is getting somewhat long, we can flush at a new bullet point
      flushChunk();
      currentChunkLines.push(trimmedLine);
      continue;
    }

    // Otherwise, append line
    currentChunkLines.push(trimmedLine);

    // If chunk gets too large, flush it to prevent massive chunks
    if (getWordCount(currentChunkLines) > MAX_WORDS) {
      flushChunk();
    }
  }

  flushChunk();

  // Decorate chunks with hierarchy context for embedding
  return chunks.map((c, index) => {
    let contextHeader = `Document: ClaimSetu MVP Policy\n`;
    if (c.sectionTitle) contextHeader += `Section: ${c.sectionTitle}\n`;
    if (c.clauseRef) contextHeader += `Clause: ${c.clauseRef}\n`;
    
    return {
      chunk_index: index + 1,
      chunk_text: `${contextHeader}\n${c.chunkText}`,
      section_title: c.sectionTitle,
      subsection_title: null, // Left null for MVP simplicity unless deeply parsed
      clause_ref: c.clauseRef,
      page_start: null, // Hard to map precisely after normalization without complex offsets
      page_end: null
    };
  });
}

export default { chunkPolicyText };
