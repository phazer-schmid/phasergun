/**
 * Prompt Builder
 * Single source of truth for every string injected into the LLM prompt.
 *
 * Each rule constant has a JSDoc comment citing the primary-context.yaml path
 * that mandates it. This prevents behavioral instructions from being scattered
 * across multiple files (previously split between context-assembler.ts and
 * orchestrator/src/index.ts).
 */

/**
 * Write as the document author — no AI preamble or meta-commentary.
 * Maps to: operational_rules.source_tracking
 */
export const RULE_WRITE_AS_AUTHOR =
  '- Write as the document author. No AI preamble, no meta-commentary.\n';

/**
 * Resolve ALL bracket-notation references to their actual values from retrieved content.
 * Maps to: reference_notation.*
 */
export const RULE_RESOLVE_BRACKET_NOTATION =
  '- Resolve ALL bracket-notation references to their actual values from the retrieved content. This includes [Master Record|...], [Procedure|...], and [Context|...] patterns. For [Procedure|...] references, substitute the matching SOP number and title (e.g., "SOP0004 (Design Control Procedure)"). For [Master Record|...] references, substitute the actual field value. Never leave any bracket notation in the output.\n';

/**
 * Use procedural language as closely as retrieved content allows.
 * Maps to: operational_rules.source_tracking
 */
export const RULE_USE_PROCEDURAL_LANGUAGE =
  '- Use procedural language as closely as retrieved content allows. If exact wording is unavailable, paraphrase and flag it.\n';

/**
 * Do not include inline footnotes — appended separately by the system.
 * Maps to: generation_workflow.output.sections.references
 */
export const RULE_NO_INLINE_FOOTNOTES =
  '- Do not include footnotes or citations — these are appended separately.\n';

/**
 * Default professional tone (third-person, passive voice).
 * This is a design decision; not explicitly mandated by the yaml.
 * The prompt may override tone for specific document types.
 */
export const RULE_TONE =
  '- Default tone: professional, third-person, passive voice. The prompt may override this.\n';

/**
 * Format output as Markdown with the specified element conventions.
 * Maps to: generation_workflow.output.sections.generated_content.format
 */
export const RULE_MARKDOWN_FORMAT =
  '- Format output as Markdown. Use ## for section headings, - for bullet lists, and | for tables. The output will be rendered by a Markdown engine.\n';

/**
 * Write only what the prompt requests; respect all length and format constraints.
 * Maps to: operational_rules.knowledge_source_scoping
 */
export const RULE_WRITE_ONLY_REQUESTED =
  '- Write only what the prompt requests. Respect all length and format constraints exactly.\n';

/**
 * Build SECTION 1 of the LLM prompt: role declaration + universal generation rules.
 * Previously inline in context-assembler.ts:58-67.
 * Maps to: product.name, product.purpose, and all operational_rules above.
 *
 * @param primaryContext - Parsed primary-context.yaml object
 */
export function buildSystemSection(primaryContext: any): string {
  const role = primaryContext?.product?.name || 'PhaserGun AI';
  const purpose = primaryContext?.product?.purpose || 'Generate regulatory documents';

  return [
    `You are ${role}, a regulatory documentation expert. ${purpose}.\n\n`,
    'GENERATION RULES (apply to all tasks):\n',
    RULE_WRITE_AS_AUTHOR,
    RULE_RESOLVE_BRACKET_NOTATION,
    RULE_USE_PROCEDURAL_LANGUAGE,
    RULE_NO_INLINE_FOOTNOTES,
    RULE_TONE,
    RULE_MARKDOWN_FORMAT,
    RULE_WRITE_ONLY_REQUESTED,
    '\n',
    '---\n\n',
  ].join('');
}

/**
 * Build the complete LLM prompt: RAG context + task wrapper.
 * Previously in orchestrator/src/index.ts:buildLLMPrompt().
 * Maps to: generation_workflow.processing (task wrapper structure)
 *
 * @param ragContext - Assembled context from context-assembler (SECTIONS 1 + 2)
 * @param userPrompt - The user's generation prompt
 */
export function buildLLMPrompt(ragContext: string, userPrompt: string): string {
  return `${ragContext}=== TASK ===

    ${userPrompt}

    === END TASK ===

    Write your response now.`;
}
