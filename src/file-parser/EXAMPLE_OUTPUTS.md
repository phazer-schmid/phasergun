# Example Parser Outputs

This document shows real-world example outputs for each supported file format.

---

## 📄 PDF Document Example

### Input File
`design_specification.pdf` - 25 page technical specification

### Parsed Output
```typescript
{
  id: "a3f5c8d9e2b1f4a6",
  filePath: "/dhf/design/design_specification.pdf",
  fileName: "design_specification.pdf",
  mimeType: "application/pdf",
  content: `DESIGN SPECIFICATION
Product: Medical Infusion Pump Model XYZ-1000

1. INTRODUCTION
This document defines the design specifications for the XYZ-1000 
medical infusion pump system...

2. DESIGN INPUTS
2.1 Performance Requirements
- Flow rate accuracy: ±5% of set rate
- Occlusion detection: < 2 PSI
- Battery life: Minimum 8 hours continuous operation
...

3. SAFETY REQUIREMENTS
3.1 Electrical Safety
- Complies with IEC 60601-1
- Class II equipment
- Type BF applied parts
...`,
  
  metadata: {
    fileSize: 2457600,  // ~2.4 MB
    parsedAt: "2024-12-08T14:30:00.000Z",
    extension: ".pdf",
    pageCount: 25,
    pdfInfo: {
      Title: "XYZ-1000 Design Specification",
      Author: "Engineering Team",
      Subject: "Medical Device Design",
      Creator: "Microsoft Word",
      Producer: "Adobe PDF Library 15.0",
      CreationDate: "D:20231115093000-05'00'",
      ModDate: "D:20231120143000-05'00'",
      Trapped: "False"
    },
    pdfMetadata: {
      // Additional PDF metadata
    }
  }
}
```

---

## 📝 Word Document (.docx) Example

### Input File
`risk_analysis.docx` - FMEA document with tables

### Parsed Output
```typescript
{
  id: "b7e2d4a9c1f8e3b5",
  filePath: "/dhf/risk/risk_analysis.docx",
  fileName: "risk_analysis.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  content: `FAILURE MODE AND EFFECTS ANALYSIS (FMEA)
Device: XYZ-1000 Infusion Pump
Date: November 20, 2023

1. OVERVIEW
This FMEA identifies potential failure modes and their effects...

2. RISK ASSESSMENT

Component: Power Supply
Failure Mode: Battery depletion during operation
Effect: Device shuts down, interrupting therapy
Severity: 8
Occurrence: 3
Detection: 7
RPN: 168

Component: Flow Sensor
Failure Mode: Sensor drift over time
Effect: Inaccurate flow rate delivery
Severity: 9
Occurrence: 2
Detection: 5
RPN: 90
...`,
  
  metadata: {
    fileSize: 156800,  // ~153 KB
    parsedAt: "2024-12-08T14:31:00.000Z",
    extension: ".docx",
    wordCount: 3847,
    messages: [],
    hasImages: false,
    hasTables: true
  }
}
```

---

## 📊 PowerPoint (.pptx) Example

### Input File
`design_review.pptx` - 15 slide design review presentation

### Parsed Output
```typescript
{
  id: "c9f3e5b2a7d4c8e1",
  filePath: "/dhf/reviews/design_review.pptx",
  fileName: "design_review.pptx",
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  content: `Design Review Presentation
XYZ-1000 Infusion Pump
Phase 2 Review
Date: December 1, 2023

Slide 1: Title Slide
Design Review - Phase 2
XYZ-1000 Medical Infusion Pump

Slide 2: Agenda
- Project Overview
- Design Requirements Review
- Design Verification Results
- Risk Management Update
- Manufacturing Considerations
- Next Steps

Slide 3: Project Overview
Project Goal: Develop next-generation infusion pump
Key Features:
- Advanced flow accuracy
- Extended battery life
- Intuitive user interface
- Wireless connectivity

Slide 4: Design Requirements Status
Total Requirements: 87
Verified: 82
In Progress: 5
Deferred: 0
Completion Rate: 94%
...`,
  
  metadata: {
    fileSize: 3245000,  // ~3.2 MB
    parsedAt: "2024-12-08T14:32:00.000Z",
    extension: ".pptx",
    wordCount: 1247
  }
}
```

---

## 🖼️ Image with OCR (PNG) Example

### Input File
`schematic_diagram.png` - Engineering schematic with labels

### Parsed Output
```typescript
{
  id: "d4a8f2c6b9e7d3a1",
  filePath: "/dhf/drawings/schematic_diagram.png",
  fileName: "schematic_diagram.png",
  mimeType: "image/png",
  content: `POWER SUPPLY SCHEMATIC
XYZ-1000 INFUSION PUMP

DC INPUT
+12V

VOLTAGE REGULATOR
LM7805
INPUT OUTPUT
GND

+5V OUTPUT TO MCU

BATTERY BACKUP
Li-Ion 3.7V
2600mAh

CHARGE CONTROLLER
BQ24075

POWER SWITCH
S1

LED INDICATOR
D1 - POWER
D2 - CHARGING
D3 - LOW BATTERY

FUSE
F1 2A

NOTE: ALL CAPACITORS 16V RATED
NOTE: PCB LAYOUT PER DWG-1234`,
  
  metadata: {
    fileSize: 874560,  // ~854 KB
    parsedAt: "2024-12-08T14:33:00.000Z",
    extension: ".png",
    width: 3200,
    height: 2400,
    format: "png",
    space: "srgb",
    channels: 3,
    depth: "uchar",
    density: 300,
    hasAlpha: false,
    orientation: 1,
    isOCRExtracted: true,
    ocrConfidence: "See individual word confidence in full OCR data"
  }
}
```

---

## 🖼️ Scanned Document (JPEG) Example

### Input File
`signed_form.jpg` - Scanned and signed approval form

### Parsed Output
```typescript
{
  id: "e7b3d9f4a2c8e6b1",
  filePath: "/dhf/forms/signed_form.jpg",
  fileName: "signed_form.jpg",
  mimeType: "image/jpeg",
  content: `DESIGN APPROVAL FORM

Project: XYZ-1000 Infusion Pump
Document: Design Specification Rev C
Date: November 25, 2023

APPROVALS:

Design Engineer: John Smith
Date: 11/25/2023
Signature: [signature present]

Quality Engineer: Sarah Johnson  
Date: 11/25/2023
Signature: [signature present]

Regulatory Affairs: Michael Chen
Date: 11/25/2023
Signature: [signature present]

Project Manager: Emily Rodriguez
Date: 11/25/2023
Signature: [signature present]

COMMENTS:
All design inputs have been verified and meet requirements.
Recommend proceeding to prototype phase.

DISTRIBUTION:
- Design History File
- Quality Records
- Project Documentation`,
  
  metadata: {
    fileSize: 445120,  // ~435 KB
    parsedAt: "2024-12-08T14:34:00.000Z",
    extension: ".jpg",
    width: 2550,
    height: 3300,
    format: "jpeg",
    space: "srgb",
    channels: 3,
    depth: "uchar",
    density: 300,
    hasAlpha: false,
    orientation: 1,
    isOCRExtracted: true,
    ocrConfidence: "See individual word confidence in full OCR data"
  }
}
```

---

## 📄 Text File Example

### Input File
`test_log.txt` - Simple test execution log

### Parsed Output
```typescript
{
  id: "f2d8c4e9a7b3f5e1",
  filePath: "/dhf/testing/test_log.txt",
  fileName: "test_log.txt",
  mimeType: "text/plain",
  content: `TEST EXECUTION LOG
===================
Test Suite: Electrical Safety Testing
Device: XYZ-1000 Infusion Pump S/N: 001-PROTO
Date: December 5, 2023
Operator: J. Smith

Test 1: Protective Earth Resistance
Standard: IEC 60601-1 Clause 8.6.3
Requirement: < 0.2 Ohm
Result: 0.15 Ohm
Status: PASS

Test 2: Earth Leakage Current (Normal Condition)
Standard: IEC 60601-1 Clause 8.7.3
Requirement: < 500 µA
Result: 45 µA
Status: PASS

Test 3: Earth Leakage Current (Single Fault)
Standard: IEC 60601-1 Clause 8.7.3
Requirement: < 1000 µA
Result: 178 µA
Status: PASS

Test 4: Patient Leakage Current (Normal)
Standard: IEC 60601-1 Clause 8.7.4.1
Requirement: < 100 µA (Type BF)
Result: 12 µA
Status: PASS

Test 5: Patient Leakage Current (Single Fault)
Standard: IEC 60601-1 Clause 8.7.4.1
Requirement: < 500 µA (Type BF)
Result: 89 µA
Status: PASS

SUMMARY
Total Tests: 5
Passed: 5
Failed: 0
Status: ALL TESTS PASSED

Reviewed by: S. Johnson (Quality)
Date: December 5, 2023`,
  
  metadata: {
    fileSize: 1247,  // ~1.2 KB
    parsedAt: "2024-12-08T14:35:00.000Z",
    extension: ".txt"
  }
}
```

---

## 📊 CSV File Example

### Input File
`test_results.csv` - Tabular test data

### Parsed Output
```typescript
{
  id: "a8e4d2f9b7c3e5a1",
  filePath: "/dhf/testing/test_results.csv",
  fileName: "test_results.csv",
  mimeType: "text/csv",
  content: `Test_ID,Parameter,Set_Value,Measured_Value,Tolerance,Status,Date
T001,Flow_Rate_mL_hr,50,49.8,±5%,PASS,2023-12-01
T002,Flow_Rate_mL_hr,100,101.2,±5%,PASS,2023-12-01
T003,Flow_Rate_mL_hr,250,248.5,±5%,PASS,2023-12-01
T004,Flow_Rate_mL_hr,500,505.3,±5%,PASS,2023-12-01
T005,Occlusion_Pressure_PSI,1.5,1.48,±0.2,PASS,2023-12-01
T006,Occlusion_Pressure_PSI,1.8,1.82,±0.2,PASS,2023-12-01
T007,Battery_Life_hrs,8,8.3,≥8,PASS,2023-12-02
T008,Alarm_Volume_dB,70,71.2,65-75,PASS,2023-12-02
T009,Response_Time_sec,2,1.8,≤2,PASS,2023-12-02
T010,Display_Brightness_cd_m2,150,152,140-160,PASS,2023-12-02`,
  
  metadata: {
    fileSize: 678,
    parsedAt: "2024-12-08T14:36:00.000Z",
    extension: ".csv"
  }
}
```

---

## 📝 Markdown File Example

### Input File
`readme.md` - Project documentation

### Parsed Output
```typescript
{
  id: "b9f5e3d7a2c4e8b1",
  filePath: "/dhf/documentation/readme.md",
  fileName: "readme.md",
  mimeType: "text/markdown",
  content: `# XYZ-1000 Design History File

## Overview
This directory contains the Design History File (DHF) for the XYZ-1000 Medical Infusion Pump.

## Directory Structure

### /design
- Design inputs and requirements
- Design specifications
- Interface control documents

### /verification
- Test protocols
- Test results
- Verification reports

### /validation
- Validation plans
- Clinical evaluation
- User studies

### /risk
- Risk analysis (FMEA)
- Risk management reports
- Post-market surveillance

### /manufacturing
- Manufacturing specifications
- Process validations
- Change controls

## Document Naming Convention
Format: \`[TYPE]-[NUMBER]-[REV]-[TITLE].ext\`

Examples:
- SPEC-001-A-Design_Specification.docx
- TEST-042-B-Flow_Accuracy_Test.pdf
- RISK-003-C-FMEA_Report.docx

## Revision History
| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2023-10-15 | 1.0 | Initial release | J. Smith |
| 2023-11-20 | 1.1 | Added test results | S. Johnson |
| 2023-12-05 | 1.2 | Updated FMEA | M. Chen |

## References
- ISO 13485:2016 - Medical devices - Quality management systems
- IEC 60601-1 - Medical electrical equipment - General requirements
- FDA 21 CFR Part 820 - Quality System Regulation`,
  
  metadata: {
    fileSize: 1456,
    parsedAt: "2024-12-08T14:37:00.000Z",
    extension: ".md"
  }
}
```

---

## 🔍 Legacy Format Examples

### Word 97-2003 (.doc)
```typescript
{
  id: "c3e7f9a4d2b8e6c1",
  filePath: "/archive/old_procedure.doc",
  fileName: "old_procedure.doc",
  mimeType: "application/msword",
  content: `STANDARD OPERATING PROCEDURE
SOP-QMS-045
Document Control Procedures

1.0 PURPOSE
This SOP defines the procedures for document control...

2.0 SCOPE
This procedure applies to all controlled documents...

3.0 RESPONSIBILITIES
3.1 Document Control Coordinator
3.2 Department Managers
3.3 Quality Assurance

4.0 PROCEDURE
4.1 Document Creation
4.2 Document Review
4.3 Document Approval
4.4 Document Distribution
4.5 Document Revision
4.6 Document Archival
...`,
  
  metadata: {
    fileSize: 87040,
    parsedAt: "2024-12-08T14:38:00.000Z",
    extension: ".doc",
    wordCount: 2156
  }
}
```

### PowerPoint 97-2003 (.ppt)
```typescript
{
  id: "d8a2f4c9e7b3d5f1",
  filePath: "/archive/training_2020.ppt",
  fileName: "training_2020.ppt",
  mimeType: "application/vnd.ms-powerpoint",
  content: `ISO 13485 Training
Quality Management System for Medical Devices
January 2020

Module 1: Introduction
What is ISO 13485?
Why is it important?
Regulatory requirements

Module 2: Quality System Elements
Management Responsibility
Resource Management
Product Realization
Measurement Analysis Improvement

Module 3: Documentation Requirements
Quality Manual
Procedures
Work Instructions
Records
...`,
  
  metadata: {
    fileSize: 2456000,
    parsedAt: "2024-12-08T14:39:00.000Z",
    extension: ".ppt",
    wordCount: 892
  }
}
```

---

## 📐 Complex Image Example (TIFF)

### Input File
`cad_drawing.tiff` - High-resolution technical drawing

### Parsed Output
```typescript
{
  id: "e9c7d4f2a8b3e6d1",
  filePath: "/dhf/drawings/cad_drawing.tiff",
  fileName: "cad_drawing.tiff",
  mimeType: "image/tiff",
  content: `ASSEMBLY DRAWING
PART NUMBER: XYZ-1000-ASM-001
REVISION: C
DATE: 2023-11-15

BILL OF MATERIALS

ITEM  PART NUMBER       QTY  DESCRIPTION
1     XYZ-1000-PCB-001  1    Main PCB Assembly
2     XYZ-1000-LCD-001  1    LCD Display Module
3     XYZ-1000-KEY-001  1    Keypad Assembly
4     XYZ-1000-PWR-001  1    Power Supply Module
5     XYZ-1000-MOT-001  1    Stepper Motor
6     XYZ-1000-SEN-001  1    Flow Sensor
7     XYZ-1000-CAS-001  1    Housing Assembly
8     XYZ-1000-BAT-001  1    Battery Pack

NOTES:
1. ALL DIMENSIONS IN MILLIMETERS
2. TOLERANCES PER DWG-STD-001
3. MATERIAL: MEDICAL GRADE ABS
4. FINISH: SMOOTH, ANTIMICROBIAL COATING
5. ASSEMBLY PER PROCEDURE ASM-PROC-001

SCALE: 1:2
SHEET 1 OF 3`,
  
  metadata: {
    fileSize: 15680000,  // ~15 MB
    parsedAt: "2024-12-08T14:40:00.000Z",
    extension: ".tiff",
    width: 6000,
    height: 4500,
    format: "tiff",
    space: "srgb",
    channels: 3,
    depth: "uchar",
    density: 600,  // High resolution
    hasAlpha: false,
    orientation: 1,
    isOCRExtracted: true,
    ocrConfidence: "See individual word confidence in full OCR data"
  }
}
```

---

## 💡 Key Observations

### Text Extraction Quality
1. **PDF**: Excellent for text-based PDFs, maintains structure
2. **DOCX**: Excellent, preserves formatting context
3. **PPTX**: Good, extracts all slide content sequentially
4. **Images**: Quality depends on image resolution and text clarity
5. **Text files**: Perfect, byte-for-byte accuracy

### Metadata Richness
1. **Images**: Most comprehensive metadata (dimensions, format, color, etc.)
2. **PDF**: Rich document metadata (author, dates, etc.)
3. **DOCX**: Structural metadata (images, tables presence)
4. **Others**: Basic metadata (size, timestamps)

### Use Case Examples
- **Regulatory Submissions**: PDF specifications with full metadata
- **Quality Records**: Signed scanned forms with OCR
- **Technical Documentation**: Word documents with structure detection
- **Training Materials**: PowerPoint with full content extraction
- **Test Data**: CSV files with tabular data
- **Engineering**: High-res images with technical text extraction

---

## 🎯 Best Practices for Each Format

### PDFs
- Ensure text-based (not scanned) for best results
- Keep file size reasonable (< 50 MB)
- Use standard fonts for better extraction

### Word Documents
- Use .docx over .doc when possible
- Keep formatting simple for better structure preservation
- Avoid complex embedded objects

### Images for OCR
- Minimum 300 DPI resolution
- High contrast between text and background
- Avoid skewed or rotated text
- Remove noise and artifacts
- Use clear, standard fonts

### PowerPoint
- Keep text in text boxes (not images)
- Avoid complex animations
- Use standard slide layouts

### Text Files
- Use UTF-8 encoding
- Keep reasonable file sizes
- Structure with clear sections
