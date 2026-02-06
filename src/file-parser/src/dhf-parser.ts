import { ParsedDocument } from '@phasergun/shared-types';
import { ComprehensiveFileParser } from './index';
import * as path from 'path';

/**
 * Extended metadata for DHF documents
 */
interface DHFMetadata {
  // Document classification
  documentType?: 'design-input' | 'design-output' | 'risk-analysis' | 'verification' | 'validation' | 'test-protocol' | 'test-report' | 'other';
  phase?: 'planning' | 'design' | 'verification' | 'validation' | 'production' | 'post-market';
  category?: 'requirements' | 'specifications' | 'testing' | 'risk-management' | 'manufacturing';
  
  // Standards and compliance
  standards?: string[];  // ['ISO 13485', 'ISO 14971', '21 CFR Part 820']
  regulatoryReferences?: string[];
  
  // Structured data extraction
  requirementIds?: string[];
  riskIds?: string[];
  testCaseIds?: string[];
  
  // Document structure
  sections?: Array<{
    title: string;
    level: number;
    startIndex: number;
    endIndex: number;
  }>;
  
  // Page tracking for PDFs
  pageBreaks?: Array<{
    page: number;
    charIndex: number;
  }>;
  
  // Quality metrics
  conversionQuality?: {
    score: number;  // 0-1
    issues: string[];
    warnings: string[];
  };
  
  // OCR specific
  ocrQuality?: {
    averageConfidence: number;  // 0-1
    lowConfidenceWords: number;
    totalWords: number;
  };
}

/**
 * DHF-Aware File Parser
 * Extends base parser with DHF-specific document analysis
 */
export class DHFAwareParser extends ComprehensiveFileParser {
  
  async scanAndParseFolder(folderPath: string): Promise<ParsedDocument[]> {
    // Use base parser to get documents
    const documents = await super.scanAndParseFolder(folderPath);
    
    // Enhance with DHF-specific metadata
    const enhancedDocuments = await Promise.all(
      documents.map(doc => this.enhanceWithDHFMetadata(doc))
    );
    
    return enhancedDocuments;
  }
  
  /**
   * Enhance parsed document with DHF-specific metadata
   */
  private async enhanceWithDHFMetadata(doc: ParsedDocument): Promise<ParsedDocument> {
    const dhfMetadata: DHFMetadata = {};
    
    // 1. Classify document type from filename and content
    dhfMetadata.documentType = this.classifyDocumentType(doc);
    dhfMetadata.phase = this.inferPhase(doc);
    dhfMetadata.category = this.inferCategory(doc);
    
    // 2. Extract standards references
    dhfMetadata.standards = this.extractStandards(doc.content);
    dhfMetadata.regulatoryReferences = this.extractRegulatoryRefs(doc.content);
    
    // 3. Extract structured identifiers
    dhfMetadata.requirementIds = this.extractRequirementIds(doc.content);
    dhfMetadata.riskIds = this.extractRiskIds(doc.content);
    dhfMetadata.testCaseIds = this.extractTestCaseIds(doc.content);
    
    // 4. Extract document structure (sections/headings)
    dhfMetadata.sections = this.extractSections(doc.content);
    
    // 5. Track page boundaries for PDFs
    if (doc.mimeType === 'application/pdf' && doc.metadata.pageCount) {
      dhfMetadata.pageBreaks = this.estimatePageBreaks(
        doc.content,
        doc.metadata.pageCount
      );
    }
    
    // 6. Assess conversion quality
    dhfMetadata.conversionQuality = this.assessConversionQuality(doc);
    
    // 7. Assess OCR quality if applicable
    if (doc.metadata.isOCRExtracted) {
      dhfMetadata.ocrQuality = await this.assessOCRQuality(doc.content);
    }
    
    // Merge DHF metadata with existing metadata
    return {
      ...doc,
      metadata: {
        ...doc.metadata,
        ...dhfMetadata
      }
    };
  }
  
  /**
   * Classify document type from filename and content
   */
  private classifyDocumentType(doc: ParsedDocument): DHFMetadata['documentType'] {
    const fileName = doc.fileName.toLowerCase();
    const content = doc.content.toLowerCase();
    
    // Filename patterns
    const patterns = {
      'design-input': [/design.?input/i, /user.?need/i, /requirement/i],
      'design-output': [/design.?output/i, /specification/i, /drawing/i],
      'risk-analysis': [/risk/i, /fmea/i, /hazard/i, /iso.?14971/i],
      'verification': [/verification/i, /test.?protocol/i, /v&v/i],
      'validation': [/validation/i, /clinical/i, /usability/i],
      'test-protocol': [/test.?protocol/i, /test.?plan/i],
      'test-report': [/test.?report/i, /test.?result/i]
    };
    
    // Check filename first
    for (const [type, regexes] of Object.entries(patterns)) {
      if (regexes.some(regex => regex.test(fileName))) {
        return type as DHFMetadata['documentType'];
      }
    }
    
    // Check content
    for (const [type, regexes] of Object.entries(patterns)) {
      const matches = regexes.filter(regex => regex.test(content)).length;
      if (matches >= 2) {  // Require multiple matches in content
        return type as DHFMetadata['documentType'];
      }
    }
    
    return 'other';
  }
  
  /**
   * Infer DHF phase from document type and content
   */
  private inferPhase(doc: ParsedDocument): DHFMetadata['phase'] {
    const content = doc.content.toLowerCase();
    
    if (content.includes('design input') || content.includes('user need')) {
      return 'planning';
    }
    if (content.includes('design output') || content.includes('specification')) {
      return 'design';
    }
    if (content.includes('verification') || content.includes('test protocol')) {
      return 'verification';
    }
    if (content.includes('validation') || content.includes('clinical')) {
      return 'validation';
    }
    if (content.includes('manufacturing') || content.includes('production')) {
      return 'production';
    }
    
    return undefined;
  }
  
  /**
   * Infer document category
   */
  private inferCategory(doc: ParsedDocument): DHFMetadata['category'] {
    const content = doc.content.toLowerCase();
    
    if (content.includes('requirement') || content.includes('shall')) {
      return 'requirements';
    }
    if (content.includes('specification') || content.includes('drawing')) {
      return 'specifications';
    }
    if (content.includes('test') || content.includes('protocol')) {
      return 'testing';
    }
    if (content.includes('risk') || content.includes('hazard')) {
      return 'risk-management';
    }
    if (content.includes('manufacturing') || content.includes('process')) {
      return 'manufacturing';
    }
    
    return undefined;
  }
  
  /**
   * Extract standard references (ISO, IEC, FDA, etc.)
   */
  private extractStandards(content: string): string[] {
    const standards = new Set<string>();
    
    // ISO standards
    const isoMatches = content.match(/ISO\s+\d+(-\d+)?/gi);
    if (isoMatches) {
      isoMatches.forEach(s => standards.add(s.toUpperCase()));
    }
    
    // IEC standards
    const iecMatches = content.match(/IEC\s+\d+(-\d+)?/gi);
    if (iecMatches) {
      iecMatches.forEach(s => standards.add(s.toUpperCase()));
    }
    
    // FDA CFR references
    const cfrMatches = content.match(/21\s+CFR\s+Part\s+\d+/gi);
    if (cfrMatches) {
      cfrMatches.forEach(s => standards.add(s));
    }
    
    return Array.from(standards);
  }
  
  /**
   * Extract regulatory references
   */
  private extractRegulatoryRefs(content: string): string[] {
    const refs = new Set<string>();
    
    // FDA guidance documents
    const fdaMatches = content.match(/FDA\s+Guidance[^.]+/gi);
    if (fdaMatches) {
      fdaMatches.forEach(r => refs.add(r.trim()));
    }
    
    return Array.from(refs);
  }
  
  /**
   * Extract requirement IDs (REQ-XXX, R-XXX, etc.)
   */
  private extractRequirementIds(content: string): string[] {
    const ids = new Set<string>();
    
    const patterns = [
      /REQ-\d+/gi,
      /R-\d+/gi,
      /REQUIREMENT\s+\d+/gi,
      /\b[A-Z]+-REQ-\d+/gi
    ];
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(id => ids.add(id.toUpperCase()));
      }
    });
    
    return Array.from(ids);
  }
  
  /**
   * Extract risk IDs (RISK-XXX, HAZ-XXX, etc.)
   */
  private extractRiskIds(content: string): string[] {
    const ids = new Set<string>();
    
    const patterns = [
      /RISK-\d+/gi,
      /HAZ-\d+/gi,
      /HAZARD-\d+/gi,
      /R\d+-H\d+/gi  // Common FMEA format
    ];
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(id => ids.add(id.toUpperCase()));
      }
    });
    
    return Array.from(ids);
  }
  
  /**
   * Extract test case IDs
   */
  private extractTestCaseIds(content: string): string[] {
    const ids = new Set<string>();
    
    const patterns = [
      /TC-\d+/gi,
      /TEST-\d+/gi,
      /T\d+/gi  // Simple format
    ];
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(id => ids.add(id.toUpperCase()));
      }
    });
    
    return Array.from(ids);
  }
  
  /**
   * Extract document sections and headings
   */
  private extractSections(content: string): DHFMetadata['sections'] {
    const sections: DHFMetadata['sections'] = [];
    
    // Markdown-style headings
    const mdHeadingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    
    while ((match = mdHeadingRegex.exec(content)) !== null) {
      sections.push({
        title: match[2].trim(),
        level: match[1].length,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
    
    // Numbered sections (1., 1.1, 1.1.1, etc.)
    const numberedRegex = /^(\d+(?:\.\d+)*)\s+([A-Z][^\n]+)$/gm;
    
    while ((match = numberedRegex.exec(content)) !== null) {
      const level = (match[1].match(/\./g) || []).length + 1;
      sections.push({
        title: `${match[1]} ${match[2].trim()}`,
        level,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
    
    // Sort by start index
    sections.sort((a, b) => a.startIndex - b.startIndex);
    
    return sections.length > 0 ? sections : undefined;
  }
  
  /**
   * Estimate page breaks in PDF text
   */
  private estimatePageBreaks(content: string, pageCount: number): DHFMetadata['pageBreaks'] {
    const pageBreaks: DHFMetadata['pageBreaks'] = [];
    const contentLength = content.length;
    const avgCharsPerPage = contentLength / pageCount;
    
    for (let page = 1; page <= pageCount; page++) {
      const estimatedIndex = Math.floor((page - 1) * avgCharsPerPage);
      
      // Try to find a paragraph break near the estimated position
      const searchStart = Math.max(0, estimatedIndex - 100);
      const searchEnd = Math.min(contentLength, estimatedIndex + 100);
      const searchRegion = content.substring(searchStart, searchEnd);
      
      const breakIndex = searchRegion.indexOf('\n\n');
      const actualIndex = breakIndex !== -1 
        ? searchStart + breakIndex 
        : estimatedIndex;
      
      pageBreaks.push({
        page,
        charIndex: actualIndex
      });
    }
    
    return pageBreaks;
  }
  
  /**
   * Assess conversion quality
   */
  private assessConversionQuality(doc: ParsedDocument): DHFMetadata['conversionQuality'] {
    const issues: string[] = [];
    const warnings: string[] = [];
    let score = 1.0;
    
    // Check for conversion warnings (DOCX)
    if (doc.metadata.messages && Array.isArray(doc.metadata.messages)) {
      const messageCount = doc.metadata.messages.length;
      if (messageCount > 0) {
        warnings.push(`${messageCount} conversion warnings from mammoth`);
        score -= messageCount * 0.05;
      }
    }
    
    // Check for OCR issues
    if (doc.metadata.isOCRExtracted) {
      warnings.push('Document was OCR extracted - may contain recognition errors');
      score -= 0.1;
    }
    
    // Check for incomplete content
    if (doc.content.length < 100) {
      issues.push('Very short content - may indicate parsing failure');
      score -= 0.3;
    }
    
    // Check for garbled text (high ratio of special characters)
    const specialCharRatio = (doc.content.match(/[^\w\s.,!?-]/g) || []).length / doc.content.length;
    if (specialCharRatio > 0.1) {
      issues.push('High ratio of special characters - possible encoding issues');
      score -= 0.2;
    }
    
    return {
      score: Math.max(0, Math.min(1, score)),
      issues,
      warnings
    };
  }
  
  /**
   * Assess OCR quality
   */
  private async assessOCRQuality(content: string): Promise<DHFMetadata['ocrQuality']> {
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const totalWords = words.length;
    
    // Heuristic: words with unusual character patterns are likely OCR errors
    const suspiciousWords = words.filter(word => {
      // Contains mixed case in unusual ways
      const mixedCase = /[a-z][A-Z]/.test(word);
      // Contains numbers mixed with letters oddly
      const mixedAlphaNum = /[a-z]\d|\d[a-z]/.test(word) && word.length < 6;
      // Contains repeated special chars
      const repeatedSpecial = /[^\w\s]{2,}/.test(word);
      
      return mixedCase || mixedAlphaNum || repeatedSpecial;
    });
    
    const lowConfidenceWords = suspiciousWords.length;
    const averageConfidence = 1 - (lowConfidenceWords / totalWords);
    
    return {
      averageConfidence: Math.max(0, Math.min(1, averageConfidence)),
      lowConfidenceWords,
      totalWords
    };
  }
}
