# DHF Folder Structure Requirements

## Overview
The DHF Document Checklist scanner requires a specific folder structure to properly discover and classify documents. This document outlines the requirements and best practices.

## Required Folder Structure

### Basic Structure
```
ProjectFolder/
├── Phase 1/
│   └── [documents]
├── Phase 2/
│   └── [documents]
├── Phase 3/
│   └── [documents]
└── Phase 4/
    └── [documents]
```

### Supported Phase Folder Names
The scanner recognizes phase folders using flexible naming patterns:

**Format 1: Space-separated**
- `Phase 1`, `Phase 2`, `Phase 3`, `Phase 4`
- `PHASE 1`, `PHASE 2`, `PHASE 3`, `PHASE 4`
- `phase 1`, `phase 2`, `phase 3`, `phase 4`

**Format 2: Underscore-separated**
- `Phase_1`, `Phase_2`, `Phase_3`, `Phase_4`
- `phase_1`, `phase_2`, `phase_3`, `phase_4`

**Format 3: Hyphen-separated**
- `Phase-1`, `Phase-2`, `Phase-3`, `Phase-4`
- `phase-1`, `phase-2`, `phase-3`, `phase-4`

**Format 4: Short form**
- `P1`, `P2`, `P3`, `P4`
- `p1`, `p2`, `p3`, `p4`

> **Note**: The scanner uses regex pattern: `/(?:phase|p)[\s_-]*([1-4])/i`

## Supported File Types

The scanner processes the following document formats:

| Extension | Type | Extraction Method |
|-----------|------|-------------------|
| `.pdf` | PDF documents | Text extraction via pdf-parse |
| `.docx` | Word documents (2007+) | Text extraction via mammoth |
| `.doc` | Word documents (legacy) | Text extraction via mammoth |
| `.txt` | Plain text | Direct read |
| `.md` | Markdown | Direct read |

**File Size Limit**: 10MB maximum per file

## Example Structures

### Example 1: Simple Structure
```
MedicalDevice_Project/
├── Phase 1/
│   ├── Product_Requirements.pdf
│   ├── Risk_Management_Plan.docx
│   └── Design_Traceability_Matrix.xlsx
├── Phase 2/
│   ├── Engineering_Specifications.pdf
│   └── Design_Verification_Protocol.docx
├── Phase 3/
│   ├── Biocompatibility_Report.pdf
│   ├── Sterilization_Validation.pdf
│   └── Shelf_Life_Testing.pdf
└── Phase 4/
    ├── Manufacturing_Flow_Diagram.pdf
    └── Product_Labeling.pdf
```

### Example 2: Nested Structure (Supported)
```
CardiacDevice_DHF/
├── Phase 1/
│   ├── Requirements/
│   │   ├── User_Requirements.pdf
│   │   └── Product_Specifications.docx
│   └── Risk/
│       └── Preliminary_Risk_Analysis.pdf
├── Phase 2/
│   └── Design/
│       ├── Engineering_Specs.pdf
│       └── DV_Protocol.docx
├── Phase 3/
│   ├── Testing/
│   │   ├── Bench_Tests/
│   │   │   ├── Performance_Test_1.pdf
│   │   │   └── Performance_Test_2.pdf
│   │   └── Animal_Studies/
│   │       └── Acute_Animal_Study.pdf
│   └── Validation/
│       ├── Biocompatibility.pdf
│       └── Sterilization.pdf
└── Phase 4/
    ├── Manufacturing/
    │   └── Process_Validation.pdf
    └── Labeling/
        ├── IFU.pdf
        └── Product_Label.pdf
```

### Example 3: With Non-Phase Folders (Ignored)
```
PulseBridge_Project/
├── Phase 1/                    ← Scanned
│   └── documents...
├── Phase 2/                    ← Scanned
│   └── documents...
├── Phase 3/                    ← Scanned
│   └── documents...
├── Phase 4/                    ← Scanned
│   └── documents...
├── Archive/                    ← Ignored
│   └── old_documents...
├── Templates/                  ← Ignored
│   └── template_files...
└── README.md                   ← Ignored (not in phase folder)
```

## DHF Document Categories by Phase

### Phase 1: Planning (Concept/Feasibility)
Expected document types:
- Product Specifications / User Requirements
- Preliminary Design Traceability Matrix
- Preliminary Risk Analysis / Risk Management Plan
- Design Feasibility / Preliminary Testing (optional)

**Common filenames**:
- `Product_Requirements_v*.pdf`
- `User_Requirements_*.docx`
- `Risk_Management_Plan_*.pdf`
- `Traceability_Matrix_*.xlsx`

### Phase 2: Design (Design Optimization)
Expected document types:
- Engineering Specifications / Design Input
- Preliminary Design Verification Protocol
- Preliminary Risk Management Documents (dFMEA, pFMEA)
- Preliminary Animal Testing Plan (optional)

**Common filenames**:
- `Engineering_Specifications_*.pdf`
- `Design_Verification_Protocol_*.docx`
- `dFMEA_*.pdf`
- `pFMEA_*.xlsx`

### Phase 3: Development (Verification)
Expected document types:
- Design Verification Test Report (Bench Testing)
- Simulated Use Acute Animal Test Report
- Preliminary Thrombogenicity Study (optional)
- Biocompatibility Test Report
- Biocompatibility Test Protocol
- Sterilization Validation Report
- Shelf Life Study Report (Accelerated Aging/Packaging)
- Updated/Final Traceability Matrix
- Final Risk Management Documents
- Preliminary Production Documentation (optional)

**Common filenames**:
- `Bench_Test_Report_*.pdf`
- `Animal_Study_Report_*.pdf`
- `Biocompatibility_Test_*.pdf`
- `ISO_10993_*.pdf`
- `Sterilization_Validation_*.pdf`
- `Shelf_Life_Testing_*.pdf`
- `Risk_Analysis_Final_*.pdf`

### Phase 4: Qualification (Validation/Pilot)
Expected document types:
- Packaging Integrity/Process Validation Report
- Manufacturing Flow Diagram (DMR)
- Proposed Product Label and IFU
- Predicate Device 510(k) Summary (optional)

**Common filenames**:
- `Package_Validation_*.pdf`
- `Manufacturing_Flow_*.pdf`
- `DMR_*.pdf`
- `IFU_*.pdf`
- `Product_Label_*.pdf`
- `510k_Summary_*.pdf`

## Best Practices

### 1. Consistent Naming
Use descriptive, consistent filenames:
- ✅ `Biocompatibility_ISO10993_Report_v1.2.pdf`
- ❌ `doc1.pdf`

### 2. Version Control
Include version numbers in filenames:
- ✅ `Risk_Analysis_v2.1.pdf`
- ❌ `Risk_Analysis_FINAL_FINAL_v3.pdf`

### 3. Date Stamps
Consider including dates for clarity:
- ✅ `Sterilization_Validation_2025-01-15.pdf`
- ✅ `Test_Report_20250115.pdf`

### 4. Document Organization
Group related documents in subfolders:
```
Phase 3/
├── Testing/
│   ├── Bench/
│   └── Animal/
├── Validation/
│   ├── Biocompatibility/
│   └── Sterilization/
└── Risk_Management/
```

### 5. File Size Management
Keep files under 10MB:
- Split large documents into parts if needed
- Compress images in PDFs
- Use PDF/A format for long-term storage

### 6. Avoid Special Characters
Stick to standard characters in filenames:
- ✅ `Test_Report_v1.2.pdf`
- ❌ `Test Report (Draft) [Version #2]!.pdf`

### 7. Case Sensitivity
Be aware that some filesystems are case-sensitive:
- macOS: Case-insensitive by default
- Linux: Case-sensitive
- Windows: Case-insensitive

## Troubleshooting

### No Documents Found
1. **Check phase folder names**:
   ```bash
   ls -la /path/to/project/
   # Should see: Phase 1, Phase 2, Phase 3, Phase 4
   ```

2. **Verify file extensions**:
   ```bash
   find /path/to/project/Phase\ 1 -type f -name "*.pdf" -o -name "*.docx"
   ```

3. **Check file sizes**:
   ```bash
   find /path/to/project -type f -size +10M
   ```

### Documents Classified Incorrectly
1. **Review document content**: Ensure the first few pages contain relevant information
2. **Check document type**: Make sure it's clearly a test report, specification, etc.
3. **Add headers**: Include descriptive headers/titles at the beginning of documents
4. **Use standard templates**: Follow FDA/ISO standard document templates

### Scanner Can't Access Files
1. **Check permissions**:
   ```bash
   ls -la /path/to/project/
   # Should show read permissions
   ```

2. **Verify path**:
   ```bash
   cd /path/to/project/
   # Should work without errors
   ```

3. **Check for special characters**:
   - Spaces in paths should work (handled by scanner)
   - Avoid other special characters

## Migration Guide

### From Unorganized to Organized

**Before**:
```
Project/
├── document1.pdf
├── document2.pdf
├── test_report.pdf
└── validation.docx
```

**After**:
```
Project/
├── Phase 1/
│   └── Product_Requirements.pdf
├── Phase 2/
│   └── Design_Verification_Protocol.docx
├── Phase 3/
│   ├── Test_Report.pdf
│   └── Validation_Report.docx
└── Phase 4/
    └── Manufacturing_Flow.pdf
```

### Batch Rename Script
```bash
#!/bin/bash
# Rename documents with version and date
for file in *.pdf; do
    mv "$file" "${file%.pdf}_v1.0_$(date +%Y%m%d).pdf"
done
```

## Testing Your Structure

Use the provided test script:
```bash
# Test entire project
./test-dhf-scanner.sh /path/to/your/project

# Test specific phase
./test-dhf-scanner.sh /path/to/your/project 3
```

Or use the curl command directly:
```bash
curl -X POST http://localhost:3001/api/projects/test/scan-dhf \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/path/to/your/project", "phaseId": 1}'
```

## References

- [FDA Design History File Guidance](https://www.fda.gov/regulatory-information)
- [ISO 13485 Medical Device Quality Management](https://www.iso.org/standard/59752.html)
- [21 CFR 820.30 Design Controls](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-820)
