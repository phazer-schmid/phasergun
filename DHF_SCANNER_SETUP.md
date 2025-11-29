# DHF Document Scanner & Classification System

## Overview

This system automatically scans project folders for Design History File (DHF) documents, parses their content, and uses AI (Anthropic Claude) to classify them into the appropriate FDA 510(k) submission categories.

## Architecture

### Components

1. **DHF Scanner Service** (`src/dhf-scanner/`)
   - Scans project folders for phase directories (Phase 1-4)
   - Parses documents (PDF, DOCX, TXT, MD)
   - Uses Anthropic Claude API for intelligent classification
   - Groups documents by DHF file category

2. **API Server** (`src/api-server/`)
   - Express REST API
   - Endpoint: `POST /api/projects/:projectId/scan-dhf`
   - Loads DHF mapping from YAML
   - Returns classified DHF files with statistics

3. **Angular UI Integration** (`angular-ui/src/app/services/dhf.service.ts`)
   - Service method to call scan API
   - Displays real documents in dashboard
   - Shows scan progress and results

## Setup Instructions

### 1. Install Dependencies

```bash
# Install DHF Scanner dependencies
cd src/dhf-scanner
npm install
npm run build

# Install API Server dependencies
cd ../api-server
npm install
```

### 2. Configure Anthropic API Key

Create `.env` file in `src/api-server/`:

```bash
cp .env.template .env
```

Edit `.env` and add your Anthropic API key:

```
PORT=3001
ANTHROPIC_API_KEY=sk-ant-your-actual-api-key-here
```

Get your API key from: https://console.anthropic.com/

### 3. Configure Angular HttpClient

Add `provideHttpClient()` to Angular app config in `angular-ui/src/app/app.config.ts`:

```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient() // Add this line
  ]
};
```

### 4. Start the API Server

```bash
cd src/api-server
npm run dev
```

The API server will start on http://localhost:3001

### 5. Start the Angular App

```bash
cd angular-ui
npm start
```

The Angular app will start on http://localhost:4200

## Usage

### Project Folder Structure

The scanner expects a project folder with phase subdirectories:

```
/path/to/project/
├── Phase 1/
│   ├── requirements.docx
│   ├── risk_analysis.pdf
│   └── ...
├── Phase 2/
│   ├── design_spec.pdf
│   └── ...
├── Phase 3/
│   ├── test_report.pdf
│   ├── biocompatibility.docx
│   └── ...
└── Phase 4/
    └── validation_report.pdf
```

Supported phase folder names:
- "Phase 1", "Phase_1", "phase1", "P1"
- "Phase 2", "Phase_2", "phase2", "P2"
- etc.

### Scanning a Project

#### Via API (Direct)

```bash
curl -X POST http://localhost:3001/api/projects/test-project/scan-dhf \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/path/to/your/project/folder"}'
```

#### Via Angular UI

1. Create or open a project in the Angular app
2. The dashboard will call the scan API automatically
3. Wait for classification to complete
4. View classified documents organized by DHF category

### API Response

```json
{
  "projectId": "test-project",
  "dhfFiles": [
    {
      "id": "biocompatibility_report",
      "name": "Biocompatibility\nTest Report",
      "documentReference": "VR0284.A",
      "submissionSection": "Section 17 - Biocompatibility",
      "required": true,
      "status": "complete",
      "documents": [
        {
          "name": "ISO_10993_Biocompat_Eval.pdf",
          "status": "complete",
          "date": "2025-01-15",
          "reviewer": "Auto-scanned"
        }
      ]
    }
  ],
  "scanStatus": "complete",
  "timestamp": "2025-11-29T18:00:00.000Z",
  "stats": {
    "totalDHFFiles": 28,
    "completedFiles": 5,
    "totalDocuments": 12
  }
}
```

## How Classification Works

1. **Folder Scanning**: System finds all phase directories and recursively scans for documents

2. **Document Parsing**: 
   - PDF files: Extracted using pdf-parse
   - DOCX files: Extracted using mammoth
   - TXT/MD files: Read directly

3. **LLM Classification**:
   - Document metadata and content snippet sent to Claude
   - Claude analyzes against 28 DHF categories
   - Returns best matching DHF file ID and confidence level

4. **Grouping**: Documents are grouped by DHF file category and phase

## DHF Categories

The system classifies documents into 28 FDA 510(k) DHF categories across 4 phases:

### Phase 1: Planning (4 categories)
- Product Specifications
- Preliminary Design Traceability Matrix
- Preliminary Risk Analysis
- Design Feasibility

### Phase 2: Design (4 categories)
- Engineering Specifications
- Preliminary DV Protocol
- Risk Management Documents
- Preliminary Animal Testing

### Phase 3: Development (10 categories)
- Design Verification Report
- Animal Test Report
- Thrombogenicity Study
- Biocompatibility Report
- Sterilization Validation
- Shelf Life Study
- etc.

### Phase 4: Qualification (4 categories)
- Packaging Validation
- Manufacturing Flow Diagram
- Proposed Labeling
- Predicate Device Summary

## Configuration

### File Size Limits

Default max file size: 10MB

Configure in `src/api-server/src/index.ts`:

```typescript
const scanner = new DHFScanner({
  anthropicApiKey,
  maxFileSize: 20 * 1024 * 1024, // 20MB
  supportedExtensions: ['.pdf', '.docx', '.txt', '.md', '.doc']
});
```

### Supported File Types

Default: `.pdf`, `.docx`, `.txt`, `.md`, `.doc`

Add more in scanner config above.

## Troubleshooting

### "ANTHROPIC_API_KEY not configured"

- Ensure `.env` file exists in `src/api-server/`
- Verify API key is valid
- Restart API server after adding key

### "Error scanning project folder"

- Verify project path exists and is readable
- Check folder contains phase directories
- Ensure documents are in supported formats

### Classification accuracy issues

- Check document content is clear and relevant
- Verify DHF mapping in `src/rag-service/knowledge-base/context/dhf-phase-mapping.yaml`
- Review Claude's reasoning in API server logs

### Rate limiting

- Claude has rate limits on API calls
- System processes documents in batches of 5
- Adds 1-second delay between batches

## Development

### Adding New DHF Categories

1. Edit `src/rag-service/knowledge-base/context/dhf-phase-mapping.yaml`
2. Add new DHF file entry with id, name, reference
3. Restart API server to reload mapping

### Changing LLM Provider

To use OpenAI instead of Anthropic:

1. Install OpenAI SDK in `src/dhf-scanner/package.json`
2. Update scanner code to use OpenAI client
3. Add OPENAI_API_KEY to `.env`

## Cost Estimates

Anthropic Claude pricing (as of Nov 2024):
- Claude 3.5 Sonnet: $3 per million input tokens
- Typical document: ~500 tokens per classification
- 100 documents ≈ $0.15

## Next Steps

1. **Caching**: Add response caching to reduce API calls for repeated scans
2. **Progress Tracking**: Implement WebSocket for real-time scan progress
3. **Batch Processing**: Optimize for large projects (100+ documents)
4. **Export**: Add ability to export scan results to CSV/Excel

## Support

For issues or questions:
- Check API server logs: `src/api-server` terminal
- Review browser console for frontend errors
- Verify Anthropic API status: https://status.anthropic.com
