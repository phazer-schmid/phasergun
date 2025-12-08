# DHF Document Checklist - Dynamic Scanning Update

## Overview
Updated the DHF Document Checklist to use **dynamic document scanning** instead of static mock data. Documents are now discovered and classified in real-time using AI-powered analysis.

## Changes Made

### 1. Frontend UI Updates (`project-dashboard.component.html`)
- **Removed**: Static document reference display (PS0228.03, PS0228.A, etc.)
- **Updated**: Badge display to show:
  - "NOT FOUND" (orange) - when no documents are found for this DHF category
  - "IN PROGRESS" (yellow) - when partially complete
  - "X DOC(S)" (green) - when documents are found, showing the count
- **Changed**: Document reference line now shows the submission section instead of static references

### 2. DHF Service Updates (`dhf.service.ts`)
- **Removed**: All static mock documents from `dhfPhaseMapping`
- **Updated**: All DHF files now initialize with empty `documents: []` arrays
- **Behavior**: Documents are only populated after clicking "Scan Documents" button

### 3. Component Logic Updates (`project-dashboard.component.ts`)
- **Removed**: `formatDocumentReference()` method (no longer needed)
- **Maintained**: Phase filtering - when a specific phase is selected, only that phase's folder is scanned

### 4. Scanner Improvements (`dhf-scanner/src/index.ts`)
- **Enhanced**: LLM classification prompt with:
  - More context (3000 chars instead of 2000)
  - Detailed matching criteria for each document type
  - Better structured category information
  - More specific instructions for classification
- **Improved**: Category formatting for better LLM understanding
- **Added**: More detailed logging of classification reasoning

## How It Works Now

### Step 1: User Interaction
1. User creates a project and specifies the project folder path
2. User navigates to project dashboard
3. User selects either "Entire Project" or a specific "Phase" from the left sidebar

### Step 2: Scan Triggered
1. User clicks "🔄 Scan Documents" button
2. System determines scan scope:
   - If "Entire Project" is selected → scans all Phase 1-4 folders
   - If "Phase X" is selected → scans only Phase X folder
3. Confirmation dialog appears for entire project scans

### Step 3: Document Discovery
1. Scanner looks for phase folders in the project directory:
   - Matches patterns: "Phase 1", "Phase_1", "phase1", "P1", etc.
   - Recursively finds all supported document files (.pdf, .docx, .txt, .md, .doc)
2. Extracts text content from each document:
   - PDF files → text extraction
   - Word files → text extraction
   - Text files → direct read
3. Filters out files larger than 10MB

### Step 4: AI Classification
For each document:
1. Sends document content (first 3000 chars) to Claude AI
2. Claude analyzes the content and matches it to DHF categories based on:
   - Document type (test report, specifications, risk analysis, etc.)
   - Content keywords (biocompatibility, sterilization, validation, etc.)
   - Document reference patterns (PS, VR, RM, etc.)
   - Phase appropriateness
3. Returns classification with confidence level (high/medium/low)

### Step 5: Display Results
1. Groups classified documents by DHF file category
2. Updates UI to show:
   - DHF file name (e.g., "Biocompatibility Test Report")
   - Status badge showing document count
   - List of actual documents found under each category
   - Submission section reference

## Example Workflow

```
User selects: "Phase 3: Development"
User clicks: "Scan Documents"

Scanner finds: /ProjectFolder/Phase 3/
  ├── Biocompatibility_ISO_10993.pdf
  ├── Sterilization_Validation_Report.docx
  ├── Shelf_Life_Testing_Results.pdf
  └── Risk_FMEA_Analysis.xlsx (skipped - unsupported)

AI Classification:
  ✓ Biocompatibility_ISO_10993.pdf 
    → "biocompatibility_report" (high confidence)
  ✓ Sterilization_Validation_Report.docx 
    → "sterilization_validation" (high confidence)
  ✓ Shelf_Life_Testing_Results.pdf 
    → "shelf_life_study" (medium confidence)

Display Shows:
  ✓ Biocompatibility Test Report [1 DOC(S)]
    • Biocompatibility_ISO_10993.pdf
  
  ✓ Sterilization Validation Report [1 DOC(S)]
    • Sterilization_Validation_Report.docx
  
  ✓ Shelf Life Study 1 Year Report [1 DOC(S)]
    • Shelf_Life_Testing_Results.pdf
  
  ⚠ Design Verification Test Report [NOT FOUND]
    (no documents found)
```

## Key Benefits

1. **No Manual Entry**: Documents are automatically discovered and categorized
2. **Intelligent Matching**: AI understands document content, not just filenames
3. **Phase-Specific**: Can scan entire project or focus on specific phases
4. **Real-Time**: Always shows current state of the project folder
5. **Scalable**: Works with any number of documents
6. **Transparent**: Shows exactly which documents were found

## Configuration Requirements

### Environment Variables (`.env` in `src/api-server/`)
```bash
ANTHROPIC_API_KEY=your_api_key_here
PORT=3001
```

### Project Folder Structure
The scanner expects phase folders to follow these naming patterns:
- `Phase 1`, `phase 1`, `PHASE 1`
- `Phase_1`, `phase_1`
- `Phase-1`, `phase-1`
- `P1`, `p1`

Documents should be organized like:
```
ProjectFolder/
├── Phase 1/
│   ├── Product_Specifications.pdf
│   └── Risk_Analysis.docx
├── Phase 2/
│   └── Design_Verification_Protocol.pdf
├── Phase 3/
│   ├── Test_Reports/
│   │   ├── Biocompatibility.pdf
│   │   └── Sterilization.pdf
│   └── Validation_Results.docx
└── Phase 4/
    └── Manufacturing_Flow.pdf
```

## Testing

### Test the Scanner
1. Start the API server:
   ```bash
   cd src/api-server
   npm run dev
   ```

2. Start the Angular UI:
   ```bash
   cd angular-ui
   npm start
   ```

3. Create a new project with a valid folder path

4. Click "Scan Documents" and verify:
   - Documents are discovered
   - Classification makes sense
   - DHF categories show correct document counts

### API Testing
Test the scan endpoint directly:
```bash
curl -X POST http://localhost:3001/api/projects/test-project/scan-dhf \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/your/project",
    "phaseId": 3
  }'
```

## Troubleshooting

### "No documents found" but files exist
- Check folder naming matches expected patterns (Phase 1, Phase_1, etc.)
- Verify file extensions are supported (.pdf, .docx, .txt, .md, .doc)
- Check file sizes are under 10MB
- Look at console logs for detailed scan information

### Documents classified incorrectly
- Review document content - classifier uses first 3000 characters
- Check if document type matches DHF category expectations
- Low confidence classifications may need manual review
- Consider adding more specific content to document headers

### Scan takes too long
- Reduce number of documents in folders
- Ensure files are under 10MB limit
- Check network latency to Anthropic API
- Batch processing runs 5 documents at a time with 1s delay

### API errors
- Verify `ANTHROPIC_API_KEY` is set in environment
- Check API server is running on port 3001
- Review server logs for detailed error messages
- Ensure project folder path is accessible

## Future Enhancements

1. **Manual Override**: Allow users to manually reassign documents to different categories
2. **Confidence Thresholds**: Flag low-confidence classifications for review
3. **Document Previews**: Show document snippets in the UI
4. **Export Reports**: Generate compliance reports based on scanned documents
5. **Version Tracking**: Track document versions and changes over time
6. **Batch Operations**: Bulk actions on multiple documents
7. **Search/Filter**: Filter DHF files by status, phase, or keyword
