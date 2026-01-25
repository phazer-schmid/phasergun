#!/bin/bash

# Setup Test Data for RAG Pipeline Tests
# This script creates a test project structure with sample documents

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "======================================================================"
echo "  Setting up RAG Pipeline Test Data"
echo "======================================================================"
echo ""

# Default test project path
TEST_PROJECT_PATH=${TEST_PROJECT_PATH:-/tmp/test-phasergun}

echo -e "${BLUE}📁 Creating test project structure...${NC}"
echo "   Location: $TEST_PROJECT_PATH"
echo ""

# Create directories
mkdir -p "$TEST_PROJECT_PATH/Procedures"
mkdir -p "$TEST_PROJECT_PATH/Context"

# Create sample SOP: Design Control
echo -e "${BLUE}📝 Creating sample SOP: Design Control...${NC}"
cat > "$TEST_PROJECT_PATH/Procedures/SOP0004_Design_Control.txt" << 'EOF'
STANDARD OPERATING PROCEDURE
SOP-0004: Design Control Process
Effective Date: 2024-01-15
Version: 3.2

1. PURPOSE
This Standard Operating Procedure (SOP) defines the design control process for medical devices 
in accordance with 21 CFR Part 820.30 and ISO 13485:2016. The purpose is to ensure that design 
and development activities are properly planned, controlled, and documented throughout the 
product development lifecycle.

2. SCOPE
This procedure applies to all medical device development projects undertaken by the organization, 
including new product designs, design modifications, and design transfers. It encompasses all 
phases from design planning through design validation.

3. RESPONSIBILITIES
3.1 Design Manager: Overall responsibility for design control implementation
3.2 R&D Engineers: Execute design activities according to this procedure
3.3 Quality Assurance: Review and approve design documentation
3.4 Regulatory Affairs: Ensure regulatory compliance
3.5 Project Manager: Coordinate design activities and timelines

4. DESIGN PLANNING
4.1 A Design and Development Plan shall be created for each new product or significant 
    design change.
4.2 The plan must identify design phases, milestones, reviews, and resources.
4.3 Design planning documents must be reviewed and approved before design activities commence.
4.4 The plan shall be updated as design progresses and requirements change.

5. DESIGN INPUTS
5.1 Design inputs represent the requirements for the device design and shall include:
    - Intended use and user needs
    - Performance requirements and specifications
    - Regulatory and safety requirements
    - Risk management requirements
    - Standards and guidance documents to be followed

5.2 Design inputs must be:
    - Documented in the Design History File (DHF)
    - Reviewed and approved by appropriate personnel
    - Traceable to user needs and requirements
    - Unambiguous and not conflicting
    - Measurable and verifiable

5.3 All design inputs shall be documented in a Design Input Specification document.

6. DESIGN OUTPUTS
6.1 Design outputs are the results of design efforts at each phase and shall include:
    - Device specifications and drawings
    - Software design documentation and source code
    - Bill of Materials (BOM)
    - Manufacturing and assembly procedures
    - Packaging and labeling specifications
    - Service and maintenance procedures

6.2 Design outputs must:
    - Meet design input requirements
    - Contain or reference acceptance criteria
    - Identify characteristics critical to safety and proper functioning
    - Be documented and approved before release

7. DESIGN REVIEW
7.1 Formal design reviews shall be conducted at appropriate stages of design development.
7.2 Design reviews must include:
    - Representatives from all relevant functions
    - Review of design against requirements
    - Identification of problems and required actions
    - Documentation of review results

7.3 Minimum required design reviews:
    - Design Input Review
    - Preliminary Design Review (PDR)
    - Critical Design Review (CDR)
    - Final Design Review

8. DESIGN VERIFICATION
8.1 Design verification confirms that design outputs meet design inputs.
8.2 Verification activities include:
    - Testing against specifications
    - Alternative calculations and analyses
    - Comparison with similar proven designs
    - Component and subsystem testing

8.3 Verification protocols must be documented with:
    - Test methods and acceptance criteria
    - Test results and conclusions
    - Traceability to design inputs

9. DESIGN VALIDATION
9.1 Design validation ensures the device meets user needs and intended uses.
9.2 Validation must include testing under actual or simulated use conditions.
9.3 Validation shall include:
    - Clinical evaluation or clinical trials if required
    - Usability/Human Factors testing
    - Performance testing in representative use environments
    - Software validation per SOP-0012

9.4 Validation must be conducted on initial production units or equivalent.

10. DESIGN TRANSFER
10.1 Design transfer ensures that device design is correctly translated to production.
10.2 Transfer activities include:
    - Review of manufacturing processes
    - Verification of production capability
    - Training of production personnel
    - Documentation transfer to manufacturing

11. DESIGN CHANGES
11.1 All design changes must be documented and controlled.
11.2 Changes shall be reviewed for impact on:
    - Safety and performance
    - Regulatory requirements
    - Existing validations
    - Risk analysis

11.3 Significant changes require re-verification and re-validation.

12. DOCUMENTATION AND RECORDS
12.1 All design control activities shall be documented in the Design History File (DHF).
12.2 The DHF must contain:
    - Design plans
    - Design inputs and outputs
    - Design review records
    - Verification and validation protocols and reports
    - Design change documentation
    - Risk management records

13. REFERENCES
- 21 CFR Part 820.30 - Design Controls
- ISO 13485:2016 - Medical Devices Quality Management
- ISO 14971:2019 - Risk Management
- FDA Guidance: Design Control Guidance for Medical Device Manufacturers

Document Control
Prepared by: J. Smith, Design Manager
Reviewed by: M. Johnson, Quality Assurance
Approved by: R. Davis, VP Engineering
Next Review Date: 2025-01-15
EOF

echo -e "${GREEN}   ✓ SOP0004_Design_Control.txt created${NC}"

# Create sample SOP: Risk Management
echo -e "${BLUE}📝 Creating sample SOP: Risk Management...${NC}"
cat > "$TEST_PROJECT_PATH/Procedures/SOP0007_Risk_Management.txt" << 'EOF'
STANDARD OPERATING PROCEDURE
SOP-0007: Risk Management Process
Effective Date: 2024-01-15
Version: 2.1

1. PURPOSE
This procedure establishes the requirements for risk management activities throughout the 
product lifecycle in accordance with ISO 14971:2019 - Application of Risk Management to 
Medical Devices.

2. SCOPE
This procedure applies to all medical devices developed, manufactured, or distributed by 
the organization, including design, production, installation, and post-market activities.

3. RISK MANAGEMENT PROCESS
3.1 Risk Analysis
    - Identify intended use and reasonably foreseeable misuse
    - Identify hazards and hazardous situations
    - Estimate risks for each hazardous situation
    - Evaluate risks against acceptance criteria

3.2 Risk Evaluation
    - Compare estimated risks to risk acceptance criteria
    - Determine if risk reduction is required
    - Document rationale for risk acceptability decisions

3.3 Risk Control
    - Implement risk control measures in the following hierarchy:
      a) Inherent safety by design
      b) Protective measures in device or manufacturing
      c) Information for safety (warnings, training)
    - Verify effectiveness of risk control measures
    - Assess residual risk after control implementation
    - Evaluate overall residual risk acceptability

3.4 Risk-Benefit Analysis
    - For risks that cannot be reduced further, perform risk-benefit analysis
    - Document that medical benefits outweigh residual risks
    - Include clinical data and literature when available

4. RISK MANAGEMENT FILE
4.1 A Risk Management File shall be maintained containing:
    - Risk management plan
    - Hazard identification records
    - Risk analysis and evaluation records
    - Risk control measures and verification
    - Residual risk evaluation
    - Risk-benefit analysis
    - Post-market surveillance data related to safety

5. POST-MARKET SURVEILLANCE
5.1 Collect and review production and post-production information
5.2 Assess impact on existing risk analysis
5.3 Update Risk Management File as new hazards are identified

6. DOCUMENTATION
All risk management activities shall be traceable and documented in the Design History File 
and Risk Management File per ISO 14971:2019 requirements.
EOF

echo -e "${GREEN}   ✓ SOP0007_Risk_Management.txt created${NC}"

# Create sample context: Predicate Device Comparison
echo -e "${BLUE}📝 Creating sample context: Predicate Comparison...${NC}"
cat > "$TEST_PROJECT_PATH/Context/predicate_comparison.txt" << 'EOF'
PREDICATE DEVICE COMPARISON
510(k) Substantial Equivalence Analysis

Subject Device: PhaserGun Endoscopic Visualization System
Predicate Device: MicroSnare Endoscopic Workstation
510(k) Number: K163077A

1. DEVICE DESCRIPTION

Subject Device:
- Advanced endoscopic visualization system with real-time image processing
- HD camera module with digital image enhancement
- Integrated LED light source (5000K color temperature)
- Image capture and recording capabilities
- Monitor display with touchscreen interface
- Software version 2.1 with AI-assisted detection features

Predicate Device:
- Endoscopic visualization system with image processing
- HD camera with standard image enhancement
- Integrated LED light source (5000K color temperature)
- Image capture and recording capabilities
- Monitor display with touchscreen interface
- Software version 1.8

2. INTENDED USE

Subject Device:
The PhaserGun system is intended to provide visualization during minimally invasive 
endoscopic surgical procedures. The device captures, processes, and displays real-time 
high-definition images of internal anatomical structures to aid the surgeon during 
diagnostic and therapeutic procedures.

Predicate Device:
The MicroSnare Workstation is intended to provide visualization during minimally invasive 
endoscopic surgical procedures, capturing and displaying real-time images of internal 
anatomical structures.

Comparison: SUBSTANTIALLY EQUIVALENT - Same intended use and clinical application

3. TECHNOLOGICAL CHARACTERISTICS

Feature                  | Subject Device        | Predicate Device      | Assessment
------------------------|----------------------|----------------------|------------------
Image Resolution        | 1920x1080 (Full HD)  | 1920x1080 (Full HD)  | Equivalent
Frame Rate             | 60 fps               | 60 fps               | Equivalent
Light Source           | LED 5000K, 300W      | LED 5000K, 300W      | Equivalent
Image Processing       | Digital enhancement  | Digital enhancement  | Equivalent
Recording Capability   | Yes, MP4 format      | Yes, MP4 format      | Equivalent
Display Type           | 27" Touchscreen LCD  | 27" Touchscreen LCD  | Equivalent
Software Functions     | Enhanced with AI     | Standard processing  | Different but safe

4. SUBSTANTIAL EQUIVALENCE DETERMINATION

The subject device shares the same intended use, fundamental scientific technology, and 
performance characteristics as the predicate device. The technological differences 
(AI-assisted detection) do not raise new questions of safety and effectiveness.

Key Points:
- Same regulatory classification (Class II)
- Same performance specifications for core functions
- AI enhancement is supplementary, not primary function
- Biocompatibility testing completed per ISO 10993-1
- Electrical safety per IEC 60601-1
- EMC testing per IEC 60601-1-2

5. PERFORMANCE TESTING SUMMARY

Testing Category          | Subject Device | Predicate Device | Result
-------------------------|----------------|------------------|------------------
Image Quality            | Pass           | Pass             | Equivalent
Light Output             | 298W           | 297W             | Equivalent
Color Accuracy (∆E)      | 2.1            | 2.3              | Equivalent/Better
Software Reliability     | 99.97% uptime  | 99.95% uptime    | Equivalent/Better
Electrical Safety        | Pass IEC 60601 | Pass IEC 60601   | Equivalent
EMC Compliance           | Pass           | Pass             | Equivalent

6. RISK ANALYSIS COMPARISON

All hazards identified in the predicate device have been evaluated for the subject device.
No new hazards have been introduced. Risk mitigation strategies are equivalent or improved.
The AI detection feature includes appropriate warnings and does not replace clinical judgment.

7. CONCLUSION

The PhaserGun Endoscopic Visualization System is substantially equivalent to the predicate 
MicroSnare Endoscopic Workstation (K163077A). The devices share the same intended use, 
fundamental scientific technology, and performance characteristics. Technological differences 
do not raise new questions of safety and effectiveness.

Recommendation: PROCEED WITH 510(k) SUBMISSION

Document Prepared By: Dr. Sarah Martinez, Regulatory Affairs Manager
Date: December 15, 2023
Review Status: Approved by Regulatory Team
EOF

echo -e "${GREEN}   ✓ predicate_comparison.txt created${NC}"

# Create sample context: Clinical Evaluation Summary
echo -e "${BLUE}📝 Creating sample context: Clinical Evaluation...${NC}"
cat > "$TEST_PROJECT_PATH/Context/clinical_evaluation_summary.txt" << 'EOF'
CLINICAL EVALUATION SUMMARY
PhaserGun Endoscopic Visualization System

1. CLINICAL EVALUATION OBJECTIVES
This clinical evaluation demonstrates the safety and performance of the PhaserGun system 
through analysis of clinical data, literature review, and comparison with similar devices.

2. LITERATURE REVIEW
A comprehensive literature search was conducted covering:
- Endoscopic visualization technology (2015-2023)
- AI-assisted image analysis in endoscopy
- Clinical outcomes with HD visualization systems
- Safety incidents with similar devices

Key Findings:
- 147 relevant publications identified
- No safety concerns with similar technology
- HD visualization improves procedural outcomes
- AI assistance shows improved lesion detection rates

3. CLINICAL DATA ANALYSIS

Performance Metrics:
- Image quality rated "excellent" by 94% of clinicians (n=50)
- AI detection sensitivity: 96.2% (95% CI: 93.1-98.1%)
- AI detection specificity: 91.7% (95% CI: 88.4-94.2%)
- No device-related adverse events reported
- Mean procedure time reduced by 8.3% vs. standard visualization

4. SAFETY PROFILE
- Zero serious adverse events attributable to device
- No tissue thermal injuries reported
- No electrical safety incidents
- All incidents were use errors, not device failures

5. CONCLUSION
Clinical evaluation supports safety and performance claims. Device performs as intended 
with no unacceptable risks. Clinical benefits include improved visualization and detection 
rates while maintaining excellent safety profile.

Prepared by: Clinical Affairs Department
Date: January 10, 2024
Status: Approved for 510(k) Submission
EOF

echo -e "${GREEN}   ✓ clinical_evaluation_summary.txt created${NC}"

# Summary
echo ""
echo "======================================================================"
echo -e "${GREEN}✅ Test Data Setup Complete!${NC}"
echo "======================================================================"
echo ""
echo "📁 Test Project Structure:"
echo "   $TEST_PROJECT_PATH/"
echo "   ├── Procedures/"
echo "   │   ├── SOP0004_Design_Control.txt"
echo "   │   └── SOP0007_Risk_Management.txt"
echo "   └── Context/"
echo "       ├── predicate_comparison.txt"
echo "       └── clinical_evaluation_summary.txt"
echo ""
echo "📝 Next Steps:"
echo "   1. Set environment variables:"
echo "      export TEST_PROJECT_PATH=$TEST_PROJECT_PATH"
echo "      export GROQ_API_KEY=your_api_key"
echo ""
echo "   2. Run the test:"
echo "      cd $(dirname $0)"
echo "      npm run test:rag"
echo ""
echo -e "${YELLOW}💡 Tip: Make sure GROQ_API_KEY is set in your environment or .env file${NC}"
echo ""
