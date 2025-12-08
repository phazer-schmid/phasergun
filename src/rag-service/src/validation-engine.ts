/**
 * DHF Validation Engine
 * Implements 4-layer architecture for file/category/phase/DHF validation
 */

import Anthropic from '@anthropic-ai/sdk';
import * as yaml from 'yaml';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface ValidationCheck {
  check_id: string;
  check_name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  regulatory_source: string;
  source_section: string;
  estar_section: string;
  llm_validation: {
    question: string;
    validation_criteria: any;
  };
  failure_message: string;
  remediation: string[];
}

export interface FileAnalysisResult {
  fileId: string;
  fileName: string;
  filePath: string;
  categoryPath: string;
  phase: number;
  checks: CheckResult[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    criticalIssues: number;
  };
  status: 'compliant' | 'partially-compliant' | 'non-compliant';
  analyzedAt: Date;
}

export interface CheckResult {
  checkId: string;
  checkName: string;
  passed: boolean;
  severity: string;
  message: string;
  evidence: any[];
  remediation: string[];
}

export class DHFValidationEngine {
  private anthropic: Anthropic;
  private configPath: string;
  private primaryContext: any;
  
  constructor(apiKey: string, configPath: string = './config/validation') {
    this.anthropic = new Anthropic({ apiKey });
    this.configPath = configPath;
    this.loadPrimaryContext();
  }
  
  private loadPrimaryContext() {
    const contextPath = join(__dirname, '../knowledge-base/context/primary-context.yaml');
    const contextYaml = readFileSync(contextPath, 'utf8');
    this.primaryContext = yaml.parse(contextYaml);
  }
  
  private loadChecksForCategory(categoryPath: string): ValidationCheck[] {
    // Load orchestrator to find validation file
    const orchestratorPath = join(this.configPath, 'orchestrator.yaml');
    const orchestrator = yaml.parse(readFileSync(orchestratorPath, 'utf8'));
    
    const folderConfig = orchestrator.folder_validations[categoryPath];
    if (!folderConfig) {
      throw new Error(`No validation config found for ${categoryPath}`);
    }
    
    // Load validation file
    const validationPath = join(this.configPath, folderConfig.validation_file);
    const validation = yaml.parse(readFileSync(validationPath, 'utf8'));
    
    const sectionConfig = validation[folderConfig.section];
    return sectionConfig.validation_checks;
  }
  
  /**
   * LAYER 1: File Analysis
   * Analyze individual file and store results
   */
  async analyzeFile(params: {
    filePath: string;
    categoryPath: string;
    documentContent: string;
  }): Promise<FileAnalysisResult> {
    console.log(`Analyzing file: ${params.filePath}`);
    
    // Load checks for this category
    const checks = this.loadChecksForCategory(params.categoryPath);
    
    // Run each check
    const checkResults: CheckResult[] = [];
    
    for (const check of checks) {
      const result = await this.runCheck(check, params.documentContent);
      checkResults.push(result);
    }
    
    // Calculate summary
    const summary = {
      totalChecks: checkResults.length,
      passed: checkResults.filter(r => r.passed).length,
      failed: checkResults.filter(r => !r.passed).length,
      criticalIssues: checkResults.filter(r => !r.passed && r.severity === 'critical').length
    };
    
    const status = summary.criticalIssues > 0 ? 'non-compliant' :
                   summary.failed > 0 ? 'partially-compliant' : 'compliant';
    
    const result: FileAnalysisResult = {
      fileId: params.filePath,
      fileName: params.filePath.split('/').pop() || '',
      filePath: params.filePath,
      categoryPath: params.categoryPath,
      phase: this.getPhaseFromPath(params.categoryPath),
      checks: checkResults,
      summary,
      status,
      analyzedAt: new Date()
    };
    
    // TODO: Store in database
    
    return result;
  }
  
  /**
   * LAYER 2: Category Analysis
   * Analyze category folder with threshold check
   */
  async analyzeCategory(params: {
    categoryPath: string;
    files: Array<{ path: string; content: string }>;
  }): Promise<any> {
    console.log(`Analyzing category: ${params.categoryPath}`);
    
    // Check threshold
    const checks = this.loadChecksForCategory(params.categoryPath);
    if (checks.length > 10) {
      return {
        thresholdExceeded: true,
        checkCount: checks.length,
        message: 'Category has too many checks. Analyze files individually.',
        suggestedFiles: params.files.map(f => ({
          path: f.path,
          estimatedChecks: Math.ceil(checks.length / params.files.length)
        }))
      };
    }
    
    // Analyze each file
    const fileResults = [];
    for (const file of params.files) {
      const result = await this.analyzeFile({
        filePath: file.path,
        categoryPath: params.categoryPath,
        documentContent: file.content
      });
      fileResults.push(result);
    }
    
    // Aggregate results
    const categoryResult = {
      categoryPath: params.categoryPath,
      fileResults,
      summary: {
        totalFiles: fileResults.length,
        filesAnalyzed: fileResults.length,
        totalChecks: checks.length,
        passed: fileResults.reduce((sum, r) => sum + r.summary.passed, 0),
        failed: fileResults.reduce((sum, r) => sum + r.summary.failed, 0),
        criticalIssues: fileResults.reduce((sum, r) => sum + r.summary.criticalIssues, 0)
      },
      status: fileResults.some(r => r.status === 'non-compliant') ? 'non-compliant' :
              fileResults.some(r => r.status === 'partially-compliant') ? 'partially-compliant' : 'compliant'
    };
    
    // TODO: Store in database
    
    return categoryResult;
  }
  
  /**
   * LAYER 3: Phase Progress (Query Only)
   * No new analysis - just query stored results
   */
  async getPhaseProgress(phase: number): Promise<any> {
    // TODO: Query database for all category results in this phase
    return {
      phase,
      categoriesAnalyzed: 0,
      totalCategories: 0,
      summary: {},
      message: 'Query stored results from database'
    };
  }
  
  /**
   * LAYER 4: DHF Progress (Query Only)
   * No new analysis - just query all stored results
   */
  async getDHFProgress(): Promise<any> {
    // TODO: Query database for all stored results
    return {
      phasesCompleted: 0,
      totalPhases: 5,
      summary: {},
      message: 'Query all stored results from database'
    };
  }
  
  /**
   * Run individual validation check using Claude
   */
  private async runCheck(check: ValidationCheck, documentContent: string): Promise<CheckResult> {
    // Build prompt with primary context
    const prompt = this.buildValidationPrompt(check, documentContent);
    
    try {
      const message = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });
      
      // Parse response
      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const passed = responseText.toLowerCase().includes('compliant') || 
                     responseText.toLowerCase().includes('pass');
      
      return {
        checkId: check.check_id,
        checkName: check.check_name,
        passed,
        severity: check.severity,
        message: passed ? `Check ${check.check_id} passed` : check.failure_message,
        evidence: [],
        remediation: passed ? [] : check.remediation
      };
    } catch (error) {
      console.error(`Error running check ${check.check_id}:`, error);
      return {
        checkId: check.check_id,
        checkName: check.check_name,
        passed: false,
        severity: check.severity,
        message: 'Error running check',
        evidence: [],
        remediation: check.remediation
      };
    }
  }
  
  private buildValidationPrompt(check: ValidationCheck, documentContent: string): string {
    return `
You are ${this.primaryContext.ai_persona.roles.join(', ')}.

Regulatory Context:
- Source: ${check.regulatory_source}
- Section: ${check.source_section}

Validation Question:
${check.llm_validation.question}

Document Content:
${documentContent.substring(0, 4000)}

Please evaluate if the document meets the requirements. Respond with:
1. COMPLIANT or NON-COMPLIANT
2. Brief explanation
3. Specific findings

Be conservative and evidence-based. Only mark as COMPLIANT if requirements are clearly met.
`;
  }
  
  private getPhaseFromPath(path: string): number {
    const match = path.match(/Phase (\d+)/);
    return match ? parseInt(match[1]) : 0;
  }
}
