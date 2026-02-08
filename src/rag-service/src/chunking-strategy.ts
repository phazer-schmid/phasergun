/**
 * Chunking Strategy
 * Text chunking algorithms for SOPs and context files
 */

/**
 * Chunk SOPs with section-aware splitting
 * Detects headers (##, ###, numbered sections) and keeps sections together
 */
export function chunkSectionAware(content: string, fileName: string, filePath: string): string[] {
  const chunks: string[] = [];
  const MIN_CHUNK_SIZE = 2000; // ~500 tokens
  const MAX_CHUNK_SIZE = 4000; // ~1000 tokens
  
  // Detect section headers: ##, ###, numbered (1., 1.1, etc.)
  // NOTE: /m flag only — do NOT use /g here.  RegExp.prototype.test() with /g
  // advances lastIndex after each match; calling .test() on successive lines
  // from a /g regex silently skips any header whose length < the previous lastIndex.
  const sectionRegex = /^(#{1,6}\s+.*|\d+\.(\d+\.)*\s+.*)$/m;
  const lines = content.split('\n');
  
  let currentChunk = '';
  let currentSection = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeader = sectionRegex.test(line.trim());
    
    if (isHeader && currentChunk.length > MIN_CHUNK_SIZE) {
      // Save current chunk and start new one
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = line + '\n';
    } else if (currentChunk.length + line.length > MAX_CHUNK_SIZE && currentChunk.length > MIN_CHUNK_SIZE) {
      // Chunk is getting too large, split here
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  
  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  // If no sections detected, fall back to paragraph chunking
  if (chunks.length === 0 || (chunks.length === 1 && chunks[0].length > MAX_CHUNK_SIZE)) {
    return chunkWithOverlap(content, fileName, filePath);
  }
  
  return chunks;
}

/**
 * Chunk context files with paragraph-based splitting and overlap
 * Chunk size: 500-1000 tokens (~2000-4000 chars)
 * Overlap: 100 tokens (~400 chars)
 */
export function chunkWithOverlap(content: string, fileName: string, filePath: string): string[] {
  const chunks: string[] = [];
  const TARGET_CHUNK_SIZE = 3000; // ~750 tokens
  const MAX_CHUNK_SIZE = 4000; // ~1000 tokens
  const OVERLAP_SIZE = 400; // ~100 tokens
  
  // Split by paragraphs
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
  
  let currentChunk = '';
  let previousOverlap = '';
  
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    
    // Start new chunk with overlap from previous
    if (currentChunk.length === 0 && previousOverlap) {
      currentChunk = previousOverlap + '\n\n';
    }
    
    // Check if adding this paragraph would exceed max size
    if (currentChunk.length > 0 && (currentChunk.length + trimmed.length) > MAX_CHUNK_SIZE) {
      // Save current chunk
      chunks.push(currentChunk.trim());
      
      // Extract overlap (last OVERLAP_SIZE characters)
      previousOverlap = currentChunk.substring(Math.max(0, currentChunk.length - OVERLAP_SIZE)).trim();
      
      // Start new chunk with overlap
      currentChunk = previousOverlap + '\n\n' + trimmed;
    } else {
      // Add paragraph to current chunk
      if (currentChunk.length > 0) {
        currentChunk += '\n\n' + trimmed;
      } else {
        currentChunk = trimmed;
      }
    }
  }
  
  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [content];
}
