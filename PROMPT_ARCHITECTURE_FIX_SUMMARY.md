# Prompt Architecture Fix - Summary

## Problem Identified

The application was generating analytical summaries instead of direct, concise content as requested by business analysts. For example:

**Expected Output:**
```
This document serves as the Project Plan for the design and development of the Parachute device. 
The commercial distribution strategy will be to market initially in the United States and Europe.
As defined by the SOP0004 (Design Control Procedure)...
```

**Actual Output:**
```
Based on the provided text, it appears to be a collection of documents related to a medical device company...
Here are some key points that can be extracted from the text:
1. **SOPs**: The company has a set of SOPs...
```

## Root Cause Analysis

The LLM was interpreting the massive RAG context as "information to analyze" rather than "reference materials to inform writing." The prompt structure was:

```
=== PRIMARY CONTEXT: PHASERGUN AI REGULATORY ENGINEER ===
[200+ lines of YAML configuration]

=== COMPANY PROCEDURES OVERVIEW (Executive Summaries) ===
[SOP summaries]

=== RELEVANT PROCEDURE DETAILS (Retrieved Sections) ===
[Detailed chunks with similarity scores]

=== USER REQUEST ===
Write the "Purpose" section...
```

By the time the LLM reached "USER REQUEST", it had already processed thousands of tokens of content, leading it to believe its job was to **analyze and summarize** rather than **directly write**.

## Solution: Three-Tier Prompt Architecture

We restructured the prompt into three distinct tiers:

### TIER 1: Role & Behavioral Instructions (WHO you are, HOW to behave)
```
=== YOUR ROLE AND CRITICAL INSTRUCTIONS ===

You are PhaserGun AI, an AI regulatory documentation expert.

CRITICAL BEHAVIORAL RULES:
1. Write DIRECTLY in response to the user's task (provided at the end)
2. Do NOT analyze or summarize the reference materials below
3. Do NOT provide meta-commentary like "Based on the provided documents..."
4. Do NOT start with "Here is..." or "The following is..."
5. Follow the EXACT format, tone, length, and style specified in the user's request
6. Use reference materials to inform your writing, but write as if you are the author
7. If the user specifies word count or paragraph limits, strictly adhere to them
8. Use precise, professional language appropriate for regulatory documentation

REGULATORY STANDARDS YOU FOLLOW:
- FDA 21 CFR Part 820.30: Design Controls
- ISO 13485: Quality Management Systems
- ISO 14971: Risk Management
```

### TIER 2: Reference Materials (WHAT you know)
```
=== REFERENCE MATERIALS ===
Below are materials provided for your reference. Use them to inform your writing,
but remember: your task is to WRITE what the user requests, not to analyze these materials.

--- Company Procedures (SOPs) ---
[SOP summaries]

--- Project Context Summaries ---
[Context file summaries]

--- Detailed Procedure Sections (Retrieved for Relevance) ---
[Detailed chunks]

--- Detailed Project Context (Retrieved for Relevance) ---
[Context chunks by category]
```

### TIER 3: User Task (WHAT to write)
```
=== YOUR SPECIFIC TASK ===

This is what you must do. Read carefully and follow these instructions precisely:

[USER'S PROMPT FROM BUSINESS ANALYST]

Remember: Write DIRECTLY as requested above. Do not analyze, do not summarize, 
do not provide meta-commentary. Simply write the requested content following 
the exact specifications provided.
```

## Changes Made

### 1. **enhanced-rag-service.ts** - `assembleContext()` Method

**Before:**
- Dumped entire primary-context.yaml as "information"
- Listed reference materials without behavioral framing
- User request was buried at the end
- No scope constraints to prevent expansion beyond requested section

**After:**
- Extracts behavioral instructions from primary context
- Clearly labels reference materials as "for your reference"
- Removes similarity scores and metadata clutter
- Simplified file references (e.g., `[SOP0004.docx]` instead of `--- [SOP0004.docx] Section 3 (Similarity: 87.3%) ---`)
- **Added SCOPE ENFORCEMENT section with absolute requirements**
- **Added VIOLATION EXAMPLES showing what NOT to do**
- Reserves TIER 3 for orchestrator to append user task

### 2. **orchestrator/index.ts** - `generateFromPrompt()` Method

**Before:**
```typescript
const fullPrompt = `${ragContext}\n\n=== USER REQUEST ===\n${input.prompt}`;
```

**After:**
```typescript
const fullPrompt = `${ragContext}=== YOUR SPECIFIC TASK ===

This is what you must do. Read carefully and follow these instructions precisely:

${input.prompt}

MANDATORY ENFORCEMENT RULES
You MUST follow these absolute constraints:

1. SCOPE: Write ONLY what is requested above. If it says "Purpose section" → write ONLY Purpose, nothing else
2. LENGTH: Respect ALL length limits (e.g., "2 paragraphs" = exactly 2 paragraphs, not 20)
3. FORMAT: Follow the exact format specified (paragraphs, bullets, tables, etc.)
4. STOP: When you complete the requested section, STOP immediately. Do NOT continue to other sections

VIOLATION PENALTY: Generating content beyond the requested scope will result in rejection.

Now write ONLY what was requested above. Begin immediately with the content - no preamble, no "Here is...", no analysis.`;
```

### 3. **enhanced-rag-service.ts** - `buildRAGContext()` Method (Legacy Support)

Updated the older `buildRAGContext()` method to also use the new three-tier structure for backward compatibility.

## Key Principles Applied

1. **Role-First Architecture**: Define WHO the AI is before presenting WHAT it knows
2. **Behavioral Constraints**: Explicit instructions on HOW to behave (write directly, don't analyze)
3. **Clear Separation**: Reference materials are clearly labeled as "for informing writing"
4. **Task Emphasis**: User's request is presented last with strong emphasis and repetition
5. **Negative Instructions**: Tell the LLM what NOT to do (don't analyze, don't summarize)
6. **Specification Adherence**: Emphasize following exact format, tone, and length requirements
7. **Scope Enforcement**: Aggressive constraints to prevent expansion beyond requested section
8. **Violation Examples**: Show concrete examples of what NOT to do (❌) vs correct behavior (✅)
9. **Hard Limits**: Treat length constraints as absolute requirements, not suggestions
10. **Penalty Framing**: Frame violations as having consequences to strengthen compliance

## Impact on Business Analysts

✅ **No changes required to their prompts!**

Business analysts can continue writing prompts exactly as they do now:

```
Persona: You are a lead R&D engineer...
Context: You are in Phase I...
Task: Write the "Purpose" section...
Output Format: This section should be concise...
Constraints: Everything should follow ISO and FDA standards...
Tone and Style: Use professional, third-person, passive voice...
```

The fix is entirely in how we **frame** their prompt with the RAG context.

## Testing Recommendations

1. **Test with existing prompts** from the Context/Prompt folder
2. **Validate output format** matches business analyst expectations
3. **Check for analytical language** like "Based on the documents...", "Here is...", etc.
4. **Verify length constraints** are being followed (e.g., "do not exceed two paragraphs")
5. **Confirm tone and style** matches regulatory documentation standards

## Before/After Example

### BEFORE (Analytical)
```
Based on the provided text, it appears to be a collection of documents related 
to a medical device company, eLum Technologies. The documents include Standard 
Operating Procedures (SOPs), project context documents, and regulatory documents.

Here are some key points that can be extracted from the text:

1. **SOPs**: The company has a set of SOPs that outline the procedures for 
   various activities...
```

### AFTER (Direct, Concise)
```
This document serves as the Project Plan for the design and development of the 
Parachute device. The commercial distribution strategy will be to market 
initially in the United States and Europe.

As defined by the SOP0004 (Design Control Procedure):
1.1. A Design and Development Project Plan is "a comprehensive plan that 
describes or references the key design and development activities..."
```

## Additional Improvements for Future Consideration

1. **System Message Support**: For LLMs that support system messages (Anthropic, OpenAI, Mistral), extract behavioral instructions into a system message for even stronger constraint enforcement

2. **Example-Based Learning**: Add 1-2 example outputs at the end of TIER 1 showing the desired writing style

3. **Dynamic Instruction Adjustment**: Parse the user's prompt to detect specific requirements (e.g., word count, section format) and emphasize those in the behavioral instructions

4. **Post-Processing Validation**: After generation, check for analytical phrases like "Based on", "Here is", "The following" and flag for review

## Files Modified

1. **src/rag-service/src/enhanced-rag-service.ts**
   - `assembleContext()` - Complete rewrite with three-tier structure
   - `buildRAGContext()` - Updated for backward compatibility

2. **src/orchestrator/src/index.ts**
   - `generateFromPrompt()` - Enhanced TIER 3 user task formatting

## Rollback Instructions

If issues arise, you can rollback by:

```bash
git checkout HEAD~1 src/rag-service/src/enhanced-rag-service.ts
git checkout HEAD~1 src/orchestrator/src/index.ts
```

## Monitoring and Validation

After deployment, monitor for:
- ✅ Direct writing (starts immediately with content)
- ✅ No meta-commentary
- ✅ Follows length/format constraints (e.g., "2 paragraphs" = exactly 2 paragraphs)
- ✅ Professional regulatory tone
- ✅ Stops after completing requested section (no scope creep)
- ❌ Analytical summaries
- ❌ "Based on the documents..." phrasing
- ❌ "Here is..." introductions
- ❌ Generating sections beyond what was requested
- ❌ Exceeding specified length limits

## Critical Success Metrics

For the "Purpose" section example, success means:
- Output is 2 paragraphs (not 20 sections)
- Content is ONLY the Purpose section (no Background, Scope, etc.)
- Starts immediately with "This document serves..." (no preamble)
- References SOPs appropriately
- Stops after completing the 2nd paragraph

---

**Implementation Date**: January 30, 2026
**Status**: ✅ Complete - Ready for Testing
**Latest Update**: Added aggressive scope enforcement to prevent generation beyond requested sections
