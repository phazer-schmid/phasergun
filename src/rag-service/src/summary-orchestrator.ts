/**
 * Summary Orchestrator
 * Coordinates SOP and Context file summary generation with mutex protection
 */

import { ParsedDocument } from '@phasergun/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Mutex } from 'async-mutex';
import { SummaryGenerator } from './summarization/summary-generator';
import { DocumentLoader } from './loading/document-loader';

/**
 * GLOBAL mutex for summary generation - prevents duplicate LLM calls
 */
const globalSummaryMutex = new Mutex();

/**
 * Generate SOP summaries with mutex protection
 */
export async function generateSOPSummaries(
  projectPath: string,
  summaryWordCount: number,
  documentLoader: DocumentLoader,
  summaryGenerator: SummaryGenerator
): Promise<Map<string, string>> {
  let sopSummaries = new Map<string, string>();
  
  // Acquire GLOBAL summary mutex to prevent duplicate summary generation
  const releaseSummary = await globalSummaryMutex.acquire();
  console.log('[SummaryOrchestrator] 🔒 Summary mutex acquired - generating SOP summaries...');
  
  try {
    // Get procedure files
    const proceduresPath = path.join(projectPath, 'Procedures');
    let proceduresFiles: ParsedDocument[] = [];
    try {
      await fs.access(proceduresPath);
      proceduresFiles = await documentLoader.loadProceduresFolder(proceduresPath);
    } catch {
      // No procedures folder
    }
    
    if (proceduresFiles.length > 0) {
      sopSummaries = await summaryGenerator.generateSOPSummaries(
        proceduresFiles,
        projectPath,
        summaryWordCount
      );
    }
  } catch (error) {
    console.warn('[SummaryOrchestrator] Failed to generate SOP summaries, continuing without them:', error);
  } finally {
    releaseSummary();
    console.log('[SummaryOrchestrator] 🔓 Summary mutex released');
  }
  
  return sopSummaries;
}

/**
 * Generate Context file summaries with mutex protection
 * Filters out on-demand categories that weren't explicitly referenced
 */
export async function generateContextSummaries(
  projectPath: string,
  summaryWordCount: number,
  excludeGeneral: boolean,
  excludeRegStrategy: boolean,
  documentLoader: DocumentLoader,
  summaryGenerator: SummaryGenerator
): Promise<Map<string, string>> {
  let contextSummaries = new Map<string, string>();
  
  // Acquire GLOBAL summary mutex to prevent duplicate summary generation
  const releaseSummary = await globalSummaryMutex.acquire();
  console.log('[SummaryOrchestrator] 🔒 Summary mutex acquired - generating context summaries...');
  
  try {
    // Get context files
    const contextPath = path.join(projectPath, 'Context');
    let contextFilesWithCategory: { doc: ParsedDocument; contextCategory: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general' }[] = [];
    try {
      await fs.access(contextPath);
      contextFilesWithCategory = await documentLoader.loadContextFolderStructured(contextPath);
    } catch {
      // No context folder
    }
    
    if (contextFilesWithCategory.length > 0) {
      // Filter out on-demand categories that weren't explicitly referenced
      const filteredContextFiles = contextFilesWithCategory.filter(cf => {
        if (cf.contextCategory === 'general' && excludeGeneral) {
          console.log(`[SummaryOrchestrator] ⏭️  Excluding summary for ${cf.doc.fileName} (General folder, not referenced)`);
          return false;
        }
        if (cf.contextCategory === 'regulatory-strategy' && excludeRegStrategy) {
          console.log(`[SummaryOrchestrator] ⏭️  Excluding summary for ${cf.doc.fileName} (Regulatory Strategy folder, not referenced)`);
          return false;
        }
        return true;
      });
      
      contextSummaries = await summaryGenerator.generateContextSummaries(
        filteredContextFiles,
        projectPath,
        summaryWordCount
      );
    }
  } catch (error) {
    console.warn('[SummaryOrchestrator] Failed to generate Context summaries, continuing without them:', error);
  } finally {
    releaseSummary();
    console.log('[SummaryOrchestrator] 🔓 Summary mutex released');
  }
  
  return contextSummaries;
}
