# Groq ZIP Response Diagnosis

## Critical Issue: Groq Returning Binary ZIP Data

### Symptoms
```
[GroqLLMService] First 20 character codes: [
  24, 20, 24, 10, 80, 75, 3, 4, 20, 24, 20, 24,
  10, 80, 75, 3, 4, ...
]
```

- **80, 75** = "PK" (ZIP file signature)
- **3, 4** = ZIP header bytes
- Groq is returning a ZIP file instead of text!

## Root Cause Analysis

### Issue #1: INPUT DATA Regex Still Failing
Logs show: `[Orchestrator] No INPUT DATA section found in prompt`

This means:
1. The DOCX file might contain hidden formatting characters
2. The section headers might have extra spaces/newlines
3. The parser might be adding artifacts

### Issue #2: Groq API Bug with Prompt Format
When prompted with malformed/unusual input, Groq sometimes returns binary data instead of properly handling the error.

## Immediate Actions

### 1. Debug the Prompt File Itself

**Add this logging in generate.ts:**
```typescript
console.log('[API /generate] RAW prompt first 500 chars:');
console.log(JSON.stringify(input.prompt.substring(0, 500)));
console.log('[API /generate] Checking for binary data...');
const hasBinary = /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(input.prompt);
console.log('[API /generate] Contains binary data?', hasBinary);
```

### 2. Try Different Prompt Format

Instead of parsing DOCX, have business analysts provide prompts in **plain text .txt files** to eliminate parsing issues.

### 3. Test with Minimal Prompt

Create `/Users/davidschmid/RAG/Prompts/test-minimal.txt`:
```
SECTION TO GENERATE:
Purpose section

INPUT DATA:
- SOP0004
- Primary Context

OUTPUT FORMAT:
2 paragraphs
```

### 4. Switch to Larger Model

The 8B model might be more sensitive to prompt format issues. Try:
```typescript
// In groq-service.ts constructor
model: string = 'llama-3.1-70b-versatile'
```

## Fixes Implemented

### ✅ Better Regex for INPUT DATA
```typescript
const inputDataMatch = prompt.match(/INPUT DATA:?\s*(.*?)(?=\n+[A-Z][A-Z\s]*:|$)/is);
```

### ✅ ZIP File Detection
```typescript
if (firstTwo[0] === 80 && firstTwo[1] === 75) {
  throw new Error('Groq API returned binary ZIP data...');
}
```

### ✅ Zero Value Handling
```typescript
options.procedureChunks !== undefined ? options.procedureChunks : 5
```

## Next Steps

1. **Rebuild services:**
   ```bash
   cd src/orchestrator && npm run build
   cd ../llm-service && npm run build
   ```

2. **Add diagnostic logging** to see actual prompt content

3. **Test with minimal plain text prompt** to isolate issue

4. **Consider switching to 70B model** for better robustness

5. **If issue persists:** The DOCX parser might be corrupting the prompt. Use plain text files instead.

## Prompt Format Recommendation

Have business analysts use this **exact format** in a `.txt` file (not DOCX):

```
SECTION TO GENERATE:
Purpose section of Design and Development Plan

INPUT DATA:
- SOP for design control procedures (SOP0004)
- Primary Context information about the device

OUTPUT FORMAT:
2 paragraphs

LENGTH CONSTRAINT:
Maximum 2 paragraphs

CONTENT REQUIREMENTS:
- State that document defines planning/implementation/control
- Mention it's the master roadmap 
- Reference SOP that governs Design Control

TONE AND STYLE:
- Professional, third-person, passive voice
- Precise verbs: establishes, defines, governs, outlines

CONSTRAINTS:
- Follow ISO and FDA standards
- High confidence content (>95%)
```

## Suspected Root Cause

The DOCX file parser is likely adding formatting artifacts or binary characters that confuse Groq's API, causing it to return corrupted/binary responses.

**Recommendation:** Switch to plain text prompts until DOCX parsing can be debugged.
