# RAG Knowledge Base Context System

This directory contains YAML context files that define how the FDA 510(k) Compliance Analyzer "thinks" and executes analysis at different levels.

## Context Files Overview

### 1. `primary-context.yaml`
**Purpose:** Defines the app's core identity, role, and behavioral framework

**Contains:**
- App identity and core function
- AI persona characteristics (Regulatory Affairs Manager + Design Quality Engineer + Project Manager)
- Regulatory framework (21 CFR 807, 820, ISO standards)
- Document revision hierarchy (Alpha > Numeric > Draft)
- Source attribution requirements
- Human-in-the-loop triggers
- Traceability requirements
- Forbidden behaviors (never infer, hallucinate, edit originals, etc.)

**When to use:** Every RAG query should include primary context to maintain consistent AI behavior

---

### 2. `project-analysis.yaml`
**Purpose:** Defines how to analyze an entire 510(k) project holistically

**Contains:**
- Project completeness criteria (independent of target dates)
- Submission readiness requirements
- RTA (Refuse to Accept) blocking logic
- Project-level risk assessment
- Quality metrics for overall submission
- Traceability matrix requirements
- Narrative summary structure
- Analysis outputs (section status, gap reports, readiness assessment)

**When to use:** 
- Dashboard/project overview display
- Overall submission readiness assessment
- RTA checklist evaluation
- Project-level gap analysis

---

### 3. `phase-analysis.yaml`
**Purpose:** Defines phase-specific analysis contexts for Phases 1-4 (Concept, Feasibility, Development, Qualification)

**Contains for each phase:**
- Phase objective and maturity level
- Required documents and their approval status
- Completion criteria (exit requirements)
- Analysis focus (what to extract, validate, flag)
- Phase-specific risks and gap indicators
- Quality metrics
- Narrative summary structure
- Contextual triggers (how AI behavior changes)

**When to use:**
- Viewing/analyzing a specific phase
- Phase completion assessment
- Phase-specific document checklist validation
- Phase exit criteria evaluation

**Key insight:** The SAME document analyzed in different phases has DIFFERENT requirements applied to it.

---

### 4. `file-analysis.yaml`
**Purpose:** Defines how individual documents are analyzed within phase context

**Contains:**
- Phase context sensitivity (how file analysis changes by phase)
- Document type-specific behaviors (protocols, reports, design outputs)
- File-level error types (missing data, version conflicts, traceability gaps)
- Quality assessment criteria
- Narrative summary structure
- Examples showing same document analyzed differently in each phase

**When to use:**
- User clicks on individual file
- Document-level compliance check
- File quality assessment
- Context-aware document analysis

**Critical principle:** File analysis is **phase-aware** - if a file is viewed from Phase 1 folder, it's analyzed with Phase 1 requirements. Same file viewed from Phase 3 folder has Phase 3 requirements applied.

---

## Context Hierarchy

```
┌─────────────────────────────────────┐
│     PRIMARY CONTEXT                 │
│  (Always included in RAG queries)   │
│  - App identity & role              │
│  - Core behavioral rules            │
│  - Regulatory framework             │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│     ANALYSIS LEVEL CONTEXT          │
│  (Selected based on user view)      │
│                                     │
│  ┌────────────────────────────────┐ │
│  │  PROJECT-LEVEL ANALYSIS        │ │
│  │  When: Dashboard, overall view │ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌────────────────────────────────┐ │
│  │  PHASE-LEVEL ANALYSIS          │ │
│  │  When: Phase X folder selected │ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌────────────────────────────────┐ │
│  │  FILE-LEVEL ANALYSIS           │ │
│  │  When: Individual file clicked │ │
│  │  Requires: Phase context       │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Usage Patterns

### Example 1: User views project dashboard
```yaml
RAG Query Includes:
  - primary-context.yaml (full)
  - project-analysis.yaml (full)
  
Analysis produces:
  - Overall completion percentage
  - RTA checklist status
  - Project-level risk summary
  - Submission readiness: Go/No-Go
```

### Example 2: User clicks on "Phase 2 - Feasibility" folder
```yaml
RAG Query Includes:
  - primary-context.yaml (full)
  - phase-analysis.yaml (Phase 2 section only)
  
Analysis produces:
  - Phase 2 document checklist status
  - Phase 2 completion criteria evaluation
  - Phase 2 specific risks/gaps
  - Readiness for Phase 3 entry
```

### Example 3: User clicks on "Risk Management Workbook" from Phase 2 folder
```yaml
RAG Query Includes:
  - primary-context.yaml (full)
  - file-analysis.yaml (full)
  - phase-analysis.yaml (Phase 2 section for context)
  
Context Variables:
  - current_phase: 2
  - document_type: "Risk Management Workbook"
  
Analysis applies:
  - Phase 2 expectations for RMW (PHA, UFMECA, DFMECA completed)
  - Extracts: Proposed risk controls and design requirements
  - Flags: Unmitigated high-severity risks
  - Does NOT expect: Final risk acceptance (that's Phase 4)
```

### Example 4: User clicks SAME "Risk Management Workbook" from Phase 4 folder
```yaml
RAG Query Includes:
  - primary-context.yaml (full)
  - file-analysis.yaml (full)
  - phase-analysis.yaml (Phase 4 section for context)
  
Context Variables:
  - current_phase: 4
  - document_type: "Risk Management Workbook"
  
Analysis applies:
  - Phase 4 expectations for RMW (RMR signed with risk acceptance)
  - Extracts: Final risk profile, benefit-risk conclusion
  - Flags: Missing RMR signature, unacceptable residual risks
  - Validates: All residual risks in labeling
```

## Implementation Notes

### For RAG Service Implementation:

1. **Context Selection Logic:**
   ```typescript
   function selectContext(userView: ViewContext): string[] {
     const contexts = ['primary-context.yaml']; // Always included
     
     if (userView.type === 'project') {
       contexts.push('project-analysis.yaml');
     } else if (userView.type === 'phase') {
       contexts.push('phase-analysis.yaml');
       contexts.push(`phase_context: ${userView.phaseId}`);
     } else if (userView.type === 'file') {
       contexts.push('file-analysis.yaml');
       contexts.push('phase-analysis.yaml'); // For phase context
       contexts.push(`current_phase: ${userView.phaseId}`);
       contexts.push(`document_type: ${userView.documentType}`);
     }
     
     return contexts;
   }
   ```

2. **Context Injection:**
   - Load relevant YAML files
   - Parse and convert to text context
   - Inject into RAG query prompt before DHF document content
   - Provide phase/document metadata as structured variables

3. **Confidence Thresholds:**
   - AI confidence < 95% → Flag for human review
   - Conflicting data → Block synthesis, trigger human review
   - Missing required document → Flag gap, block submission if critical

4. **Blocking Logic:**
   - RTA item = Fail/Missing in Phase 4 → BLOCK final submission
   - Conflicting Alpha Rev documents → BLOCK synthesis
   - PPQ failure → BLOCK Phase 4 exit

### For UI Implementation:

```typescript
interface AnalysisRequest {
  projectId: string;
  viewType: 'project' | 'phase' | 'file';
  phaseId?: number; // Required for phase/file views
  filePath?: string; // Required for file view
  documentType?: string; // Required for file view
}

// UI passes context to orchestrator
async function analyzeWithContext(request: AnalysisRequest) {
  const context = {
    primary: loadYAML('primary-context.yaml'),
    analysis: selectAnalysisContext(request.viewType),
    phase: request.phaseId ? loadPhaseContext(request.phaseId) : null,
    variables: {
      current_phase: request.phaseId,
      document_type: request.documentType,
      view_type: request.viewType
    }
  };
  
  return orchestrator.analyze(request.projectId, context);
}
```

## Maintenance

### When to update context files:

- **primary-context.yaml**: When core regulatory framework changes, new standards added, or fundamental behavioral rules change
- **project-analysis.yaml**: When overall submission requirements change (new RTA checklist items, new 510(k) sections)
- **phase-analysis.yaml**: When PDP phase requirements change, new deliverables added, or exit criteria updated
- **file-analysis.yaml**: When new document types added or analysis patterns change

### Version Control:
- All context files are version controlled
- Changes should be reviewed by regulatory experts
- Breaking changes should increment major version
- Context file version included in analysis output for traceability

## Reference Documents

The context defined here is derived from:
- `PDP Guidebook.docx` (in `../reference-docs/`)
- Architecture documents (in `/architecture/`)
- FDA 510(k) guidance documents
- 21 CFR 807 and 820 regulations
- ISO 13485, 14971, 10993 standards

All context assertions are traceable to these source documents.
