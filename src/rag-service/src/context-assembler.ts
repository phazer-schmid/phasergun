/**
 * Context Assembler (Final Simplified)
 * 
 * Architecture:
 *   SECTION 1: Role + universal generation rules (apply to ALL prompts)
 *   SECTION 2: Reference materials
 * 
 * The user prompt only needs to specify: what to retrieve, what to write,
 * and any output-specific overrides. Everything else is handled here.
 */

import { SearchResult } from './vector-store';

export function assembleContext(
  primaryContext: any,
  procedureChunks: SearchResult[],
  contextChunks: SearchResult[],
  sopSummaries: Map<string, string>,
  contextSummaries: Map<string, string>,
  options: {
    includeFullPrimary?: boolean;
  } = {},
  masterChecklistContent?: string,
  complianceStandards?: Array<{ id: string; name: string; scope: string }>,
  relevantProcedureInfo?: Array<{ fileName: string; reason: string }>
): string {
  const sections: string[] = [];
  
  // =========================================================================
  // DETERMINISM: Sort all chunks and summaries for consistent ordering
  // =========================================================================
  
  const sortedProcedureChunks = [...procedureChunks].sort((a, b) => {
    const fileCmp = a.entry.metadata.fileName.localeCompare(b.entry.metadata.fileName);
    if (fileCmp !== 0) return fileCmp;
    return a.entry.metadata.chunkIndex - b.entry.metadata.chunkIndex;
  });
  
  const sortedContextChunks = [...contextChunks].sort((a, b) => {
    const fileCmp = a.entry.metadata.fileName.localeCompare(b.entry.metadata.fileName);
    if (fileCmp !== 0) return fileCmp;
    return a.entry.metadata.chunkIndex - b.entry.metadata.chunkIndex;
  });
  
  const sortedSopSummaries = new Map(
    [...sopSummaries.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  );
  const sortedContextSummaries = new Map(
    [...contextSummaries.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  );
  
  // =========================================================================
  // SECTION 1: ROLE + UNIVERSAL RULES
  // These apply to every generation. Prompts only need task-specific rules.
  // =========================================================================
  
  const role = primaryContext?.product?.name || 'PhaserGun AI';
  const purpose = primaryContext?.product?.purpose || 'Generate regulatory documents';
  
  sections.push(`You are ${role}, a regulatory documentation expert. ${purpose}.\n\n`);
  
  sections.push('GENERATION RULES (apply to all tasks):\n');
  sections.push('- Write as the document author. No AI preamble, no meta-commentary.\n');
  sections.push('- Resolve ALL bracket-notation references ([Master Record|...], [Procedure|...], [Context|...]) to their actual values from the retrieved content. For [Procedure|...] references, substitute the matching SOP number and title. Never leave any bracket notation in the output.\n');
  sections.push('- Use procedural language as closely as retrieved content allows. If exact wording is unavailable, paraphrase and flag it.\n');
  sections.push('- Do not include footnotes or citations — these are appended separately.\n');
  sections.push('- Default tone: professional, third-person, passive voice. The prompt may override this.\n');
  sections.push('- Format output as Markdown. Use ## for section headings, - for bullet lists, and | for tables.\n');
  sections.push('- Write only what the prompt requests. Respect all length and format constraints exactly.\n');
  
  // Compliance-aware generation rules
  if (complianceStandards && complianceStandards.length > 0) {
    sections.push('- All content you generate MUST comply with the regulatory standards listed in the COMPLIANCE STANDARDS section below. Use your full training knowledge of each standard. Do not generate content that contradicts any requirement of these standards.\n');
    sections.push('- When the content involves sequencing of activities (e.g., risk management, design verification/validation), ensure the ordering is correct per the applicable standards.\n');
  }
  
  sections.push('- You have access to ALL company procedures (SOPs) via their summaries below. Draw from any procedure that is relevant to the task — do not limit yourself to only explicitly referenced procedures. If a procedure governs how this type of document should be written, follow it.\n');
  sections.push('\n');
  
  sections.push('---\n\n');
  
  // =========================================================================
  // SECTION 2: REFERENCE MATERIALS
  // =========================================================================
  sections.push('=== REFERENCE MATERIALS ===\n\n');
  
  // --- Compliance Standards (authoritative, must be followed) ---
  if (complianceStandards && complianceStandards.length > 0) {
    sections.push('--- COMPLIANCE STANDARDS (MANDATORY) ---\n');
    sections.push('All generated content must comply with these standards.\n');
    sections.push('Use your full training knowledge of each standard when writing.\n\n');
    complianceStandards.forEach(std => {
      sections.push(`- ${std.name} — Scope: ${std.scope}\n`);
    });
    sections.push('\n');
  }

  // --- Smart Procedure Selection context ---
  if (relevantProcedureInfo && relevantProcedureInfo.length > 0) {
    sections.push('--- PROCEDURES IDENTIFIED AS RELEVANT ---\n');
    sections.push('These procedures were selected as relevant to your task. Their detailed sections are included below.\n\n');
    relevantProcedureInfo.forEach(p => {
      sections.push(`- ${p.fileName}: ${p.reason}\n`);
    });
    sections.push('\n');
  }
  
  if (sortedSopSummaries.size > 0) {
    sections.push('--- ALL Company Procedures (SOPs) — Summaries ---\n');
    sections.push('These are summaries of EVERY procedure in the knowledge base. Consult any that are relevant.\n\n');
    sortedSopSummaries.forEach((summary, fileName) => {
      sections.push(`\n[${fileName}]\n`);
      sections.push(summary);
      sections.push('\n');
    });
    sections.push('\n');
  }
  
  if (sortedContextSummaries.size > 0) {
    sections.push('--- Project Context Summaries ---\n');
    sortedContextSummaries.forEach((summary, fileName) => {
      sections.push(`\n[${fileName}]\n`);
      sections.push(summary);
      sections.push('\n');
    });
    sections.push('\n');
  }
  
  if (sortedProcedureChunks.length > 0) {
    sections.push('--- Detailed Procedure Sections ---\n');
    sortedProcedureChunks.forEach((result) => {
      sections.push(`\n[${result.entry.metadata.fileName} - Section ${result.entry.metadata.chunkIndex + 1}]\n`);
      sections.push(result.entry.metadata.content);
      sections.push('\n');
    });
    sections.push('\n');
  }
  
  if (sortedContextChunks.length > 0) {
    sections.push('--- Detailed Project Context ---\n');
    sortedContextChunks.forEach((result) => {
      const contextCategory = result.entry.metadata.contextCategory || 'general';
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
  
  // Include Master Checklist if provided
  if (masterChecklistContent) {
    sections.push('--- Master Checklist ---\n');
    sections.push('\n[Project-Master-Checklist.docx]\n');
    sections.push(masterChecklistContent);
    sections.push('\n');
  }
  
  sections.push('---\n\n');
  
  return sections.join('');
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function enforceTokenLimit(
  ragContext: string,
  maxTokens: number = 150000
): string {
  const estimatedTokens = estimateTokens(ragContext);
  
  if (estimatedTokens <= maxTokens) {
    return ragContext;
  }
  
  console.warn(`[EnhancedRAG] Context exceeds limit (${estimatedTokens} > ${maxTokens}), truncating...`);
  const targetChars = maxTokens * 4;
  return ragContext.substring(0, targetChars) + '\n\n[...truncated...]';
}
