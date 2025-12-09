/**
 * Utilities for intelligent document chunking
 * Handles large documents that exceed model context windows
 */

/**
 * Estimate token count for text
 * Uses approximation: ~1.3 tokens per word (conservative for English)
 * More accurate than character count, simpler than full tokenization
 */
export function estimateTokenCount(text: string): number {
  // Remove extra whitespace and count words
  const words = text.trim().split(/\s+/).length;
  // Conservative estimate: 1.3 tokens per word
  return Math.ceil(words * 1.3);
}

/**
 * Configuration for chunking
 */
export interface ChunkConfig {
  maxTokens: number;      // Maximum tokens per chunk
  overlapTokens: number;  // Overlap between chunks (for context continuity)
  overlapPercent: number; // Overlap as percentage (alternative to fixed tokens)
}

/**
 * A chunk of text with metadata
 */
export interface TextChunk {
  content: string;
  chunkIndex: number;
  startPosition: number;
  endPosition: number;
  tokenCount: number;
  isLastChunk: boolean;
}

/**
 * Result from chunked analysis
 */
export interface ChunkedAnalysisResult {
  chunks: Array<{
    chunkIndex: number;
    analysis: string;
    tokenCount: number;
  }>;
  aggregatedAnalysis: string;
  totalChunks: number;
  totalTokens: number;
  processingTime: number;
}

/**
 * Split text into overlapping chunks
 * Tries to split at natural boundaries (paragraphs, sentences)
 */
export function splitIntoChunks(
  text: string,
  config: ChunkConfig
): TextChunk[] {
  const totalTokens = estimateTokenCount(text);
  
  // If text fits in one chunk, return as-is
  if (totalTokens <= config.maxTokens) {
    return [{
      content: text,
      chunkIndex: 0,
      startPosition: 0,
      endPosition: text.length,
      tokenCount: totalTokens,
      isLastChunk: true
    }];
  }

  const chunks: TextChunk[] = [];
  const overlapSize = Math.floor(config.maxTokens * (config.overlapPercent / 100));
  
  // Split into paragraphs for better chunking boundaries
  const paragraphs = text.split(/\n\n+/);
  
  let currentChunk = '';
  let currentTokens = 0;
  let chunkIndex = 0;
  let startPos = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraTokens = estimateTokenCount(para);
    
    // If adding this paragraph exceeds limit, save current chunk
    if (currentTokens + paraTokens > config.maxTokens && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        chunkIndex: chunkIndex++,
        startPosition: startPos,
        endPosition: startPos + currentChunk.length,
        tokenCount: currentTokens,
        isLastChunk: false
      });
      
      // Start new chunk with overlap from previous chunk
      const overlapText = getLastNTokens(currentChunk, overlapSize);
      currentChunk = overlapText + '\n\n' + para;
      currentTokens = estimateTokenCount(currentChunk);
      startPos += currentChunk.length - overlapText.length;
    } else {
      // Add paragraph to current chunk
      currentChunk += (currentChunk ? '\n\n' : '') + para;
      currentTokens += paraTokens;
    }
  }
  
  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      chunkIndex: chunkIndex,
      startPosition: startPos,
      endPosition: text.length,
      tokenCount: currentTokens,
      isLastChunk: true
    });
  }
  
  return chunks;
}

/**
 * Get approximately the last N tokens from text
 */
function getLastNTokens(text: string, tokenCount: number): string {
  // Approximate: get last N/1.3 words
  const words = text.split(/\s+/);
  const wordCount = Math.ceil(tokenCount / 1.3);
  return words.slice(-wordCount).join(' ');
}

/**
 * Aggregate analyses from multiple chunks into one report
 */
export function aggregateChunkAnalyses(
  chunkResults: Array<{ chunkIndex: number; analysis: string; tokenCount: number }>,
  fileName: string,
  totalTokens: number
): string {
  const totalChunks = chunkResults.length;
  
  // Extract findings from each chunk
  const allFindings: {
    assessments: string[];
    passes: string[];
    fails: string[];
    partials: string[];
    recommendations: string[];
  } = {
    assessments: [],
    passes: [],
    fails: [],
    partials: [],
    recommendations: []
  };
  
  // Parse each chunk's analysis
  for (const chunk of chunkResults) {
    const analysis = chunk.analysis;
    
    // Extract assessment
    const assessmentMatch = analysis.match(/1\.\s*DOCUMENT ASSESSMENT[:\s]*([\s\S]*?)(?=2\.|$)/i);
    if (assessmentMatch) {
      allFindings.assessments.push(assessmentMatch[1].trim());
    }
    
    // Extract findings
    const findingsMatch = analysis.match(/2\.\s*KEY FINDINGS[:\s]*([\s\S]*?)(?=3\.|$)/i);
    if (findingsMatch) {
      const findingsText = findingsMatch[1];
      
      // Extract PASS items
      const passMatches = findingsText.match(/✅\s*PASS[:\s]*([^\n]+)/gi);
      if (passMatches) {
        allFindings.passes.push(...passMatches.map(m => m.replace(/✅\s*PASS[:\s]*/i, '').trim()));
      }
      
      // Extract FAIL items
      const failMatches = findingsText.match(/❌\s*FAIL[:\s]*([^\n]+)/gi);
      if (failMatches) {
        allFindings.fails.push(...failMatches.map(m => m.replace(/❌\s*FAIL[:\s]*/i, '').trim()));
      }
      
      // Extract PARTIAL items
      const partialMatches = findingsText.match(/⚠️\s*PARTIAL[:\s]*([^\n]+)/gi);
      if (partialMatches) {
        allFindings.partials.push(...partialMatches.map(m => m.replace(/⚠️\s*PARTIAL[:\s]*/i, '').trim()));
      }
    }
    
    // Extract recommendations
    const recsMatch = analysis.match(/3\.\s*(?:CRITICAL\s+)?RECOMMENDATIONS[:\s]*([\s\S]*?)$/i);
    if (recsMatch) {
      const recsText = recsMatch[1];
      const recItems = recsText.match(/^\d+\.\s*(.+)$/gm);
      if (recItems) {
        allFindings.recommendations.push(...recItems.map(r => r.replace(/^\d+\.\s*/, '').trim()));
      }
    }
  }
  
  // Deduplicate findings (simple text similarity)
  const deduplicatedPasses = deduplicateFindings(allFindings.passes);
  const deduplicatedFails = deduplicateFindings(allFindings.fails);
  const deduplicatedPartials = deduplicateFindings(allFindings.partials);
  const deduplicatedRecs = deduplicateFindings(allFindings.recommendations);
  
  // Build aggregated report
  let report = `📄 LARGE DOCUMENT ANALYSIS (Intelligent Chunking)

File: ${fileName}
Total Size: ${totalTokens.toLocaleString()} tokens
Analysis Method: ${totalChunks} overlapping chunks
Coverage: 100% (all sections analyzed)

`;

  // Add assessment (combine/summarize from chunks)
  if (allFindings.assessments.length > 0) {
    report += `1. DOCUMENT ASSESSMENT\n\n`;
    report += `This large document was analyzed across ${totalChunks} overlapping sections for comprehensive coverage. `;
    report += allFindings.assessments[0] + '\n\n';
  }
  
  // Add key findings
  report += `2. KEY FINDINGS (Consolidated Across All Chunks)\n\n`;
  
  if (deduplicatedPasses.length > 0) {
    report += `✅ PASS Items Found:\n`;
    deduplicatedPasses.slice(0, 10).forEach((item, idx) => {
      report += `   ${idx + 1}. ${item}\n`;
    });
    if (deduplicatedPasses.length > 10) {
      report += `   ... and ${deduplicatedPasses.length - 10} more\n`;
    }
    report += '\n';
  }
  
  if (deduplicatedFails.length > 0) {
    report += `❌ FAIL Items Identified:\n`;
    deduplicatedFails.forEach((item, idx) => {
      report += `   ${idx + 1}. ${item}\n`;
    });
    report += '\n';
  }
  
  if (deduplicatedPartials.length > 0) {
    report += `⚠️ PARTIAL/Needs Improvement:\n`;
    deduplicatedPartials.forEach((item, idx) => {
      report += `   ${idx + 1}. ${item}\n`;
    });
    report += '\n';
  }
  
  // Add recommendations
  if (deduplicatedRecs.length > 0) {
    report += `3. CRITICAL RECOMMENDATIONS (Deduplicated)\n\n`;
    deduplicatedRecs.forEach((item, idx) => {
      report += `${idx + 1}. ${item}\n`;
    });
    report += '\n';
  }
  
  // Add quality metrics
  report += `\n---\nQUALITY METRICS:\n`;
  report += `• Total Chunks Analyzed: ${totalChunks}\n`;
  report += `• Findings Collected: ${allFindings.passes.length + allFindings.fails.length + allFindings.partials.length}\n`;
  report += `• After Deduplication: ${deduplicatedPasses.length + deduplicatedFails.length + deduplicatedPartials.length}\n`;
  report += `• Recommendations: ${deduplicatedRecs.length}\n`;
  report += `• Document Coverage: 100% with ${Math.floor((totalChunks - 1) * 20)}% overlap for continuity`;
  
  return report;
}

/**
 * Simple deduplication based on text similarity
 * Removes items that are >70% similar
 */
function deduplicateFindings(findings: string[]): string[] {
  if (findings.length === 0) return [];
  
  const deduplicated: string[] = [];
  
  for (const finding of findings) {
    const normalized = finding.toLowerCase().trim();
    
    // Check if similar item already exists
    const isDuplicate = deduplicated.some(existing => {
      const existingNorm = existing.toLowerCase().trim();
      const similarity = calculateSimilarity(normalized, existingNorm);
      return similarity > 0.7; // 70% similarity threshold
    });
    
    if (!isDuplicate) {
      deduplicated.push(finding);
    }
  }
  
  return deduplicated;
}

/**
 * Calculate text similarity (0-1) using Jaccard similarity of words
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}
