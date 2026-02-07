# Implementation Summary: Retrieval Policy Enforcement

## Overview
Fixed the retrieval logic to correctly enforce `retrieval_priority="on_demand"` rules from `primary-context.yaml`. Files in `Context/General/` and `Context/Regulatory Strategy/` are now **only** retrieved when explicitly referenced in prompts using bracket notation.

---

## Changes Made

### 1. **primary-context.yaml** - Clarified Usage Rules

**Before:**
```yaml
general:
  usage: "Only retrieve when explicitly referenced in prompts"
  
retrieval_scope:
  rule: "Only retrieve @knowledge_sources.regulatory_strategy and @knowledge_sources.general when explicitly referenced"
  action: "Prevent unnecessary context loading"
```

**After:**
```yaml
general:
  usage: "Only use in content generation if explicitly referenced in the prompts (@generation_workflow.input.prompts)"
  
retrieval_scope:
  rule: "Only retrieve @knowledge_sources.regulatory_strategy and @knowledge_sources.general when explicitly referenced via @reference_notation.context"
  action: "Exclude from semantic search unless [Context|Regulatory Strategy|...] or [Context|General|...] pattern detected in prompt"
```

**Impact:** Makes it crystal clear that these folders require explicit `[Context|folder|file]` references.

---

### 2. **enhanced-rag-service.ts** - Added Reference Parsing

Added new method `parseExplicitContextReferences()` that scans prompts for bracket notation:

```typescript
private parseExplicitContextReferences(prompt: string): Set<'regulatory-strategy' | 'general'> {
  const referenced = new Set<'regulatory-strategy' | 'general'>();
  
  // Pattern: [Context|{folder}|{filename}]
  const contextPattern = /\[Context\|([^|\]]+)\|[^\]]+\]/gi;
  let match;
  
  while ((match = contextPattern.exec(prompt)) !== null) {
    const folder = match[1].trim().toLowerCase();
    
    if (folder === 'regulatory strategy' || folder === 'regulatory-strategy') {
      referenced.add('regulatory-strategy');
    } else if (folder === 'general') {
      referenced.add('general');
    }
  }
  
  return referenced;
}
```

**Detects patterns like:**
- `[Context|General|MicroSnare.pdf]` → Includes General folder
- `[Context|Regulatory Strategy|Predicate.docx]` → Includes Regulatory Strategy folder
- No bracket reference → Excludes both folders

---

### 3. **enhanced-rag-service.ts** - Implemented Filtering Logic

Modified `retrieveRelevantContext()` to enforce the policy:

#### A. **Pre-Retrieval Policy Check**
```typescript
// 1. Parse prompt for explicit on-demand references
const explicitlyReferencedCategories = this.parseExplicitContextReferences(prompt);
const excludeGeneral = !explicitlyReferencedCategories.has('general');
const excludeRegStrategy = !explicitlyReferencedCategories.has('regulatory-strategy');

console.log('[EnhancedRAG] 🔒 RETRIEVAL POLICY ENFORCEMENT:');
if (excludeGeneral) {
  console.log('[EnhancedRAG]    ⛔ Context/General/ EXCLUDED (not explicitly referenced in prompt)');
} else {
  console.log('[EnhancedRAG]    ✅ Context/General/ INCLUDED (explicitly referenced in prompt)');
}
```

#### B. **Summary Generation Filtering**
```typescript
// Filter out on-demand categories from summaries
const filteredContextFiles = contextFilesWithCategory.filter(cf => {
  if (cf.contextCategory === 'general' && excludeGeneral) {
    console.log(`[EnhancedRAG] ⏭️  Excluding summary for ${cf.doc.fileName} (General folder, not referenced)`);
    return false;
  }
  if (cf.contextCategory === 'regulatory-strategy' && excludeRegStrategy) {
    console.log(`[EnhancedRAG] ⏭️  Excluding summary for ${cf.doc.fileName} (Regulatory Strategy folder, not referenced)`);
    return false;
  }
  return true;
});
```

#### C. **Vector Search Results Filtering**
```typescript
// ENFORCE RETRIEVAL POLICY: Filter out on-demand categories
const originalContextCount = contextResults.length;
contextResults = contextResults.filter(result => {
  const category = result.entry.metadata.contextCategory;
  
  if (category === 'general' && excludeGeneral) {
    console.log(`[EnhancedRAG] ⏭️  Filtered out: ${result.entry.metadata.fileName} (General folder, not referenced)`);
    return false;
  }
  
  if (category === 'regulatory-strategy' && excludeRegStrategy) {
    console.log(`[EnhancedRAG] ⏭️  Filtered out: ${result.entry.metadata.fileName} (Regulatory Strategy folder, not referenced)`);
    return false;
  }
  
  return true;
});
```

---

## Behavior Changes

### **Before Fix:**
```
User Prompt: "Write DDP Scope section"
↓
Vector Search: Searches ALL context categories (including General)
↓
Result: MicroSnare document included in sources (based on semantic similarity)
❌ INCORRECT: Violates retrieval_priority="on_demand"
```

### **After Fix:**
```
User Prompt: "Write DDP Scope section"
↓
Policy Check: No [Context|General|...] found → Exclude General
↓
Vector Search: Searches only approved categories (excludes General)
↓
Result: MicroSnare document NOT included
✅ CORRECT: Respects retrieval_priority="on_demand"
```

---

## Example Log Output

### **Scenario 1: No Explicit Reference (General Excluded)**
```
[EnhancedRAG] 🔒 RETRIEVAL POLICY ENFORCEMENT:
[EnhancedRAG]    ⛔ Context/General/ EXCLUDED (not explicitly referenced in prompt)
[EnhancedRAG]    ⛔ Context/Regulatory Strategy/ EXCLUDED (not explicitly referenced in prompt)
[EnhancedRAG] ⏭️  Filtered out: MicroSnare Full Document 163077A.VB.pdf (General folder, not referenced)
[EnhancedRAG] 🔒 FILTERING APPLIED: 3 context chunks excluded due to retrieval_priority="on_demand"
```

### **Scenario 2: Explicit Reference (General Included)**
```
User prompt contains: [Context|General|MicroSnare.pdf]

[EnhancedRAG] 🔒 RETRIEVAL POLICY ENFORCEMENT:
[EnhancedRAG]    ✅ Context/General/ INCLUDED (explicitly referenced in prompt)
[EnhancedRAG]    ⛔ Context/Regulatory Strategy/ EXCLUDED (not explicitly referenced in prompt)
[EnhancedRAG] 📄 Context files included in prompt:
[EnhancedRAG]    ✓ general/MicroSnare Full Document 163077A.VB.pdf (2 chunks)
```

---

## Files Modified

1. ✅ **src/rag-service/knowledge-base/context/primary-context.yaml**
   - Tightened language for `general.usage` and `regulatory_strategy.usage`
   - Enhanced `operational_rules.retrieval_scope` with explicit action

2. ✅ **src/rag-service/src/enhanced-rag-service.ts**
   - Added `parseExplicitContextReferences()` method
   - Added filtering logic in `retrieveRelevantContext()` 
   - Added comprehensive logging for transparency

---

## Testing Recommendations

### **Test Case 1: Verify Exclusion (Default Behavior)**
```typescript
// Prompt WITHOUT explicit references
const prompt = "Write the Purpose section of a DDP";

// Expected: General and Regulatory Strategy folders excluded
// Expected log: "⛔ Context/General/ EXCLUDED"
```

### **Test Case 2: Verify Inclusion (Explicit Reference)**
```typescript
// Prompt WITH explicit reference
const prompt = `
Write the Purpose section.
Reference: [Context|General|Background-Info.pdf]
`;

// Expected: General folder included
// Expected log: "✅ Context/General/ INCLUDED"
```

### **Test Case 3: Verify Regulatory Strategy**
```typescript
// Prompt WITH regulatory strategy reference
const prompt = `
Write competitive analysis.
Reference: [Context|Regulatory Strategy|Predicate-Device.docx]
`;

// Expected: Regulatory Strategy folder included
// Expected log: "✅ Context/Regulatory Strategy/ INCLUDED"
```

---

## Key Implementation Details

### **Always Included (No Filtering):**
- ✅ Master Record (`retrieval_priority: "primary"`)
- ✅ Procedures/SOPs (`retrieval_priority: "high"`)
- ✅ Context/Initiation (`retrieval_priority: implicit)
- ✅ Context/Ongoing (`retrieval_priority: implicit`)
- ✅ Context/Predicates (`retrieval_priority: implicit`)

### **Conditionally Included (Requires Explicit Reference):**
- 🔒 Context/General (`retrieval_priority: "on_demand"`)
- 🔒 Context/Regulatory Strategy (`retrieval_priority: "on_demand"`)

### **Never Cached (Always Parsed Fresh):**
- ⏭️ Context/Prompt (excluded from fingerprinting)

---

## Impact

✅ **Fixes the issue where MicroSnare document was incorrectly included**
✅ **Correctly enforces primary-context.yaml retrieval rules**
✅ **Provides transparency through detailed logging**
✅ **Maintains backward compatibility for other folders**
✅ **Master Record is always included (as specified)**

---

## Next Steps

1. **Clear cache** to force rebuild with new logic:
   ```bash
   rm -rf $TMPDIR/phasergun-cache
   ```

2. **Test with your original prompt** ("Rohun - DDP Scope - DAVID - V1.0.docx")
   - Expected: MicroSnare document should NOT appear in sources
   - Expected: Only Initiation, Ongoing, Predicates folders included

3. **Test with explicit reference** to verify inclusion works:
   ```
   Add to prompt: [Context|General|MicroSnare.pdf]
   Expected: MicroSnare document SHOULD appear
   ```

---

## Questions?

If you notice any issues or need adjustments to the filtering logic, let me know!
