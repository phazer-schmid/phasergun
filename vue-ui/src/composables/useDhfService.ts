import axios from 'axios';
import { DHFFile, PhaseDHFMapping } from '@phasergun/shared-types';
import { getApiUrl } from '../config/api';

interface ScanResponse {
  projectId: string;
  dhfFiles: DHFFile[];
  scanStatus: string;
  timestamp: string;
  stats: {
    totalDHFFiles: number;
    completedFiles: number;
    totalDocuments: number;
  };
}

export function useDhfService() {
  const apiUrl = getApiUrl();
  
  // DHF phase mapping based on the YAML file
  // Documents are populated dynamically via scanning, not statically
  const dhfPhaseMapping: PhaseDHFMapping[] = [
    {
      phaseId: 1,
      phaseName: 'Phase 1: Planning (Concept/Feasibility)',
      dhfFiles: [
        {
          id: 'product_specifications',
          name: 'Product Specifications\n(User Requirements)',
          documentReference: 'PS0228.03/PS0228.A/PS0228.B',
          submissionSection: 'Section 11 - Device Description',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'preliminary_design_traceability',
          name: 'Preliminary Design\nTraceability Matrix',
          documentReference: 'DTM0226.03',
          submissionSection: 'Section 11 - Device Description',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'preliminary_risk_analysis',
          name: 'Preliminary Risk Analysis\n(Risk Management Plan)',
          documentReference: 'RM0246.01',
          submissionSection: 'Section 13 - Substantial Equivalence',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'design_feasibility',
          name: 'Design Feasibility/\nPreliminary Testing',
          documentReference: 'Memo to File',
          submissionSection: 'Section 11 - Device Description',
          required: false,
          status: 'missing',
          documents: []
        }
      ]
    },
    {
      phaseId: 2,
      phaseName: 'Phase 2: Design (Design Optimization)',
      dhfFiles: [
        {
          id: 'engineering_specifications',
          name: 'Engineering Specifications\n(Design Input)',
          documentReference: 'ES0298.01/ES0298.A',
          submissionSection: 'Section 11, 20 - Performance Testing',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'preliminary_dv_protocol',
          name: 'Preliminary Design Verification\n(DV) Protocol',
          documentReference: 'VP0291.01',
          submissionSection: 'Section 20 - Performance Testing - Bench',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'risk_management_docs',
          name: 'Preliminary Risk Management\nDocuments (dFMEA, pFMEA)',
          documentReference: 'RM0296.01, RM0299.01',
          submissionSection: 'Section 13 - Substantial Equivalence',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'preliminary_animal_testing',
          name: 'Preliminary Animal\nTesting Plan',
          documentReference: 'Parachute Animal Testing Memo',
          submissionSection: 'Section 21 - Performance Testing - Animal',
          required: false,
          status: 'missing',
          documents: []
        }
      ]
    },
    {
      phaseId: 3,
      phaseName: 'Phase 3: Development (Verification)',
      dhfFiles: [
        {
          id: 'design_verification_report',
          name: 'Design Verification\nTest Report (Bench Testing)',
          documentReference: 'VR0301.A',
          submissionSection: 'Appendix B - DV Report; Section 20',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'animal_test_report',
          name: 'Simulated Use Acute\nAnimal Test Report',
          documentReference: 'VR0302.A',
          submissionSection: 'Section 21 - Performance Testing - Animal',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'thrombogenicity_study',
          name: 'Preliminary Thrombogenicity\nAcute Animal Study Report',
          documentReference: 'VR0304.A',
          submissionSection: 'Section 21 - Performance Testing - Animal',
          required: false,
          status: 'missing',
          documents: []
        },
        {
          id: 'biocompatibility_report',
          name: 'Biocompatibility\nTest Report',
          documentReference: 'VR0284.A',
          submissionSection: 'Section 17 - Biocompatibility',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'biocompatibility_protocol',
          name: 'Biocompatibility\nTest Protocol',
          documentReference: 'VP0252.B',
          submissionSection: 'Appendix A - Biocompatibility Protocol',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'sterilization_validation',
          name: 'Sterilization Validation Report\n(eBeam Radiation)',
          documentReference: 'VR0283.A',
          submissionSection: 'Section 15 - Sterilization',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'shelf_life_study',
          name: 'Shelf Life Study 1 Year Report\n(Accelerated Aging/Packaging)',
          documentReference: 'VR0287.A',
          submissionSection: 'Section 16 - Shelf Life',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'final_traceability_matrix',
          name: 'Updated/Final Traceability Matrix\n(Post-Verification)',
          documentReference: 'DTM0226.A',
          submissionSection: 'Sections 11, 13, 20, 21',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'final_risk_management',
          name: 'Final Risk Management Documents\n(Clinical Risk, FMEA)',
          documentReference: 'RM0246.A, RM0296.A, RM0299.A',
          submissionSection: 'Section 13 - Substantial Equivalence',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'production_documentation',
          name: 'Preliminary Production\nDocumentation (LHR, WI)',
          documentReference: 'LHRs, WI0238',
          submissionSection: 'Various sections',
          required: false,
          status: 'missing',
          documents: []
        }
      ]
    },
    {
      phaseId: 4,
      phaseName: 'Phase 4: Qualification (Validation/Pilot)',
      dhfFiles: [
        {
          id: 'packaging_validation',
          name: 'Packaging Integrity/Process\nValidation Report',
          documentReference: 'VR0268.A',
          submissionSection: 'Sections 15, 16 - Sterilization/Shelf Life',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'manufacturing_flow',
          name: 'Manufacturing Flow Diagram\n(DMR)',
          documentReference: 'DMR0300.01',
          submissionSection: 'Section 11 - Manufacturing/Device Description',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'proposed_labeling',
          name: 'Proposed Product Label\nand IFU',
          documentReference: 'LS0282, IFU0306',
          submissionSection: 'Section 14 - Proposed Labeling',
          required: true,
          status: 'missing',
          documents: []
        },
        {
          id: 'predicate_device_summary',
          name: 'Predicate Device\n510(k) Summary',
          documentReference: 'K043580, K970668',
          submissionSection: 'Section 12, Appendix D - Predicate Comparison',
          required: false,
          status: 'missing',
          documents: []
        }
      ]
    }
  ];

  /**
   * Get DHF files for a specific phase
   */
  const getDhfFilesForPhase = (phaseId: number): DHFFile[] => {
    const phase = dhfPhaseMapping.find(p => p.phaseId === phaseId);
    return phase ? phase.dhfFiles : [];
  };

  /**
   * Get all DHF files (for entire project view)
   */
  const getAllDhfFiles = (): DHFFile[] => {
    const allFiles: DHFFile[] = [];
    dhfPhaseMapping.forEach(phase => {
      allFiles.push(...phase.dhfFiles);
    });
    return allFiles;
  };

  /**
   * Get phase name by ID
   */
  const getPhaseName = (phaseId: number): string => {
    const phase = dhfPhaseMapping.find(p => p.phaseId === phaseId);
    return phase ? phase.phaseName : '';
  };

  /**
   * Scan a project folder for DHF documents using the API
   * Connects to the backend DHF scanner that uses Claude AI for classification
   */
  const scanProjectFolder = async (
    projectId: string, 
    projectPath: string, 
    phaseId?: number
  ): Promise<DHFFile[]> => {
    const scanScope = phaseId ? `Phase ${phaseId}` : 'entire project';
    console.log(`[DHF Service] Scanning ${scanScope} for project ${projectId} at ${projectPath}`);
    
    try {
      const response = await axios.post<ScanResponse>(
        `${apiUrl}/projects/${projectId}/scan-dhf`,
        { 
          projectPath,
          phaseId
        }
      );
      
      console.log(`[DHF Service] Scan complete: ${response.data.stats.totalDocuments} documents found`);
      return response.data.dhfFiles;
    } catch (error) {
      console.error('[DHF Service] Error scanning project:', error);
      throw error;
    }
  };

  return {
    getDhfFilesForPhase,
    getAllDhfFiles,
    getPhaseName,
    scanProjectFolder
  };
}
