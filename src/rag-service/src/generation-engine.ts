/**
 * Generation Engine
 * Maps SOP categories to file names from project context
 */

import * as yaml from 'yaml';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface SOPMapping {
  category: string;
  fileName: string | null;
}

export class GenerationEngine {
  private projectContext: any;
  private projectContextPath: string;

  constructor(projectContextPath?: string) {
    this.projectContextPath = projectContextPath || 
      join(__dirname, '../knowledge-base/context/project-context.yaml');
    
    this.loadProjectContext();
  }

  /**
   * Load project context from YAML file
   */
  private loadProjectContext(): void {
    try {
      const contextYaml = readFileSync(this.projectContextPath, 'utf8');
      this.projectContext = yaml.parse(contextYaml);
      console.log('[GenerationEngine] Project context loaded successfully');
    } catch (error) {
      console.error('[GenerationEngine] Error loading project context:', error);
      this.projectContext = { company_sops: {} };
    }
  }

  /**
   * Get SOP file name for a given category
   * @param category - The SOP category (e.g., 'design_control', 'risk_management')
   * @returns The file name associated with that category, or null if not found
   */
  getSOPFileName(category: string): string | null {
    return this.projectContext?.company_sops?.[category] || null;
  }

  /**
   * Get all SOP mappings
   * @returns Array of all SOP category to file name mappings
   */
  getAllSOPMappings(): SOPMapping[] {
    const sops = this.projectContext?.company_sops || {};
    return Object.entries(sops).map(([category, fileName]) => ({
      category,
      fileName: fileName as string | null
    }));
  }

  /**
   * Check if a SOP is configured for a given category
   * @param category - The SOP category to check
   * @returns true if a SOP file is configured, false otherwise
   */
  hasSOPForCategory(category: string): boolean {
    const fileName = this.getSOPFileName(category);
    return fileName !== null && fileName !== '';
  }

  /**
   * Get project information
   * @returns The project information from context
   */
  getProjectInfo(): any {
    return this.projectContext?.project || null;
  }

  /**
   * Get regulatory information
   * @returns The regulatory information from context
   */
  getRegulatoryInfo(): any {
    return this.projectContext?.regulatory || null;
  }

  /**
   * Get product information
   * @returns The product information from context
   */
  getProductInfo(): any {
    return this.projectContext?.product || null;
  }

  /**
   * Reload project context (useful if the file has been updated)
   */
  reload(): void {
    this.loadProjectContext();
  }
}

// Export singleton instance
let generationEngineInstance: GenerationEngine | null = null;

export function getGenerationEngine(projectContextPath?: string): GenerationEngine {
  if (!generationEngineInstance || projectContextPath) {
    generationEngineInstance = new GenerationEngine(projectContextPath);
  }
  return generationEngineInstance;
}
