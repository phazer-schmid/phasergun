/**
 * Compliance Validator (Standards-Aware)
 *
 * Validates content against regulatory standards listed in the @compliance
 * section of primary-context.yaml. Instead of matching against explicit rules
 * written in the YAML, this validator instructs the LLM to use its TRAINING
 * KNOWLEDGE of the listed standards (e.g., FDA 21 CFR 820.30, ISO 14971)
 * to evaluate compliance.
 *
 * Three gates:
 *   0. CAPABILITY gate — verifies the LLM knows the listed standards well enough
 *   1. INPUT gate     — validates retrieved materials BEFORE generation
 *   2. OUTPUT gate    — validates generated content AFTER generation
 */

import {
  ComplianceStandard,
  ComplianceViolation,
  ComplianceValidationResult,
  ModelCapabilityResult
} from '@phasergun/shared-types';

interface LLMServiceLike {
  generateText(prompt: string): Promise<{ generatedText: string; usageStats: any }>;
  getModelName(): string;
}

export class ComplianceValidator {
  private standards: ComplianceStandard[];
  private standardsList: string;
  private standardsDetailed: string;

  /**
   * @param complianceSection — The parsed `compliance` object from primary-context.yaml.
   *   Expected shape: { standards: [{ id, name, scope }, ...], ... }
   */
  constructor(complianceSection: any) {
    // Extract the standards array from the compliance section
    this.standards = this.extractStandards(complianceSection);

    // Pre-build formatted strings for reuse in prompts
    this.standardsList = this.standards
      .map(s => `${s.name}`)
      .join(', ');

    this.standardsDetailed = this.standards
      .map(s => `- ${s.name} (Scope: ${s.scope})`)
      .join('\n');
  }

  private extractStandards(section: any): ComplianceStandard[] {
    if (!section) return [];

    // Handle direct standards array
    if (Array.isArray(section.standards)) {
      return section.standards.map((s: any) => ({
        id: s.id || 'unknown',
        name: s.name || 'Unknown Standard',
        scope: s.scope || 'General'
      }));
    }

    // Handle case where section itself is the array
    if (Array.isArray(section)) {
      return section.map((s: any) => ({
        id: s.id || 'unknown',
        name: s.name || 'Unknown Standard',
        scope: s.scope || 'General'
      }));
    }

    return [];
  }

  /**
   * Returns true if standards were found in the compliance section.
   */
  isEnabled(): boolean {
    return this.standards.length > 0;
  }

  /**
   * Returns the list of standards for logging/display.
   */
  getStandardsList(): string {
    return this.standardsList;
  }

  // =========================================================================
  // GATE 0: MODEL CAPABILITY CHECK
  // =========================================================================

  /**
   * Verify the LLM has sufficient training knowledge of each listed standard.
   * Must be called BEFORE any validation gates.
   *
   * If any standard scores 'low' or 'none', the check fails and generation
   * should be blocked with a message telling the user to switch models.
   */
  async checkModelCapability(
    llmService: LLMServiceLike
  ): Promise<ComplianceValidationResult> {
    console.log(`[ComplianceValidator] MODEL CAPABILITY CHECK for: ${this.standardsList}`);

    if (!this.isEnabled()) {
      return {
        compliant: true,
        violations: [],
        validatedAt: new Date().toISOString(),
        gate: 'capability'
      };
    }

    const prompt = `You are being evaluated for your knowledge of specific regulatory standards. For each standard listed below, honestly assess your training knowledge level.

=== STANDARDS TO ASSESS ===
${this.standardsDetailed}
=== END STANDARDS ===

For each standard, rate your knowledge as:
- "high": You have detailed knowledge of specific clauses, requirements, and their practical application to medical device development
- "medium": You have general knowledge of the standard's purpose, structure, and key requirements, but may lack clause-level detail
- "low": You have only surface-level awareness (e.g., you know it exists and its general topic, but cannot evaluate compliance against it)
- "none": You have no meaningful knowledge of this standard

Respond with ONLY a valid JSON object (no markdown fences, no preamble):

{
  "assessments": [
    {
      "standardId": "the id from the list",
      "standardName": "the name from the list",
      "knowledgeLevel": "high" | "medium" | "low" | "none",
      "explanation": "Brief explanation of what you know or don't know"
    }
  ]
}`;

    try {
      const response = await llmService.generateText(prompt);
      const rawText = response.generatedText.trim();
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        console.error('[ComplianceValidator] ⚠️  Failed to parse capability check response');
        return this.buildCapabilityFailure(
          llmService.getModelName(),
          'Capability self-assessment returned an unparseable response. The model may not support structured compliance validation.'
        );
      }

      const assessments = (parsed.assessments || []).map((a: any) => ({
        standardId: a.standardId || 'unknown',
        standardName: a.standardName || 'Unknown',
        knowledgeLevel: a.knowledgeLevel || 'none',
        explanation: a.explanation || ''
      }));

      const insufficient = assessments
        .filter((a: any) => a.knowledgeLevel === 'low' || a.knowledgeLevel === 'none')
        .map((a: any) => a.standardName);

      const capability: ModelCapabilityResult = {
        sufficient: insufficient.length === 0,
        assessments,
        insufficientStandards: insufficient
      };

      if (capability.sufficient) {
        console.log('[ComplianceValidator] ✅ MODEL CAPABILITY CHECK PASSED');
        assessments.forEach((a: any) => {
          console.log(`[ComplianceValidator]    ${a.standardName}: ${a.knowledgeLevel}`);
        });
      } else {
        console.log(`[ComplianceValidator] ❌ MODEL CAPABILITY CHECK FAILED — insufficient knowledge of: ${insufficient.join(', ')}`);
      }

      return {
        compliant: capability.sufficient,
        violations: capability.sufficient ? [] : [{
          standard: 'Model Capability',
          rule: 'Sufficient regulatory knowledge required',
          source: `LLM Model: ${llmService.getModelName()}`,
          detail: `The current model (${llmService.getModelName()}) has insufficient knowledge of the following standards to perform compliance validation: ${insufficient.join(', ')}. Switch to a more capable model (e.g., Claude 3.5 Sonnet, GPT-4, Llama 3.1 70B+) that has adequate training data for these regulatory frameworks.`,
          gate: 'capability'
        }],
        validatedAt: new Date().toISOString(),
        gate: 'capability',
        modelCapability: capability
      };

    } catch (err) {
      console.error('[ComplianceValidator] ❌ Model capability check error:', err);
      return this.buildCapabilityFailure(
        llmService.getModelName(),
        `Capability check failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  private buildCapabilityFailure(modelName: string, detail: string): ComplianceValidationResult {
    return {
      compliant: false,
      violations: [{
        standard: 'Model Capability',
        rule: 'Sufficient regulatory knowledge required',
        source: `LLM Model: ${modelName}`,
        detail,
        gate: 'capability'
      }],
      validatedAt: new Date().toISOString(),
      gate: 'capability',
      modelCapability: {
        sufficient: false,
        assessments: [],
        insufficientStandards: this.standards.map(s => s.name)
      }
    };
  }

  // =========================================================================
  // GATE 1: INPUT VALIDATION
  // =========================================================================

  /**
   * Validate INPUT materials before generation.
   * Uses the LLM's training knowledge of each standard to evaluate compliance.
   */
  async validateInputs(
    llmService: LLMServiceLike,
    materials: Array<{ sourceName: string; content: string }>
  ): Promise<ComplianceValidationResult> {
    console.log(`[ComplianceValidator] INPUT GATE: Validating ${materials.length} materials against ${this.standardsList}`);

    if (materials.length === 0) {
      return { compliant: true, violations: [], validatedAt: new Date().toISOString(), gate: 'input' };
    }

    let allViolations: ComplianceViolation[] = [];

    // --- Check 1: Standards-based compliance validation ---
    if (this.isEnabled()) {
      const standardsViolations = await this.runStandardsValidation(llmService, materials, 'input');
      allViolations.push(...standardsViolations);
    }

    // --- Check 2: Deliverable dependency / sequencing validation (always runs) ---
    const dependencyViolations = await this.validateDeliverableDependencies(llmService, materials);
    allViolations.push(...dependencyViolations);

    const result: ComplianceValidationResult = {
      compliant: allViolations.length === 0,
      violations: allViolations,
      validatedAt: new Date().toISOString(),
      gate: 'input'
    };

    if (result.compliant) {
      console.log('[ComplianceValidator] ✅ INPUT GATE PASSED');
    } else {
      console.log(`[ComplianceValidator] ❌ INPUT GATE FAILED — ${allViolations.length} violation(s)`);
      allViolations.forEach((v, i) => {
        console.log(`[ComplianceValidator]    ${i + 1}. [${v.standard}] ${v.source}: ${v.detail}`);
      });
    }

    return result;
  }

  // =========================================================================
  // GATE 2: OUTPUT VALIDATION
  // =========================================================================

  /**
   * Validate OUTPUT content after generation.
   */
  async validateOutput(
    llmService: LLMServiceLike,
    generatedContent: string
  ): Promise<ComplianceValidationResult> {
    console.log(`[ComplianceValidator] OUTPUT GATE: Validating generated content against ${this.standardsList}`);

    if (!this.isEnabled()) {
      return { compliant: true, violations: [], validatedAt: new Date().toISOString(), gate: 'output' };
    }

    if (!generatedContent || generatedContent.trim().length === 0) {
      return { compliant: true, violations: [], validatedAt: new Date().toISOString(), gate: 'output' };
    }

    const violations = await this.runStandardsValidation(
      llmService,
      [{ sourceName: 'Generated Content', content: generatedContent }],
      'output'
    );

    const result: ComplianceValidationResult = {
      compliant: violations.length === 0,
      violations,
      validatedAt: new Date().toISOString(),
      gate: 'output'
    };

    if (result.compliant) {
      console.log('[ComplianceValidator] ✅ OUTPUT GATE PASSED');
    } else {
      console.log(`[ComplianceValidator] ❌ OUTPUT GATE FAILED — ${violations.length} violation(s)`);
    }

    return result;
  }

  // =========================================================================
  // CORE: Standards-based validation using LLM training knowledge
  // =========================================================================

  /**
   * Run standards-based validation. The LLM uses its TRAINING KNOWLEDGE
   * of each listed standard — not rules written in the YAML.
   */
  private async runStandardsValidation(
    llmService: LLMServiceLike,
    materials: Array<{ sourceName: string; content: string }>,
    gate: 'input' | 'output'
  ): Promise<ComplianceViolation[]> {
    const MAX_CHARS_PER_MATERIAL = 5000;
    const materialText = materials.map(m => {
      const truncated = m.content.length > MAX_CHARS_PER_MATERIAL
        ? m.content.substring(0, MAX_CHARS_PER_MATERIAL) + '\n[...truncated...]'
        : m.content;
      return `### ${m.sourceName}\n${truncated}`;
    }).join('\n\n');

    const gateInstruction = gate === 'input'
      ? `The following are SOURCE MATERIALS (procedures, checklists, project context) that will be used as inputs for generating medical device regulatory documentation. Evaluate whether these materials are compliant with each standard listed below. Check for: contradictions with standard requirements, incorrect sequencing of activities, missing mandatory elements required by the standards, scope violations, and incorrect or misleading use of regulatory terminology.`
      : `The following is GENERATED CONTENT produced for a medical device regulatory document. Evaluate whether this content is compliant with each standard listed below. Check for: statements that contradict standard requirements, claims that violate regulatory boundaries, missing mandatory elements, incorrect regulatory terminology, and structure or content that would not pass a regulatory audit.`;

    const prompt = `You are a senior regulatory affairs specialist and auditor. You have deep expertise in the following standards and must use your FULL TRAINING KNOWLEDGE of each to evaluate compliance. Do not limit yourself to what is written in this prompt — apply everything you know about these standards.

=== STANDARDS TO EVALUATE AGAINST ===
${this.standardsDetailed}

For each standard, here is what you must check:

FDA 21 CFR Part 820.30 (Design Controls):
- Proper design planning, input/output relationships
- Design review, verification, and validation sequencing
- Design transfer requirements
- Design change control
- Design History File (DHF) requirements

FDA 21 CFR Part 807 (510(k)):
- Substantial equivalence methodology
- Predicate device requirements
- Premarket notification sequencing

ISO 13485 (Quality Management Systems):
- QMS documentation requirements
- Design and development planning
- Resource management requirements
- Process validation sequencing

ISO 14971 (Risk Management):
- Risk management plan must be established BEFORE risk assessments begin
- Risk analysis, evaluation, control, and residual risk sequencing
- Risk management file requirements
- Integration with design control activities

=== END STANDARDS ===

${gateInstruction}

=== CONTENT TO VALIDATE ===
${materialText}
=== END CONTENT ===

CRITICAL INSTRUCTIONS:
- Use your full training knowledge of each standard. Go beyond surface-level checks.
- Check deliverable sequencing: if Activity A depends on Activity B per any standard, and B is scheduled after A, that is a violation.
- Check for missing mandatory elements: if a standard requires something and it is absent, flag it.
- Do NOT flag items that are simply not mentioned in the content — only flag items that are present but wrong, misordered, or that contradict a standard's requirements.
- Do NOT flag style or formatting issues — only substantive regulatory compliance violations.
- Be strict on sequencing issues. These are the most critical violations.

Respond with ONLY a valid JSON object (no markdown fences, no preamble):

{
  "violations": [
    {
      "standard": "The standard name (e.g., ISO 14971)",
      "rule": "The specific requirement or clause area violated",
      "source": "The source material name or section where the violation was found",
      "detail": "Clear explanation: what is wrong, what the standard requires, and what must be corrected"
    }
  ]
}

If the content is fully compliant with all standards, return: {"violations": []}`;

    try {
      const response = await llmService.generateText(prompt);
      const rawText = response.generatedText.trim();
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        console.error(`[ComplianceValidator] ⚠️  Failed to parse ${gate} standards validation response:`, rawText.substring(0, 300));
        return [{
          standard: 'SYSTEM',
          rule: 'Validation parsing error',
          source: 'ComplianceValidator',
          detail: `Standards validation returned an unparseable response. Manual review required.`,
          gate
        }];
      }

      return (parsed.violations || []).map((v: any) => ({
        standard: v.standard || 'Unknown Standard',
        rule: v.rule || 'Unknown requirement',
        source: v.source || 'Unknown source',
        detail: v.detail || 'No detail provided',
        gate
      }));

    } catch (err) {
      console.error(`[ComplianceValidator] ❌ Standards validation error (${gate}):`, err);
      return [{
        standard: 'SYSTEM',
        rule: 'Validation execution error',
        source: 'ComplianceValidator',
        detail: `Standards validation failed: ${err instanceof Error ? err.message : 'Unknown error'}. Generation blocked for safety.`,
        gate
      }];
    }
  }

  // =========================================================================
  // DELIVERABLE DEPENDENCY CHECK
  // =========================================================================

  /**
   * Validate deliverable sequencing across phases.
   * Always runs (does not require @compliance rules — uses regulatory domain knowledge).
   */
  private async validateDeliverableDependencies(
    llmService: LLMServiceLike,
    materials: Array<{ sourceName: string; content: string }>
  ): Promise<ComplianceViolation[]> {
    const phaseRelatedMaterials = materials.filter(m => {
      const lower = m.content.toLowerCase();
      return lower.includes('phase') && (
        lower.includes('deliverable') ||
        lower.includes('checklist') ||
        lower.includes('phase 1') || lower.includes('phase i') ||
        lower.includes('phase 2') || lower.includes('phase ii') ||
        lower.includes('phase 3') || lower.includes('phase iii')
      );
    });

    if (phaseRelatedMaterials.length === 0) {
      console.log('[ComplianceValidator] ⏭️  No phase-structured content — skipping dependency check');
      return [];
    }

    console.log(`[ComplianceValidator] 🔗 DEPENDENCY CHECK: Analyzing ${phaseRelatedMaterials.length} material(s)`);

    const materialText = phaseRelatedMaterials.map(m => {
      const truncated = m.content.length > 6000
        ? m.content.substring(0, 6000) + '\n[...truncated...]'
        : m.content;
      return `### ${m.sourceName}\n${truncated}`;
    }).join('\n\n');

    const prompt = `You are a regulatory design control expert. Analyze the phase-structured deliverables below and identify SEQUENCING VIOLATIONS where a deliverable is assigned to a phase but its prerequisite is in a LATER phase.

Use your full knowledge of medical device design control (ISO 13485, ISO 14971, FDA 21 CFR 820.30) to identify dependencies. Key dependencies include:

- Risk Management Plan MUST precede or be concurrent with any Risk Assessments (ISO 14971 requirement)
- Risk Management Report requires completed Risk Assessments
- Design Inputs must be established before Design Verification Protocols
- Design Verification must complete before Design Validation
- Design Validation must complete before Design Transfer
- Material Selection must precede Biocompatibility Testing
- Process Development must precede Process Validation
- Sterilization Method Selection must precede Sterilization Validation
- Design Outputs must be established before Labeling Review
- All verification/validation must complete before regulatory submission (510(k))

Also apply general logic: if Deliverable A is an assessment/evaluation/test, and Deliverable B is the plan/framework/specification for that same topic, then B must be in the same or earlier phase as A.

=== CONTENT ===
${materialText}
=== END CONTENT ===

Respond with ONLY valid JSON (no markdown fences):

{
  "violations": [
    {
      "standard": "The standard that defines this dependency (e.g., ISO 14971)",
      "rule": "The dependency rule (e.g., Risk Management Plan must precede Risk Assessment)",
      "source": "The material where the violation was found",
      "detail": "Specific explanation: [deliverable] is in [Phase X] but requires [prerequisite] which is in [Phase Y]"
    }
  ]
}

If no sequencing violations exist, return: {"violations": []}`;

    try {
      const response = await llmService.generateText(prompt);
      const rawText = response.generatedText.trim();
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        console.error('[ComplianceValidator] ⚠️  Failed to parse dependency check response');
        return [{
          standard: 'SYSTEM',
          rule: 'Dependency check parsing error',
          source: 'ComplianceValidator',
          detail: 'Dependency validation returned an unparseable response. Manual review required.',
          gate: 'input' as const
        }];
      }

      return (parsed.violations || []).map((v: any) => ({
        standard: v.standard || 'Design Control',
        rule: v.rule || 'Deliverable dependency violation',
        source: v.source || 'Master Checklist',
        detail: v.detail || 'Sequencing issue detected',
        gate: 'input' as const
      }));

    } catch (err) {
      console.error('[ComplianceValidator] ❌ Dependency check error:', err);
      return [{
        standard: 'SYSTEM',
        rule: 'Dependency check error',
        source: 'ComplianceValidator',
        detail: `Dependency check failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        gate: 'input' as const
      }];
    }
  }
}
