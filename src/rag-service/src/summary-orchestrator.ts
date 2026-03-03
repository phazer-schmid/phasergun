/**
 * Summary Orchestrator
 * Coordinates SOP and Context file summary generation with mutex protection
 */

import { ParsedDocument } from '@phasergun/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Mutex } from 'async-mutex';
import { SummaryGenerator } from './summary-generator';
import { DocumentLoader, CategorizedProcedureFile } from './document-loader';

/**
 * Separate mutexes per summary type — SOP and context summaries are independent
 * so they can run concurrently without blocking each other.
 */
const globalSOPSummaryMutex = new Mutex();
const globalContextSummaryMutex = new Mutex();

/**
 * Generate SOP summaries with mutex protection.
 * Filters out on-demand procedure subcategories (quality_policies, project_quality_plans)
 * that were not explicitly referenced in the prompt, mirroring the same logic applied to
 * Context/General/ and Context/Regulatory Strategy/.
 *
 * @param excludedSubcategories - Subcategories to exclude (e.g., new Set(['quality_policies']))
 */
export async function generateSOPSummaries(
  projectPath: string,
  summaryWordCount: number,
  documentLoader: DocumentLoader,
  summaryGenerator: SummaryGenerator,
  excludedSubcategories: Set<string> = new Set()
): Promise<Map<string, string>> {
  let sopSummaries = new Map<string, string>();

  // Acquire SOP-specific mutex to prevent duplicate generation across concurrent requests
  const releaseSummary = await globalSOPSummaryMutex.acquire();
  console.log('[SummaryOrchestrator] 🔒 SOP mutex acquired - generating SOP summaries...');

  try {
    // Get categorized procedure files
    const proceduresPath = path.join(projectPath, 'Procedures');
    let categorizedFiles: CategorizedProcedureFile[] = [];
    try {
      await fs.access(proceduresPath);
      categorizedFiles = await documentLoader.loadProceduresFolder(proceduresPath);
    } catch {
      // No procedures folder
    }

    if (categorizedFiles.length > 0) {
      // Filter out on-demand procedure subcategories not explicitly referenced
      const filteredFiles = categorizedFiles.filter(cf => {
        if (excludedSubcategories.has(cf.procedureSubcategory)) {
          console.log(
            `[SummaryOrchestrator] ⏭️  Excluding summary for ${cf.doc.fileName} (subcategory: ${cf.procedureSubcategory}, not referenced)`
          );
          return false;
        }
        return true;
      });

      // Extract ParsedDocument[] for the summary generator
      const docsForSummary: ParsedDocument[] = filteredFiles.map(cf => cf.doc);

      if (docsForSummary.length > 0) {
        sopSummaries = await summaryGenerator.generateSOPSummaries(
          docsForSummary,
          projectPath,
          summaryWordCount
        );
      }
    }
  } catch (error) {
    console.warn('[SummaryOrchestrator] Failed to generate SOP summaries, continuing without them:', error);
  } finally {
    releaseSummary();
    console.log('[SummaryOrchestrator] 🔓 SOP mutex released');
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
  
  // Acquire context-specific mutex to prevent duplicate generation across concurrent requests
  const releaseSummary = await globalContextSummaryMutex.acquire();
  console.log('[SummaryOrchestrator] 🔒 Context mutex acquired - generating context summaries...');
  
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
    console.log('[SummaryOrchestrator] 🔓 Context mutex released');
  }

  return contextSummaries;
}
