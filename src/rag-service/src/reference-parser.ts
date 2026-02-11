/**
 * Reference Parser
 * Parses explicit context references from prompts to determine which on-demand folders are requested
 */

/**
 * Parse explicit context references from prompt to determine which on-demand folders are requested
 * Returns set of context categories that were explicitly referenced
 * 
 * Pattern: [Context|{folder}|{filename}]
 * Example: [Context|Regulatory Strategy|FDA Guidelines.pdf]
 */
export function parseExplicitContextReferences(prompt: string): Set<'regulatory-strategy' | 'general'> {
  const referenced = new Set<'regulatory-strategy' | 'general'>();
  
  // Pattern: [Context|{folder}|{filename}]
  const contextPattern = /\[Context\|([^|\]]+)\|[^\]]+\]/gi;
  let match;
  
  while ((match = contextPattern.exec(prompt)) !== null) {
    const folder = match[1].trim().toLowerCase();
    
    if (folder === 'regulatory strategy' || folder === 'regulatory-strategy') {
      referenced.add('regulatory-strategy');
    } else if (folder === 'general') {
      referenced.add('general');
    }
  }
  
  return referenced;
}

/**
 * Parse Master Checklist reference from prompt
 * Returns true if [Master Checklist] is explicitly referenced
 * 
 * Pattern: [Master Checklist]
 * Example: [Master Checklist]
 */
export function parseMasterChecklistReference(prompt: string): boolean {
  // Pattern: [Master Checklist] (case-insensitive)
  const checklistPattern = /\[Master\s+Checklist\]/gi;
  return checklistPattern.test(prompt);
}

/**
 * Log retrieval policy enforcement decisions
 */
export function logRetrievalPolicy(
  excludeGeneral: boolean,
  excludeRegStrategy: boolean
): void {
  console.log('[EnhancedRAG] 🔒 RETRIEVAL POLICY ENFORCEMENT:');
  if (excludeGeneral) {
    console.log('[EnhancedRAG]    ⛔ Context/General/ EXCLUDED (not explicitly referenced in prompt)');
  } else {
    console.log('[EnhancedRAG]    ✅ Context/General/ INCLUDED (explicitly referenced in prompt)');
  }
  if (excludeRegStrategy) {
    console.log('[EnhancedRAG]    ⛔ Context/Regulatory Strategy/ EXCLUDED (not explicitly referenced in prompt)');
  } else {
    console.log('[EnhancedRAG]    ✅ Context/Regulatory Strategy/ INCLUDED (explicitly referenced in prompt)');
  }
}

/**
 * Filter context results based on retrieval policy
 */
export function filterContextResults<T extends { entry: { metadata: { contextCategory?: string; fileName: string } } }>(
  results: T[],
  excludeGeneral: boolean,
  excludeRegStrategy: boolean
): T[] {
  const originalCount = results.length;
  
  const filtered = results.filter(result => {
    const category = result.entry.metadata.contextCategory;
    
    if (category === 'general' && excludeGeneral) {
      console.log(`[EnhancedRAG] ⏭️  Filtered out: ${result.entry.metadata.fileName} (General folder, not referenced)`);
      return false;
    }
    
    if (category === 'regulatory-strategy' && excludeRegStrategy) {
      console.log(`[EnhancedRAG] ⏭️  Filtered out: ${result.entry.metadata.fileName} (Regulatory Strategy folder, not referenced)`);
      return false;
    }
    
    return true;
  });
  
  if (originalCount !== filtered.length) {
    console.log(`[EnhancedRAG] 🔒 FILTERING APPLIED: ${originalCount - filtered.length} context chunks excluded due to retrieval_priority="on_demand"`);
  }
  
  return filtered;
}
