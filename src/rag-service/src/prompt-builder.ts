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
 * Resolve any remaining bracket-notation references that were not pre-resolved server-side.
 * [Master Record|...] tokens are resolved server-side before this prompt is sent; if any
 * survive (file not found), the LLM must resolve them from the retrieved context.
 * Maps to: reference_notation.*
 */
export const RULE_RESOLVE_BRACKET_NOTATION =
  '- Resolve any remaining bracket-notation references to their actual values from the retrieved content. For [Procedure|...] references, substitute the matching SOP number and title (e.g., "SOP0004 (Design Control Procedure)"). For [Master Checklist] references, insert the checklist content from the retrieved materials. Never leave any bracket notation in the output.\n';

export const RULE_NO_HALLUCINATION =
  '- STRICT: Do NOT invent, fabricate, or assume values for any data not explicitly present in the retrieved materials or the resolved prompt. If a value is shown as "(FIELD_NAME: not configured in Master Record)" or "(FIELD_NAME: not set)" or similar, reproduce that placeholder exactly — do NOT replace it with a made-up value, example data, or generic text. Only real data from the provided sources may be written into the document.\n';

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
 * Do not echo or reproduce any part of the task specification in the response.
 * Prevents models from repeating prompt headings, section titles, or reference notation
 * (e.g., "[Bootstrap|...]", "[Master Checklist]", "Task", "References") at the start of output.
 */
export const RULE_NO_ECHO_PROMPT =
  '- Do NOT echo, repeat, or reproduce any part of the task specification, prompt headings, section titles (e.g., "Task", "References"), or reference notation ([Bootstrap|...], [Master Checklist], etc.) in your response. Begin immediately with the requested document content.\n';

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
    RULE_NO_HALLUCINATION,
    RULE_RESOLVE_BRACKET_NOTATION,
    RULE_USE_PROCEDURAL_LANGUAGE,
    RULE_NO_INLINE_FOOTNOTES,
    RULE_TONE,
    RULE_MARKDOWN_FORMAT,
    RULE_WRITE_ONLY_REQUESTED,
    RULE_NO_ECHO_PROMPT,
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
