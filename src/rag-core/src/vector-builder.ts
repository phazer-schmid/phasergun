/**
 * Vector Builder
 * Handles vector store construction and document embedding
 */

import { ParsedDocument } from '@phasergun/shared-types';
import { EmbeddingService } from './embedding-service';
import { VectorStore, VectorEntry } from './vector-store';

/**
 * A procedure document with its subcategory metadata.
 * Defined here in rag-core so the layer boundary is not violated.
 * rag-service's CategorizedProcedureFile is structurally compatible with this type.
 */
export interface ProcedureDoc {
  doc: ParsedDocument;
  procedureSubcategory?: 'sops' | 'quality_policies' | 'project_quality_plans';
  procedureCategoryId?: string;
}

/**
 * Chunk and embed a parsed document
 * Returns VectorEntry objects ready for storage
 */
export async function chunkAndEmbedDocument(
  doc: ParsedDocument,
  category: 'procedure' | 'context',
  projectPath: string,
  embeddingService: EmbeddingService,
  chunkingStrategy: {
    chunkSectionAware: (content: string, fileName: string, filePath: string) => string[];
    chunkWithOverlap: (content: string, fileName: string, filePath: string) => string[];
  },
  contextCategory?: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general',
  procedureSubcategory?: 'sops' | 'quality_policies' | 'project_quality_plans',
  procedureCategoryId?: string
): Promise<VectorEntry[]> {
  // 1. Intelligent chunking based on category
  const contentChunks = category === 'procedure'
    ? chunkingStrategy.chunkSectionAware(doc.content, doc.fileName, doc.filePath)
    : chunkingStrategy.chunkWithOverlap(doc.content, doc.fileName, doc.filePath);
  
  console.log(`[VectorBuilder] Chunked ${doc.fileName}: ${contentChunks.length} chunks`);
  
  if (contentChunks.length === 0) {
    return [];
  }
  
  // 2. Generate embeddings for all chunks (batch processing)
  const embeddings = await embeddingService.embedBatch(
    contentChunks,
    Array(contentChunks.length).fill(doc.filePath)
  );
  
  // 3. Create VectorEntry objects
  const vectorEntries: VectorEntry[] = contentChunks.map((content, chunkIndex) => {
    return VectorStore.createEntry(
      content,
      embeddings[chunkIndex],
      {
        fileName: doc.fileName,
        filePath: doc.filePath,
        category,
        chunkIndex,
        contextCategory,
        procedureSubcategory,
        procedureCategoryId
      }
    );
  });
  
  return vectorEntries;
}

/**
 * Process all documents and build vector store
 * DETERMINISM: Files are sorted alphabetically before processing to ensure
 * consistent vector entry ordering across cache rebuilds
 */
export async function buildVectorStore(
  proceduresFiles: ProcedureDoc[],
  contextFiles: { doc: ParsedDocument; contextCategory: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general' }[],
  projectPath: string,
  embeddingService: EmbeddingService,
  chunkingStrategy: {
    chunkSectionAware: (content: string, fileName: string, filePath: string) => string[];
    chunkWithOverlap: (content: string, fileName: string, filePath: string) => string[];
  },
  vectorStorePath: string,
  cacheEnabled: boolean
): Promise<VectorStore> {
  console.log('[VectorBuilder] Building vector store with deterministic ordering...');
  
  // Get embedding service model info
  const modelInfo = embeddingService.getModelInfo();
  
  // Create new vector store
  const vectorStore = new VectorStore(projectPath, modelInfo.version);
  
  // =========================================================================
  // DETERMINISM: Sort files alphabetically before processing
  // This ensures vectors are always added in the same order
  // =========================================================================
  
  // Sort procedures by fileName
  const sortedProcedures = [...proceduresFiles].sort((a, b) =>
    a.doc.fileName.localeCompare(b.doc.fileName)
  );
  
  // Sort context files by fileName
  const sortedContext = [...contextFiles].sort((a, b) => 
    a.doc.fileName.localeCompare(b.doc.fileName)
  );
  
  console.log('[VectorBuilder] Processing files in sorted order for determinism...');
  
  // Process procedures sequentially (not in parallel) to maintain order
  const procedureVectors: VectorEntry[] = [];
  for (const { doc, procedureSubcategory, procedureCategoryId } of sortedProcedures) {
    const vectors = await chunkAndEmbedDocument(
      doc,
      'procedure',
      projectPath,
      embeddingService,
      chunkingStrategy,
      undefined,
      procedureSubcategory,
      procedureCategoryId
    );
    procedureVectors.push(...vectors);
  }
  
  // Process context files sequentially (not in parallel) to maintain order
  const contextVectors: VectorEntry[] = [];
  for (const { doc, contextCategory } of sortedContext) {
    const vectors = await chunkAndEmbedDocument(
      doc,
      'context',
      projectPath,
      embeddingService,
      chunkingStrategy,
      contextCategory
    );
    contextVectors.push(...vectors);
  }
  
  // Add to vector store in deterministic order: procedures first, then context
  const allVectors = [...procedureVectors, ...contextVectors];
  allVectors.forEach(entry => vectorStore.addEntry(entry));
  
  // Save to disk only if caching is enabled
  if (cacheEnabled) {
    await vectorStore.save(vectorStorePath);
  } else {
    console.log('[VectorBuilder] ⚠️  Skipping vector store save (caching disabled)');
  }
  
  console.log(`[VectorBuilder] ✓ Vector store built: ${allVectors.length} chunks indexed (deterministic order)`);
  
  return vectorStore;
}
