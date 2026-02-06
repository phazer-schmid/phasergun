/**
 * DHF (Design History File) related type definitions
 * These types support the 510(k) submission DHF management system
 */

/**
 * Represents a single DHF file/document requirement in the submission
 */
export interface DHFFile {
  id: string;
  name: string;
  documentReference: string;
  submissionSection: string;
  required: boolean;
  status: string;
  documents: any[]; // Array of actual documents found/associated with this DHF requirement
}

/**
 * Maps DHF files to their respective project phases
 */
export interface PhaseDHFMapping {
  phaseId: number;
  phaseName: string;
  dhfFiles: DHFFile[];
}
