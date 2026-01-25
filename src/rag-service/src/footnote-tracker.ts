/**
 * Footnote Tracker for Source Attribution
 * Tracks which sources were used and formats citations
 */

import { VectorEntry, SearchResult } from './vector-store';

export interface SourceReference {
  id: string;                     // Unique ID for this reference
  fileName: string;               // Source file name
  category: 'procedure' | 'context' | 'standard';
  chunkIndex?: number;            // Chunk index if applicable
  citationText?: string;          // Optional specific text cited
}

export class FootnoteTracker {
  private sources: Map<string, SourceReference> = new Map();
  private citationCounter: number = 1;
  
  /**
   * Add a source reference
   * Returns the citation number for this source
   */
  addSource(source: Omit<SourceReference, 'id'>): number {
    const key = `${source.category}-${source.fileName}-${source.chunkIndex || 0}`;
    
    if (!this.sources.has(key)) {
      this.sources.set(key, {
        ...source,
        id: `${this.citationCounter}`
      });
      return this.citationCounter++;
    }
    
    return parseInt(this.sources.get(key)!.id);
  }
  
  /**
   * Add sources from retrieval results (SearchResult arrays from vector store)
   */
  addFromRetrievalResults(
    procedureChunks: SearchResult[],
    contextChunks: SearchResult[]
  ): void {
    procedureChunks.forEach(result => {
      this.addSource({
        fileName: result.entry.metadata.fileName,
        category: 'procedure',
        chunkIndex: result.entry.metadata.chunkIndex
      });
    });
    
    contextChunks.forEach(result => {
      this.addSource({
        fileName: result.entry.metadata.fileName,
        category: 'context',
        chunkIndex: result.entry.metadata.chunkIndex
      });
    });
  }
  
  /**
   * Add a regulatory standard reference (e.g., ISO, FDA CFR)
   */
  addStandardReference(standardName: string, citationText?: string): number {
    return this.addSource({
      fileName: standardName,
      category: 'standard',
      citationText
    });
  }
  
  /**
   * Generate footnotes section for document
   */
  generateFootnotes(): string {
    if (this.sources.size === 0) {
      return '';
    }
    
    const footnotes: string[] = [
      '\n\n---\n',
      '## Sources\n\n'
    ];
    
    // Sort by citation number
    const sorted = Array.from(this.sources.values()).sort((a, b) => 
      parseInt(a.id) - parseInt(b.id)
    );
    
    sorted.forEach(source => {
      const categoryLabel = source.category === 'procedure' ? 'Procedure' : 
                           source.category === 'context' ? 'Context' : 
                           'Regulatory Standard';
      
      const chunkInfo = source.chunkIndex !== undefined ? 
                       ` (Section ${source.chunkIndex + 1})` : '';
      
      const citationInfo = source.citationText ? ` - ${source.citationText}` : '';
      
      footnotes.push(`[${source.id}] ${categoryLabel}: ${source.fileName}${chunkInfo}${citationInfo}\n`);
    });
    
    return footnotes.join('');
  }
  
  /**
   * Get citation marker for inline use
   */
  getCitationMarker(sourceId: string): string {
    return `[${sourceId}]`;
  }
  
  /**
   * Get all sources as a Map (for caching/API response)
   */
  getSources(): Map<string, SourceReference> {
    return new Map(this.sources);
  }
  
  /**
   * Get all sources as an array (for easier serialization)
   */
  getSourcesArray(): SourceReference[] {
    return Array.from(this.sources.values()).sort((a, b) => 
      parseInt(a.id) - parseInt(b.id)
    );
  }
  
  /**
   * Clear all sources
   */
  clear(): void {
    this.sources.clear();
    this.citationCounter = 1;
  }
  
  /**
   * Get the number of sources tracked
   */
  getSourceCount(): number {
    return this.sources.size;
  }
}

// Usage example:
/*
const tracker = new FootnoteTracker();

// After retrieval:
tracker.addFromRetrievalResults(procedureChunks, contextChunks);

// Add regulatory standards mentioned in prompt
tracker.addStandardReference('ISO 13485:2016', 'Quality Management Systems');
tracker.addStandardReference('21 CFR Part 820', 'FDA Quality System Regulation');

// After generation:
const generatedText = llmResponse.generatedText;
const footnotes = tracker.generateFootnotes();
const finalText = generatedText + footnotes;

// For API response (with caching support):
return {
  generatedText: finalText,
  sources: metadata.sources,
  footnotes: tracker.getSourcesArray(), // Serializable array
  footnotesMap: Object.fromEntries(tracker.getSources()), // For caching
  usageStats: response.usageStats
};
*/
