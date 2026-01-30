# Context File Summarization Implementation

## Summary

Added LLM-generated executive summaries for Context files, matching the functionality that was already in place for SOP files. This is especially valuable for large predicate device documents.

## Changes Made

### 1. Added Context Summaries Cache Path
- New method `getContextSummariesCachePath()` 
- Stores summaries in system temp: `/tmp/phasergun-cache/context-summaries/`

### 2. Implemented Context File Summarization
**New method: `summarizeContextFile()`**
- Customized prompts based on context category:
  - **Predicates**: Focus on device name, regulatory clearance, similarities/differences, design features, clinical data
  - **Initiation**: Focus on project objectives, market analysis, target users, stakeholders
  - **Ongoing**: Focus on current status, decisions, risks, next steps
  - **Primary Context**: General focus areas

### 3. Implemented Context Summaries Generation & Caching
**New method: `generateContextSummaries()`**
- Generates LLM summaries for all Context files
- Uses SHA-256 content hashing to detect changes
- Caches summaries to avoid regenerating on each request
- Rate limits API calls (1 second between requests)
- Preserves timestamps for unchanged files

### 4. Updated retrieveRelevantContext()
- Now generates Context summaries alongside SOP summaries
- Loads Context files with category tagging
- Passes summaries to assembleContext()
- Added `contextSummariesGenerated` to metadata

### 5. Updated assembleContext() - Tiered Structure
**NEW TIER 1.6**: PROJECT CONTEXT OVERVIEW (Executive Summaries)
- Added between SOP summaries (TIER 1.5) and detailed sections (TIER 2-3)
- Provides high-level overview of Context files before detailed chunks

## Context Assembly Structure

```
TIER 1: Primary Context (YAML)
TIER 1.5: SOP Executive Summaries
TIER 1.6: Context File Executive Summaries ← NEW!
TIER 2: Retrieved Procedure Chunks (detailed)
TIER 3: Retrieved Context Chunks (detailed)
```

## Benefits

1. **Efficiency**: LLM gets high-level overview before detailed chunks
2. **Token Optimization**: Summaries are more concise than full documents
3. **Better Context**: Especially valuable for large files (e.g., 186KB predicate device)
4. **Caching**: Summaries reused across requests unless file changes
5. **Category-Aware**: Prompts tailored to document type (predicates vs initiation)

## Example Log Output

```
[EnhancedRAG] Generating Context file summaries...
[EnhancedRAG] No existing context summary cache found
[EnhancedRAG] Summarizing Market Analysis.pptx...
[GroqLLMService] Generating text with prompt length: 5300
[GroqLLMService] Response received in 1100ms (⚡ Groq LPU™)
[EnhancedRAG] Summarizing MicroSnare Full Document 163077A.VB.pdf...
[GroqLLMService] Generating text with prompt length: 187000
[GroqLLMService] Response received in 3500ms (⚡ Groq LPU™)
[EnhancedRAG] ✓ Context file summaries complete
```

## Cache Location

- **SOP Summaries**: `/tmp/phasergun-cache/sop-summaries/{project-hash}/sop-summaries.json`
- **Context Summaries**: `/tmp/phasergun-cache/context-summaries/{project-hash}/context-summaries.json`

## Files Modified

- `src/rag-service/src/enhanced-rag-service.ts`
  - Added `getContextSummariesCachePath()`
  - Added `summarizeContextFile()`
  - Added `generateContextSummaries()`
  - Updated `retrieveRelevantContext()`
  - Updated `assembleContext()`

## Testing

To test with your actual Context files:
```bash
cd src/api-server
npm run dev
```

Then make a generation request. You should see:
1. Context files being summarized (first run)
2. Summaries cached for subsequent runs
3. Summaries included in the context sent to LLM

## Next Steps

The implementation is complete and ready for testing with your actual Context files, especially the predicate device documents in the Predicates folder.
