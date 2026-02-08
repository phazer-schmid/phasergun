/**
 * Context Assembler
 * Assembles RAG context in tiered structure with clear behavioral instructions
 */

import { SearchResult } from './vector-store';

/**
 * Assemble context in tiered structure with clear behavioral instructions
 * 
 * THREE-TIER ARCHITECTURE:
 * TIER 1: Role & Behavioral Instructions (WHO you are, HOW to behave)
 * TIER 2: Reference Materials (WHAT you know - for informing your writing)
 * TIER 3: User Task (reserved for orchestrator to append)
 * 
 * DETERMINISM: All chunks and summaries are sorted alphabetically to ensure
 * consistent output across cache rebuilds
 */
export function assembleContext(
  primaryContext: any,
  procedureChunks: SearchResult[],
  contextChunks: SearchResult[],
  sopSummaries: Map<string, string>,
  contextSummaries: Map<string, string>,
  options: {
    includeFullPrimary?: boolean;
  } = {}
): string {
  const sections: string[] = [];
  
  // =========================================================================
  // DETERMINISM: Sort all chunks and summaries for consistent ordering
  // =========================================================================
  
  // Sort procedure chunks by fileName, then chunkIndex
  const sortedProcedureChunks = [...procedureChunks].sort((a, b) => {
    const fileCmp = a.entry.metadata.fileName.localeCompare(b.entry.metadata.fileName);
    if (fileCmp !== 0) return fileCmp;
    return a.entry.metadata.chunkIndex - b.entry.metadata.chunkIndex;
  });
  
  // Sort context chunks by fileName, then chunkIndex
  const sortedContextChunks = [...contextChunks].sort((a, b) => {
    const fileCmp = a.entry.metadata.fileName.localeCompare(b.entry.metadata.fileName);
    if (fileCmp !== 0) return fileCmp;
    return a.entry.metadata.chunkIndex - b.entry.metadata.chunkIndex;
  });
  
  // Sort summaries alphabetically by file name
  const sortedSopSummaries = new Map(
    [...sopSummaries.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  );
  const sortedContextSummaries = new Map(
    [...contextSummaries.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  );
  
  // =========================================================================
  // TIER 1: ROLE & BEHAVIORAL INSTRUCTIONS
  // =========================================================================
  sections.push('=== YOUR ROLE AND CRITICAL INSTRUCTIONS ===\n\n');
  
  // Extract key behavioral information from primary context
  const role = primaryContext?.product?.name || 'PhaserGun AI';
  const purpose = primaryContext?.product?.purpose || 'Generate regulatory documents';
  
  sections.push(`You are ${role}, an AI regulatory documentation expert.\n\n`);
  sections.push(`PRIMARY FUNCTION: ${purpose}\n\n`);
  
  sections.push('CRITICAL BEHAVIORAL RULES:\n');
  sections.push('1. Write DIRECTLY in response to the user\'s task (provided at the end)\n');
  sections.push('2. Do NOT analyze or summarize the reference materials below\n');
  sections.push('3. Do NOT provide meta-commentary like "Based on the provided documents..."\n');
  sections.push('4. Do NOT start with "Here is..." or "The following is..."\n');
  sections.push('5. Follow the EXACT format, tone, length, and style specified in the user\'s request\n');
  sections.push('6. Use reference materials to inform your writing, but write as if you are the author\n');
  sections.push('7. If the user specifies word count or paragraph limits, strictly adhere to them\n');
  sections.push('8. Use precise, professional language appropriate for regulatory documentation\n\n');
  
  sections.push('SCOPE ENFORCEMENT (ABSOLUTE REQUIREMENTS):\n');
  sections.push('1. Write ONLY what is explicitly requested - if asked for "Purpose section" write ONLY Purpose\n');
  sections.push('2. Do NOT expand scope by adding related sections, background, or full document structure\n');
  sections.push('3. Do NOT generate additional sections beyond what is requested\n');
  sections.push('4. STOP IMMEDIATELY after completing the requested section\n');
  sections.push('5. Treat length constraints (e.g., "2 paragraphs") as HARD LIMITS, not suggestions\n');
  sections.push('6. If request says "section X only" → generate ONLY section X, then STOP\n\n');
  
  sections.push('VIOLATION EXAMPLES (What NOT to do):\n');
  sections.push('❌ Task: "Write Purpose section" → You generate entire document with multiple sections\n');
  sections.push('❌ Task: "Two paragraphs maximum" → You write 15 sections\n');
  sections.push('❌ Task: "Purpose only" → You add Background, Scope, Introduction, etc.\n');
  sections.push('✅ CORRECT: Task: "Write Purpose section, 2 paragraphs" → You write exactly 2 paragraphs for Purpose, then STOP\n\n');
  
  // Include regulatory framework
  if (primaryContext?.regulatory_framework?.standards) {
    sections.push('REGULATORY STANDARDS YOU FOLLOW:\n');
    primaryContext.regulatory_framework.standards.forEach((std: any) => {
      sections.push(`- ${std.name}: ${std.description}\n`);
    });
    sections.push('\n');
  }
  
  // Include design controls foundation if present
  if (primaryContext?.design_controls) {
    sections.push('DESIGN CONTROLS FRAMEWORK:\n');
    const dc = primaryContext.design_controls;
    sections.push(`- User Needs: ${dc.user_needs}\n`);
    sections.push(`- Design Inputs: ${dc.design_inputs}\n`);
    sections.push(`- Design Outputs: ${dc.design_outputs}\n`);
    sections.push(`- Verification: ${dc.verification}\n`);
    sections.push(`- Validation: ${dc.validation}\n\n`);
  }
  
  sections.push('---\n\n');
  
  // =========================================================================
  // TIER 2: REFERENCE MATERIALS (for informing your writing)
  // =========================================================================
  sections.push('=== REFERENCE MATERIALS ===\n');
  sections.push('Below are materials provided for your reference. Use them to inform your writing,\n');
  sections.push('but remember: your task is to WRITE what the user requests, not to analyze these materials.\n\n');
  
  // SOP Executive Summaries (sorted alphabetically)
  if (sortedSopSummaries.size > 0) {
    sections.push('--- Company Procedures (SOPs) ---\n');
    sortedSopSummaries.forEach((summary, fileName) => {
      sections.push(`\n[${fileName}]\n`);
      sections.push(summary);
      sections.push('\n');
    });
    sections.push('\n');
  }
  
  // Context File Executive Summaries (sorted alphabetically)
  if (sortedContextSummaries.size > 0) {
    sections.push('--- Project Context Summaries ---\n');
    sortedContextSummaries.forEach((summary, fileName) => {
      sections.push(`\n[${fileName}]\n`);
      sections.push(summary);
      sections.push('\n');
    });
    sections.push('\n');
  }
  
  // Retrieved Procedure Chunks (sorted by fileName, then chunk index)
  if (sortedProcedureChunks.length > 0) {
    sections.push('--- Detailed Procedure Sections (Retrieved for Relevance) ---\n');
    sortedProcedureChunks.forEach((result, idx) => {
      const similarity = (result.similarity * 100).toFixed(1);
      sections.push(`\n[${result.entry.metadata.fileName} - Section ${result.entry.metadata.chunkIndex + 1}]\n`);
      sections.push(result.entry.metadata.content);
      sections.push('\n');
    });
    sections.push('\n');
  }
  
  // Retrieved Context Chunks (sorted by fileName, then chunk index)
  if (sortedContextChunks.length > 0) {
    sections.push('--- Detailed Project Context (Retrieved for Relevance) ---\n');
    sortedContextChunks.forEach((result, idx) => {
      const similarity = (result.similarity * 100).toFixed(1);
      const contextCategory = result.entry.metadata.contextCategory;
      let categoryLabel = '';
      
      if (contextCategory === 'primary-context-root') {
        categoryLabel = 'Primary Context File';
      } else if (contextCategory === 'initiation') {
        categoryLabel = 'Initiation';
      } else if (contextCategory === 'ongoing') {
        categoryLabel = 'Ongoing';
      } else if (contextCategory === 'predicates') {
        categoryLabel = 'Predicate Device';
      } else if (contextCategory === 'regulatory-strategy') {
        categoryLabel = 'Regulatory Strategy';
      } else if (contextCategory === 'general') {
        categoryLabel = 'General Reference';
      }
      
      sections.push(`\n[${categoryLabel}: ${result.entry.metadata.fileName}]\n`);
      sections.push(result.entry.metadata.content);
      sections.push('\n');
    });
  }
  
  sections.push('---\n\n');
  
  // Note: TIER 3 (User Task) will be appended by the orchestrator
  
  return sections.join('');
}

/**
 * Estimate token count (rough approximation)
 * 1 token ≈ 4 characters
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Ensure context fits within token limits
 */
export function enforceTokenLimit(
  ragContext: string,
  maxTokens: number = 150000  // Leave room for prompt + response
): string {
  const estimatedTokens = estimateTokens(ragContext);
  
  if (estimatedTokens <= maxTokens) {
    return ragContext;
  }
  
  console.warn(`[EnhancedRAG] Context exceeds limit (${estimatedTokens} > ${maxTokens}), truncating...`);
  
  // Truncate from the bottom (keep primary context + top results)
  // This is a simple implementation; can be enhanced later
  const targetChars = maxTokens * 4;
  return ragContext.substring(0, targetChars) + '\n\n[...truncated...]';
}
