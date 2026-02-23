/**
 * Reference Parser
 * Parses all bracket-notation and scope references from prompts.
 * Maps to: reference_notation.* and operational_rules.retrieval_scope
 * in primary-context.yaml.
 */

/**
 * Parse explicit context references from prompt to determine which on-demand folders are requested.
 * Returns set of context categories that were explicitly referenced.
 *
 * Pattern: [Context|{folder}|{filename}]
 * Example: [Context|Regulatory Strategy|FDA Guidelines.pdf]
 * Maps to: reference_notation.context
 */
export function parseExplicitContextReferences(prompt: string): Set<'regulatory-strategy' | 'general'> {
  const referenced = new Set<'regulatory-strategy' | 'general'>();

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
 * Parse Master Checklist reference from prompt.
 * Returns true if [Master Checklist] is explicitly referenced.
 *
 * Pattern: [Master Checklist]
 * Maps to: reference_notation.master_checklist
 */
export function parseMasterChecklistReference(prompt: string): boolean {
  return /\[Master\s+Checklist\]/gi.test(prompt);
}

/**
 * Parse procedure references from prompt.
 * Supports both the new two-part format and the legacy single-part format.
 *
 * New format:    [Procedure|sops|design_control]
 *   → { subcategoryId: 'sops', categoryId: 'design_control' }
 * Legacy format: [Procedure|Design Control Procedure]
 *   → { subcategoryId: 'sops', categoryId: undefined }  (backward compat, logs deprecation)
 *
 * Maps to: reference_notation.procedure
 */
export function parseProcedureReferences(
  prompt: string
): Array<{ subcategoryId: string; categoryId?: string }> {
  const results: Array<{ subcategoryId: string; categoryId?: string }> = [];

  const procedurePattern = /\[Procedure\|([^\]]+)\]/gi;
  let match;

  while ((match = procedurePattern.exec(prompt)) !== null) {
    const inner = match[1].trim();
    const parts = inner.split('|').map(p => p.trim());

    if (parts.length >= 2) {
      // New format: [Procedure|subcategoryId|categoryId]
      results.push({ subcategoryId: parts[0], categoryId: parts[1] });
    } else {
      // Legacy format: [Procedure|Category Name]
      console.warn(
        `[ReferenceParser] ⚠️  Deprecated [Procedure|...] notation: "${match[0]}". ` +
          'Use new format [Procedure|sops|category_id] instead.'
      );
      results.push({ subcategoryId: 'sops', categoryId: undefined });
    }
  }

  return results;
}

/**
 * Parse knowledge source scope references from prompt.
 * Extracts @{source_id} patterns (e.g., @sops, @global_standards).
 *
 * Maps to: reference_notation.knowledge_source_refs
 *
 * NOTE: Full per-scope retrieval enforcement is not yet implemented.
 * Parsing is done here for logging and future use.
 */
export function parseKnowledgeSourceScopes(prompt: string): Set<string> {
  const scopes = new Set<string>();
  const scopePattern = /@(\w[\w_]*)/g;
  let match;

  while ((match = scopePattern.exec(prompt)) !== null) {
    scopes.add(match[1]);
  }

  return scopes;
}

/**
 * Detect [Bootstrap|{name}] references in the prompt.
 * Logs a warning for each match since Google Drive bootstrap is not yet implemented.
 *
 * Maps to: reference_notation.document_bootstrap
 * NOT YET IMPLEMENTED: Google Drive chain resolution requires new infrastructure.
 */
export function parseBootstrapReferences(prompt: string): string[] {
  const bootstrapPattern = /\[Bootstrap\|([^\]]+)\]/gi;
  const names: string[] = [];
  let match;

  while ((match = bootstrapPattern.exec(prompt)) !== null) {
    const name = match[1].trim();
    names.push(name);
    console.warn(
      `[ReferenceParser] ⚠️  [Bootstrap|${name}] detected but NOT YET IMPLEMENTED. ` +
        'Google Drive bootstrap resolution requires new infrastructure. Continuing without it.'
    );
  }

  return names;
}

/**
 * Detect [Doc|{document}|{field}] references in the prompt.
 * Logs a warning for each match since field extraction from bootstrap docs is not yet implemented.
 *
 * Maps to: reference_notation.document_field
 * NOT YET IMPLEMENTED: Field extraction from bootstrap documents is not yet implemented.
 */
export function parseDocFieldReferences(
  prompt: string
): Array<{ doc: string; field: string }> {
  const docFieldPattern = /\[Doc\|([^|\]]+)\|([^\]]+)\]/gi;
  const refs: Array<{ doc: string; field: string }> = [];
  let match;

  while ((match = docFieldPattern.exec(prompt)) !== null) {
    const doc = match[1].trim();
    const field = match[2].trim();
    refs.push({ doc, field });
    console.warn(
      `[ReferenceParser] ⚠️  [Doc|${doc}|${field}] detected but NOT YET IMPLEMENTED. ` +
        'Doc field extraction from bootstrap documents is not yet implemented. Continuing without it.'
    );
  }

  return refs;
}

/**
 * Filter context results based on on-demand retrieval policy.
 * Context/General/ and Context/Regulatory Strategy/ are only included when explicitly referenced.
 * Maps to: operational_rules.retrieval_scope (context on-demand filtering)
 */
export function filterContextResults<
  T extends { entry: { metadata: { contextCategory?: string; fileName: string } } }
>(results: T[], excludeGeneral: boolean, excludeRegStrategy: boolean): T[] {
  const originalCount = results.length;

  const filtered = results.filter(result => {
    const category = result.entry.metadata.contextCategory;

    if (category === 'general' && excludeGeneral) {
      console.log(
        `[EnhancedRAG] ⏭️  Filtered out: ${result.entry.metadata.fileName} (General folder, not referenced)`
      );
      return false;
    }

    if (category === 'regulatory-strategy' && excludeRegStrategy) {
      console.log(
        `[EnhancedRAG] ⏭️  Filtered out: ${result.entry.metadata.fileName} (Regulatory Strategy folder, not referenced)`
      );
      return false;
    }

    return true;
  });

  if (originalCount !== filtered.length) {
    console.log(
      `[EnhancedRAG] 🔒 FILTERING APPLIED: ${originalCount - filtered.length} context chunks excluded due to retrieval_priority="on_demand"`
    );
  }

  return filtered;
}

/**
 * Filter procedure results based on on-demand retrieval policy.
 * quality_policies and project_quality_plans are only included when explicitly referenced.
 * Maps to: operational_rules.retrieval_scope (procedure on-demand filtering)
 */
export function filterProcedureResults<
  T extends { entry: { metadata: { procedureSubcategory?: string; fileName: string } } }
>(results: T[], excludedSubcategories: Set<string>): T[] {
  if (excludedSubcategories.size === 0) return results;

  const originalCount = results.length;

  const filtered = results.filter(result => {
    const subcategory = result.entry.metadata.procedureSubcategory;

    if (subcategory && excludedSubcategories.has(subcategory)) {
      console.log(
        `[EnhancedRAG] ⏭️  Filtered out: ${result.entry.metadata.fileName} (subcategory: ${subcategory}, not explicitly referenced)`
      );
      return false;
    }

    return true;
  });

  if (originalCount !== filtered.length) {
    console.log(
      `[EnhancedRAG] 🔒 PROCEDURE FILTERING: ${originalCount - filtered.length} chunk(s) excluded due to retrieval_priority="on_demand" (subcategories: ${Array.from(excludedSubcategories).join(', ')})`
    );
  }

  return filtered;
}
