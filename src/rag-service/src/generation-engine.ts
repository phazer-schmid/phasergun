/**
 * Generation Engine
 * Provides structured access to project master record from synced .docx file
 * Supports references like [Master Record|Section Name|Field Name]
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ComprehensiveFileParser } from '@phasergun/file-parser';

export interface SOPMapping {
  category: string;
  fileName: string | null;
}

export interface ProjectContextSection {
  heading: string;
  content: string;
  fields: Map<string, string>;
}

export class GenerationEngine {
  private projectContext: any;
  private projectContextPath: string;
  private sections: Map<string, ProjectContextSection>;
  private rawContent: string;
  private initializationPromise: Promise<void>;

  private constructor(projectContextPath?: string) {
    // Default path for backward compatibility, but should be provided from RAG folder config
    this.projectContextPath = projectContextPath || 
      join(__dirname, '../../../RAG/Context/Project-Master-Record.docx');
    
    this.sections = new Map();
    this.rawContent = '';
    this.projectContext = { company_sops: {} };
    
    // Start async initialization
    this.initializationPromise = this.loadProjectContext();
  }

  /**
   * Create and initialize a GenerationEngine instance
   * @param projectContextPath - Optional path to the project context file
   * @returns Initialized GenerationEngine instance
   */
  static async create(projectContextPath?: string): Promise<GenerationEngine> {
    const engine = new GenerationEngine(projectContextPath);
    await engine.initializationPromise;
    return engine;
  }

  /**
   * Wait for initialization to complete
   */
  async waitForInitialization(): Promise<void> {
    await this.initializationPromise;
  }

  /**
   * Load project master record from .docx file
   * Parses the document and extracts structured sections and fields
   */
  private async loadProjectContext(): Promise<void> {
    try {
      const parser = new ComprehensiveFileParser();
      
      // Parse the .docx file
      const parsedDocs = await parser.scanAndParseFolder(join(this.projectContextPath, '..'));
      const projectContextDoc = parsedDocs.find(doc => 
        doc.fileName === 'Project-Master-Record.docx' || 
        doc.fileName.toLowerCase().includes('project-master-record') ||
        // Backwards compatibility
        doc.fileName === 'Project-Context.docx' || 
        doc.fileName.toLowerCase().includes('project-context')
      );
      
      if (!projectContextDoc) {
        console.error('[GenerationEngine] Project-Master-Record.docx not found');
        this.projectContext = { company_sops: {} };
        return;
      }
      
      this.rawContent = projectContextDoc.content;
      
      // Parse structured sections from content
      this.parseStructuredContent(projectContextDoc.content);
      
      // Build legacy projectContext object for backward compatibility
      this.projectContext = this.buildLegacyContextObject();
      
      console.log('[GenerationEngine] Project master record loaded successfully from .docx');
      console.log(`[GenerationEngine] Parsed ${this.sections.size} sections`);
    } catch (error) {
      console.error('[GenerationEngine] Error loading project master record:', error);
      this.projectContext = { company_sops: {} };
    }
  }

  /**
   * Parse structured content from .docx text
   * Extracts sections based on headings and field: value pairs
   */
  private parseStructuredContent(content: string): void {
    const lines = content.split('\n');
    let currentSection: ProjectContextSection | null = null;
    let currentSectionName = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Detect headings (lines that are capitalized or followed by content)
      // Simple heuristic: if line ends with : or is all caps/title case
      const isHeading = /^[A-Z][^:]*:?\s*$/.test(line) && line.length < 100;
      
      if (isHeading && line.length > 0) {
        // Save previous section
        if (currentSection && currentSectionName) {
          this.sections.set(currentSectionName, currentSection);
        }
        
        // Start new section
        currentSectionName = line.replace(/:$/, '').trim();
        currentSection = {
          heading: currentSectionName,
          content: '',
          fields: new Map()
        };
      } else if (currentSection && line.length > 0) {
        // Add to current section content
        currentSection.content += line + '\n';
        
        // Check for field: value pairs
        const fieldMatch = line.match(/^([^:]+):\s*(.+)$/);
        if (fieldMatch) {
          const [, fieldName, fieldValue] = fieldMatch;
          currentSection.fields.set(fieldName.trim(), fieldValue.trim());
        }
      }
    }
    
    // Save last section
    if (currentSection && currentSectionName) {
      this.sections.set(currentSectionName, currentSection);
    }
  }

  /**
   * Build legacy context object for backward compatibility
   * Attempts to extract company_sops and other expected fields
   */
  private buildLegacyContextObject(): any {
    const context: any = {
      company_sops: {},
      project: {},
      regulatory: {},
      product: {}
    };
    
    // Try to populate from parsed sections
    this.sections.forEach((section, sectionName) => {
      const lowerName = sectionName.toLowerCase();
      
      if (lowerName.includes('sop') || lowerName.includes('procedure')) {
        section.fields.forEach((value, key) => {
          context.company_sops[key.toLowerCase().replace(/\s+/g, '_')] = value;
        });
      } else if (lowerName.includes('project')) {
        section.fields.forEach((value, key) => {
          context.project[key.toLowerCase().replace(/\s+/g, '_')] = value;
        });
      } else if (lowerName.includes('regulatory')) {
        section.fields.forEach((value, key) => {
          context.regulatory[key.toLowerCase().replace(/\s+/g, '_')] = value;
        });
      } else if (lowerName.includes('product')) {
        section.fields.forEach((value, key) => {
          context.product[key.toLowerCase().replace(/\s+/g, '_')] = value;
        });
      }
    });
    
    return context;
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
   * Get value by reference path: [Master Record|Section Name|Field Name]
   * @param sectionName - The section heading
   * @param fieldName - The field name within the section
   * @returns The field value or null if not found
   */
  getFieldValue(sectionName: string, fieldName: string): string | null {
    const section = this.sections.get(sectionName);
    if (!section) {
      return null;
    }
    return section.fields.get(fieldName) || null;
  }

  /**
   * Get entire section content
   * @param sectionName - The section heading
   * @returns The section content or null if not found
   */
  getSectionContent(sectionName: string): string | null {
    const section = this.sections.get(sectionName);
    return section ? section.content : null;
  }

  /**
   * Get all section names
   * @returns Array of all section headings
   */
  getAllSections(): string[] {
    return Array.from(this.sections.keys());
  }

  /**
   * Get all fields in a section
   * @param sectionName - The section heading
   * @returns Map of field names to values, or null if section not found
   */
  getSectionFields(sectionName: string): Map<string, string> | null {
    const section = this.sections.get(sectionName);
    return section ? section.fields : null;
  }

  /**
   * Get raw document content
   * @returns The entire document text
   */
  getRawContent(): string {
    return this.rawContent;
  }

  /**
   * Reload project master record (useful if the file has been updated)
   */
  async reload(): Promise<void> {
    await this.loadProjectContext();
  }
}

// Export singleton instance
let generationEngineInstance: GenerationEngine | null = null;

/**
 * Get or create the GenerationEngine singleton instance
 * @param projectContextPath - Optional path to the project master record file
 * @returns Initialized GenerationEngine instance
 */
export async function getGenerationEngine(projectContextPath?: string): Promise<GenerationEngine> {
  if (!generationEngineInstance || projectContextPath) {
    generationEngineInstance = await GenerationEngine.create(projectContextPath);
  } else {
    // Ensure existing instance is initialized
    await generationEngineInstance.waitForInitialization();
  }
  return generationEngineInstance;
}
