import { ParsedDocument } from '@phasergun/shared-types';

export interface DocumentChunk {
  content: string;
  fileName: string;
  filePath: string;
  chunkIndex: number;
  totalChunks: number;
  keywords: string[];
}

export interface ChunkingOptions {
  strategy?: 'section-aware' | 'overlap' | 'auto';
  minChunkSize?: number;
  maxChunkSize?: number;
  overlapSize?: number;
  maxKeywords?: number;
}

export class DocumentChunker {
  private readonly DEFAULT_OPTIONS: Required<ChunkingOptions> = {
    strategy: 'auto',
    minChunkSize: 2000,
    maxChunkSize: 4000,
    overlapSize: 400,
    maxKeywords: 20
  };

  chunkDocument(doc: ParsedDocument, options: ChunkingOptions = {}): DocumentChunk[] {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const strategy = opts.strategy === 'auto' ? this.detectBestStrategy(doc.content) : opts.strategy;
    
    let rawChunks: string[];
    if (strategy === 'section-aware') {
      rawChunks = this.chunkSectionAware(doc.content, opts);
    } else {
      rawChunks = this.chunkWithOverlap(doc.content, opts);
    }
    
    return rawChunks.map((content, index) => ({
      content,
      fileName: doc.fileName,
      filePath: doc.filePath,
      chunkIndex: index,
      totalChunks: rawChunks.length,
      keywords: this.extractKeywords(content, opts.maxKeywords)
    }));
  }

  private chunkSectionAware(content: string, options: Required<ChunkingOptions>): string[] {
    const chunks: string[] = [];
    const sectionRegex = /^(#{1,6}\s+.*|\d+\.(\d+\.)*\s+.*)$/m;
    const lines = content.split('\n');
    let currentChunk = '';
    
    for (const line of lines) {
      const isHeader = sectionRegex.test(line.trim());
      
      if (isHeader && currentChunk.length > options.minChunkSize) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        currentChunk = line + '\n';
      } else if (currentChunk.length + line.length > options.maxChunkSize && currentChunk.length > options.minChunkSize) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }
    
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    
    if (chunks.length === 0 || (chunks.length === 1 && chunks[0].length > options.maxChunkSize)) {
      return this.chunkWithOverlap(content, options);
    }
    
    return chunks;
  }

  private chunkWithOverlap(content: string, options: Required<ChunkingOptions>): string[] {
    const chunks: string[] = [];
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    let currentChunk = '';
    let overlapBuffer = '';
    
    for (const para of paragraphs) {
      const proposedChunk = currentChunk + (currentChunk ? '\n\n' : '') + para;
      
      if (proposedChunk.length > options.maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = overlapBuffer + (overlapBuffer ? '\n\n' : '') + para;
        const sentences = currentChunk.split(/[.!?]\s+/);
        overlapBuffer = sentences.slice(-2).join('. ');
      } else {
        currentChunk = proposedChunk;
      }
      
      if (currentChunk.length > options.overlapSize) {
        const lastPart = currentChunk.substring(currentChunk.length - options.overlapSize);
        const sentences = lastPart.split(/[.!?]\s+/);
        overlapBuffer = sentences.slice(-2).join('. ');
      }
    }
    
    if (currentChunk.trim()) chunks.push(currentChunk);
    
    if (chunks.some(c => c.length > options.maxChunkSize * 1.2)) {
      return this.chunkByCharacterLimit(content, options.maxChunkSize, options.overlapSize);
    }
    
    return chunks;
  }

  private chunkByCharacterLimit(content: string, maxSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let position = 0;
    
    while (position < content.length) {
      const end = Math.min(position + maxSize, content.length);
      let chunkEnd = end;
      
      if (end < content.length) {
        const nextPeriod = content.indexOf('. ', end - 200);
        if (nextPeriod !== -1 && nextPeriod > position) {
          chunkEnd = nextPeriod + 2;
        }
      }
      
      chunks.push(content.substring(position, chunkEnd).trim());
      position = chunkEnd - overlap;
    }
    
    return chunks;
  }

  extractKeywords(text: string, maxKeywords: number = 20): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
      'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'their', 'our', 'your'
    ]);
    
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word) && !/^\d+$/.test(word));
    
    const wordFreq = new Map<string, number>();
    words.forEach(word => wordFreq.set(word, (wordFreq.get(word) || 0) + 1));
    
    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  enforceTokenLimit(chunks: DocumentChunk[], maxTokens: number = 150000): DocumentChunk[] {
    const totalTokens = chunks.reduce((sum, chunk) => sum + this.estimateTokens(chunk.content), 0);
    
    if (totalTokens <= maxTokens) return chunks;
    
    console.warn(`[DocumentChunker] Total tokens (${totalTokens}) exceed limit (${maxTokens}), truncating...`);
    
    const result: DocumentChunk[] = [];
    let currentTokens = 0;
    
    for (const chunk of chunks) {
      const chunkTokens = this.estimateTokens(chunk.content);
      if (currentTokens + chunkTokens > maxTokens) break;
      result.push(chunk);
      currentTokens += chunkTokens;
    }
    
    return result;
  }

  private detectBestStrategy(content: string): 'section-aware' | 'overlap' {
    const hasSections = /^(#{1,6}\s+.*|\d+\.(\d+\.)*\s+.*)/m.test(content);
    const isLong = content.length > 10000;
    return hasSections && isLong ? 'section-aware' : 'overlap';
  }
}
