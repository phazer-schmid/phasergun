import { ParsedDocument } from '@phasergun/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Mutex } from 'async-mutex';
import { EmbeddingService, VectorStore, SearchResult, LockManager, getLockManager, CacheManager, KnowledgeCache, buildVectorStore as buildVectorStoreUtil, chunkSectionAware, chunkWithOverlap } from '@phasergun/rag-core';
import { DocumentLoader, CategorizedProcedureFile } from './document-loader';
import {
  parseExplicitContextReferences,
  parseMasterChecklistReference,
  parseProcedureReferences,
  parseKnowledgeSourceScopes,
  parseBootstrapReferences,
  parseDocFieldReferences,
  filterContextResults,
  filterProcedureResults,
} from './reference-parser';
import { assembleContext, estimateTokens, enforceTokenLimit, extractExternalStandards } from './context-assembler';
import { generateSOPSummaries as generateSOPSummariesOrch, generateContextSummaries as generateContextSummariesOrch } from './summary-orchestrator';

/**
 * GLOBAL mutex for cache builds - shared across ALL service instances
 * This ensures that even if multiple EnhancedRAGService instances are created
 * (e.g., one per API request), they all coordinate through the same mutex.
 */
const globalBuildMutex = new Mutex();

/**
 * Enhanced RAG Service for Content Generation
 * Retrieves context from multiple knowledge sources to inform LLM generation:
 * 1. Static: primary-context.yaml (PhaserGun role, regulatory framework)
 * 2. Dynamic: Files in /Procedures folder (SOPs, company guidelines)
 * 3. Dynamic: Files in /Context folder (project-specific information)
 */
export class EnhancedRAGService {
  private cache: Map<string, KnowledgeCache> = new Map();
  private documentLoader: DocumentLoader;
  private embeddingService: EmbeddingService | null = null;
  private vectorStore: VectorStore | null = null;
  private useEmbeddings: boolean = true; // Feature flag
  private lockManager: LockManager;
  private cacheEnabled: boolean;
  private cacheManager: CacheManager;
  private summaryGenerator: any; // Lazy-loaded when needed
  
  constructor() {
    this.documentLoader = new DocumentLoader();
    this.lockManager = getLockManager();
    
    // Lazy-load SummaryGenerator only when needed (to avoid circular dependencies)
    this.summaryGenerator = null;
    
    // Read CACHE_ENABLED from environment (defaults to true for backwards compatibility)
    const cacheEnvValue = process.env.CACHE_ENABLED?.toLowerCase();
    this.cacheEnabled = cacheEnvValue !== 'false' && cacheEnvValue !== '0';
    this.cacheManager = new CacheManager(this.cacheEnabled);
    
    if (!this.cacheEnabled) {
      console.log('[EnhancedRAG] ⚠️  CACHING DISABLED - All documents will be processed fresh on every request');
    }
  }

  /**
   * Get or initialize embedding service
   */
  private async getEmbeddingService(projectPath: string): Promise<EmbeddingService> {
    if (!this.embeddingService) {
      this.embeddingService = EmbeddingService.getInstance(projectPath);
      await this.embeddingService.initialize();
    }
    return this.embeddingService;
  }


/**
   * Build vector store using the vector-builder utility
   */
  private async buildVectorStore(
    proceduresFiles: CategorizedProcedureFile[],
    contextFiles: { doc: ParsedDocument; contextCategory: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general' }[],
    projectPath: string
  ): Promise<void> {
    const embeddingService = await this.getEmbeddingService(projectPath);
    const vectorStorePath = this.cacheManager.getVectorStorePath(projectPath);
    
    this.vectorStore = await buildVectorStoreUtil(
      proceduresFiles,
      contextFiles,
      projectPath,
      embeddingService,
      { chunkSectionAware, chunkWithOverlap },
      vectorStorePath,
      this.cacheEnabled
    );
  }

  // Cache operations delegate to cacheManager
  async isCacheValid(projectPath: string, primaryContextPath: string): Promise<boolean> {
    return await this.cacheManager.isCacheValid(projectPath, primaryContextPath, this.cache);
  }

  /**
   * Ensure cache is built with mutex protection (CONCURRENCY-SAFE)
   * Use this method instead of loadKnowledge() to prevent race conditions
   * when multiple requests arrive simultaneously
   * 
   * Uses async-mutex to provide TRUE mutual exclusion - only one request
   * can execute the cache build logic at a time within this process.
   */
  async ensureCacheBuilt(
    projectPath: string,
    primaryContextPath: string
  ): Promise<KnowledgeCache> {
    console.log('[EnhancedRAG] 🔐 Ensuring cache is built (with GLOBAL mutex protection)...');
    
    // Acquire GLOBAL mutex - this BLOCKS until we get exclusive access
    // Using globalBuildMutex ensures ALL instances (even if multiple created) coordinate
    const release = await globalBuildMutex.acquire();
    console.log('[EnhancedRAG] 🔒 GLOBAL Mutex acquired - we have exclusive access');
    
    try {
      // Check cache validity (only ONE request at a time does this)
      const cacheValid = await this.isCacheValid(projectPath, primaryContextPath);
      if (cacheValid) {
        console.log('[EnhancedRAG] ✓ Cache valid, returning immediately (no rebuild needed)');
        // Load vector store if not already loaded
        if (!this.vectorStore) {
          const vectorStorePath = this.cacheManager.getVectorStorePath(projectPath);
          this.vectorStore = await VectorStore.load(vectorStorePath, projectPath);
        }
        return this.cache.get(projectPath)!;
      }
      
      // Cache invalid, proceed with rebuild (only ONE request does this)
      console.log('[EnhancedRAG] 🏗️  Cache invalid, proceeding with rebuild...');
      const result = await this.doEnsureCacheBuilt(projectPath, primaryContextPath);
      return result;
      
    } finally {
      // ALWAYS release mutex so next request can proceed
      release();
      console.log('[EnhancedRAG] 🔓 GLOBAL Mutex released - next request can proceed');
    }
  }

  /**
   * Actually build cache with file lock protection (internal)
   */
  private async doEnsureCacheBuilt(
    projectPath: string,
    primaryContextPath: string
  ): Promise<KnowledgeCache> {
    // Acquire lock for cache rebuild (this will wait if another PROCESS has the lock)
    console.log('[EnhancedRAG] 🔒 Acquiring lock for cache rebuild...');
    const lock = await this.lockManager.acquireLock(projectPath);
    
    try {
      // Double-check cache validity after acquiring lock
      // (another process may have built it while we were waiting for the lock)
      const stillInvalid = !(await this.isCacheValid(projectPath, primaryContextPath));
      
      if (!stillInvalid) {
        console.log('[EnhancedRAG] ✓ Cache was built by another process while waiting for lock, using it');
        // Load vector store if not already loaded
        if (!this.vectorStore) {
          const vectorStorePath = this.cacheManager.getVectorStorePath(projectPath);
          this.vectorStore = await VectorStore.load(vectorStorePath, projectPath);
        }
        return this.cache.get(projectPath)!;
      }
      
      // Cache is still invalid, rebuild it
      console.log('[EnhancedRAG] 🔄 We have the lock, rebuilding cache...');
      const result = await this.loadKnowledge(projectPath, primaryContextPath);
      return result;
      
    } finally {
      // Always release lock
      try {
        await lock.release();
      } catch (error) {
        // Ignore "already released" errors - this can happen if lock was released elsewhere
        if (error instanceof Error && !error.message.includes('already released')) {
          console.error('[EnhancedRAG] Error releasing lock:', error);
        }
      }
    }
  }

  /**
   * Load all knowledge sources with caching
   * NOTE: Use ensureCacheBuilt() instead for concurrency safety
   */
  async loadKnowledge(
    projectPath: string,
    primaryContextPath: string
  ): Promise<KnowledgeCache> {
    console.log('\n[EnhancedRAG] ========================================');
    console.log('[EnhancedRAG] Loading Knowledge Base');
    console.log('[EnhancedRAG] ========================================\n');
    
    // Check if cache is valid
    const cacheValid = await this.isCacheValid(projectPath, primaryContextPath);
    
    if (cacheValid) {
      console.log('[EnhancedRAG] ✓ Cache is valid, using cached knowledge\n');
      // Load vector store from disk
      const vectorStorePath = this.cacheManager.getVectorStorePath(projectPath);
      this.vectorStore = await VectorStore.load(vectorStorePath, projectPath);
      
      const cached = this.cache.get(projectPath)!;
      console.log('[EnhancedRAG] 📊 Cached Knowledge Statistics:');
      console.log(`[EnhancedRAG]    - Last built: ${cached.indexedAt}`);
      console.log(`[EnhancedRAG]    - Cache location: ${path.dirname(vectorStorePath)}`);
      console.log('[EnhancedRAG] ========================================\n');
      
      return cached;
    }
    
    console.log('[EnhancedRAG] 🔄 Cache invalid or missing - regenerating...\n');
    
    // Clear old cache files before rebuilding
    await this.cacheManager.clearOldCache(projectPath);
    
    // Load primary context
    const primaryContext = await this.documentLoader.loadPrimaryContext(primaryContextPath);
    
    // Load and parse documents
    const proceduresPath = path.join(projectPath, 'Procedures');
    const contextPath = path.join(projectPath, 'Context');

    let proceduresFiles: CategorizedProcedureFile[] = [];
    let contextFiles: { doc: ParsedDocument; contextCategory: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general' }[] = [];
    
    try {
      await fs.access(proceduresPath);
      proceduresFiles = await this.documentLoader.loadProceduresFolder(proceduresPath);
      console.log(`[EnhancedRAG] Loaded ${proceduresFiles.length} categorized files from Procedures folder`);
    } catch (error) {
      console.warn('[EnhancedRAG] Procedures folder not found or empty');
    }
    
    try {
      await fs.access(contextPath);
      contextFiles = await this.documentLoader.loadContextFolderStructured(contextPath);
      console.log(`[EnhancedRAG] Loaded ${contextFiles.length} files from Context folder (with subfolder structure)`);
    } catch (error) {
      console.warn('[EnhancedRAG] Context folder not found or empty');
    }
    
    // Load Master Checklist (on-demand, stored for later retrieval)
    let masterChecklist = null;
    try {
      masterChecklist = await this.documentLoader.loadMasterChecklist(contextPath);
      if (masterChecklist) {
        console.log('[EnhancedRAG] ✓ Master Checklist loaded and cached');
      }
    } catch (error) {
      console.log('[EnhancedRAG] Master Checklist not available');
    }
    
    // Build vector store if there are documents to process
    if (proceduresFiles.length > 0 || contextFiles.length > 0) {
      console.log('[EnhancedRAG] 🔄 Regenerating vector store...');
      console.log(`[EnhancedRAG]    - Processing ${proceduresFiles.length} procedure files`);
      console.log(`[EnhancedRAG]    - Processing ${contextFiles.length} context files`);
      
      const buildStart = Date.now();
      await this.buildVectorStore(proceduresFiles, contextFiles, projectPath);
      const buildDuration = ((Date.now() - buildStart) / 1000).toFixed(1);
      
      console.log(`[EnhancedRAG] ✅ Vector store regenerated in ${buildDuration}s`);
    } else {
      console.log('[EnhancedRAG] ⚠️  No documents to index, creating empty vector store');
      const embeddingService = await this.getEmbeddingService(projectPath);
      const modelInfo = embeddingService.getModelInfo();
      this.vectorStore = new VectorStore(projectPath, modelInfo.version);
      // Save empty vector store
      await this.vectorStore.save(this.cacheManager.getVectorStorePath(projectPath));
    }
    
    // Compute fingerprint including vector store
    const fingerprint = await this.cacheManager.computeCacheFingerprint(projectPath, primaryContextPath);
    const vectorStoreFingerprint = this.vectorStore?.getFingerprint() || 'empty';
    
    // Create cache entry
    const knowledgeCache: KnowledgeCache = {
      projectPath,
      fingerprint,
      primaryContext,
      indexedAt: new Date().toISOString(),
      vectorStoreFingerprint,
      masterChecklist: masterChecklist || undefined
    };
    
    // Store in memory cache
    this.cache.set(projectPath, knowledgeCache);
    
    // Save cache metadata to disk for persistence across restarts
    await this.cacheManager.saveCacheMetadata(knowledgeCache);
    
    const stats = this.vectorStore!.getStats();
    const vectorStorePath = this.cacheManager.getVectorStorePath(projectPath);
    
    console.log('[EnhancedRAG] ========================================');
    console.log('[EnhancedRAG] ✅ Knowledge Base Regeneration Complete');
    console.log('[EnhancedRAG] ========================================');
    console.log(`[EnhancedRAG] 📊 Statistics:`);
    console.log(`[EnhancedRAG]    - Primary Context: ✓`);
    console.log(`[EnhancedRAG]    - Procedures: ${stats.procedureEntries} chunks`);
    console.log(`[EnhancedRAG]    - Context: ${stats.contextEntries} chunks`);
    console.log(`[EnhancedRAG]    - Total Vectors: ${stats.totalEntries}`);
    console.log(`[EnhancedRAG] 💾 Cache Details:`);
    console.log(`[EnhancedRAG]    - Built at: ${knowledgeCache.indexedAt}`);
    console.log(`[EnhancedRAG]    - Location: ${path.dirname(vectorStorePath)}`);
    console.log(`[EnhancedRAG]    - Cache Fingerprint: ${fingerprint.substring(0, 16)}...`);
    console.log(`[EnhancedRAG]    - VectorStore Fingerprint: ${vectorStoreFingerprint.substring(0, 16)}...`);
    console.log('[EnhancedRAG] ========================================\n');
    
    return knowledgeCache;
  }


  /**
   * Retrieve relevant context for a prompt using semantic search
   * Enforces retrieval_priority rules from primary-context.yaml:
   * - regulatory_strategy and general are ONLY included if explicitly referenced
   */
  async retrieveRelevantContext(
    projectPath: string,
    primaryContextPath: string,
    prompt: string,
    options: {
      topK?: number;              // Default: 10
      procedureChunks?: number;   // How many procedure chunks (default: 5)
      contextChunks?: number;     // How many context file chunks (default: 5)
      includeFullPrimary?: boolean; // Always include full primary context (default: true)
      maxTokens?: number;         // Maximum tokens for context (default: 150000)
      includeSummaries?: boolean; // Include SOP summaries (default: true)
      summaryWordCount?: number;  // Summary word count (default: 250)
    } = {}
  ): Promise<{
    ragContext: string;
    metadata: {
      primaryContextIncluded: boolean;
      procedureChunksRetrieved: number;
      contextChunksRetrieved: number;
      summariesGenerated: number;
      contextSummariesGenerated: number;
      totalTokensEstimate: number;
      sources: string[];
    };
    procedureChunks: SearchResult[];
    contextChunks: SearchResult[];
    externalStandards: Array<{ id: string; name: string; scope: string }>;
  }> {
    // 1. Parse prompt for all explicit references and on-demand scopes
    const explicitlyReferencedCategories = parseExplicitContextReferences(prompt);
    const excludeGeneral = !explicitlyReferencedCategories.has('general');
    const excludeRegStrategy = !explicitlyReferencedCategories.has('regulatory-strategy');
    const includeMasterChecklist = parseMasterChecklistReference(prompt);

    // Parse procedure references (new [Procedure|subcategoryId|categoryId] format)
    const procedureRefs = parseProcedureReferences(prompt);
    const referencedProcedureSubcategories = new Set(procedureRefs.map(r => r.subcategoryId));

    // QPs and QaPs are on-demand: excluded unless explicitly referenced
    const excludedProcedureSubcategories = new Set<string>();
    if (!referencedProcedureSubcategories.has('quality_policies')) {
      excludedProcedureSubcategories.add('quality_policies');
    }
    if (!referencedProcedureSubcategories.has('project_quality_plans')) {
      excludedProcedureSubcategories.add('project_quality_plans');
    }

    // Surface not-yet-implemented warnings for Bootstrap and Doc field references
    parseBootstrapReferences(prompt);
    parseDocFieldReferences(prompt);

    // Parse knowledge source scopes (@sops, @global_standards, etc.) — for logging
    const knowledgeScopes = parseKnowledgeSourceScopes(prompt);

    console.log('[EnhancedRAG] 🔒 RETRIEVAL POLICY ENFORCEMENT:');
    if (excludeGeneral) {
      console.log('[EnhancedRAG]    ⛔ Context/General/ EXCLUDED (not explicitly referenced in prompt)');
    } else {
      console.log('[EnhancedRAG]    ✅ Context/General/ INCLUDED (explicitly referenced in prompt)');
    }
    if (excludeRegStrategy) {
      console.log('[EnhancedRAG]    ⛔ Context/Regulatory Strategy/ EXCLUDED (not explicitly referenced in prompt)');
    } else {
      console.log('[EnhancedRAG]    ✅ Context/Regulatory Strategy/ INCLUDED (explicitly referenced in prompt)');
    }
    if (excludedProcedureSubcategories.has('quality_policies')) {
      console.log('[EnhancedRAG]    ⛔ Procedures/QPs/ EXCLUDED (quality_policies not explicitly referenced)');
    } else {
      console.log('[EnhancedRAG]    ✅ Procedures/QPs/ INCLUDED (quality_policies explicitly referenced)');
    }
    if (excludedProcedureSubcategories.has('project_quality_plans')) {
      console.log('[EnhancedRAG]    ⛔ Procedures/QaPs/ EXCLUDED (project_quality_plans not explicitly referenced)');
    } else {
      console.log('[EnhancedRAG]    ✅ Procedures/QaPs/ INCLUDED (project_quality_plans explicitly referenced)');
    }
    if (includeMasterChecklist) {
      console.log('[EnhancedRAG]    ✅ Master Checklist INCLUDED (explicitly referenced in prompt)');
    } else {
      console.log('[EnhancedRAG]    ⛔ Master Checklist EXCLUDED (not explicitly referenced in prompt)');
    }
    if (knowledgeScopes.size > 0) {
      console.log(`[EnhancedRAG]    ℹ️  Knowledge source scopes detected: @${Array.from(knowledgeScopes).join(', @')} (logging only — full scope enforcement not yet implemented)`);
    }
    
    // 2. Load knowledge with lock protection (prevents concurrent rebuild collisions)
    const knowledge = await this.ensureCacheBuilt(projectPath, primaryContextPath);
    
    // 3 & 4. Generate summaries if requested (delegated to summary orchestrator)
    let sopSummaries = new Map<string, string>();
    let contextSummaries = new Map<string, string>();
    
    if (options.includeSummaries ?? true) {
      // Lazy-load SummaryGenerator
      if (!this.summaryGenerator) {
        const { SummaryGenerator } = await import('./summary-generator');
        this.summaryGenerator = new SummaryGenerator();
      }
      
      sopSummaries = await generateSOPSummariesOrch(
        projectPath,
        options.summaryWordCount || 250,
        this.documentLoader,
        this.summaryGenerator,
        excludedProcedureSubcategories
      );
      
      contextSummaries = await generateContextSummariesOrch(
        projectPath,
        options.summaryWordCount || 250,
        excludeGeneral,
        excludeRegStrategy,
        this.documentLoader,
        this.summaryGenerator
      );
    }
    
    // 5. Embed the prompt
    const embeddingService = await this.getEmbeddingService(projectPath);
    const promptEmbedding = await embeddingService.embedText(prompt);
    const promptEmbeddingArray = VectorStore.float32ArrayToNumbers(promptEmbedding);
    
    // 6. Search procedures with on-demand subcategory filtering
    // CRITICAL: Use explicit undefined check so 0 is respected (0 || 5 would give 5!)
    const procedureChunksToRetrieve = options.procedureChunks !== undefined ? options.procedureChunks : 5;
    console.log(`[EnhancedRAG] 🔍 Searching for top ${procedureChunksToRetrieve} procedure chunks...`);

    let procedureResults = procedureChunksToRetrieve > 0
      ? this.vectorStore!.search(promptEmbeddingArray, procedureChunksToRetrieve, 'procedure')
      : [];

    // ENFORCE RETRIEVAL POLICY: Filter out on-demand procedure subcategories (QPs, QaPs)
    procedureResults = filterProcedureResults(procedureResults, excludedProcedureSubcategories);

    if (procedureResults.length > 0) {
      console.log(`[EnhancedRAG] 📄 Procedure files included in context:`);
      const uniqueProcedures = new Set(procedureResults.map(r => r.entry.metadata.fileName));
      uniqueProcedures.forEach(fileName => {
        const chunks = procedureResults.filter(r => r.entry.metadata.fileName === fileName).length;
        const sub = procedureResults.find(r => r.entry.metadata.fileName === fileName)?.entry.metadata.procedureSubcategory || 'sops';
        console.log(`[EnhancedRAG]    ✓ ${fileName} (${chunks} chunk${chunks > 1 ? 's' : ''}, subcategory: ${sub})`);
      });
    } else if (procedureChunksToRetrieve === 0) {
      console.log(`[EnhancedRAG] ℹ️  No procedure chunks requested (procedureChunks=0)`);
    }

    // 7. Search context files with on-demand filtering
    // CRITICAL: Use explicit undefined check so 0 is respected
    const contextChunksToRetrieve = options.contextChunks !== undefined ? options.contextChunks : 5;
    console.log(`[EnhancedRAG] 🔍 Searching for top ${contextChunksToRetrieve} context chunks...`);

    let contextResults = contextChunksToRetrieve > 0
      ? this.vectorStore!.search(promptEmbeddingArray, contextChunksToRetrieve, 'context')
      : [];

    // ENFORCE RETRIEVAL POLICY: Filter out on-demand context categories
    contextResults = filterContextResults(contextResults, excludeGeneral, excludeRegStrategy);
    
    if (contextResults.length > 0) {
      console.log(`[EnhancedRAG] 📄 Context files included in prompt:`);
      const uniqueContextFiles = new Set(contextResults.map(r => r.entry.metadata.fileName));
      uniqueContextFiles.forEach(fileName => {
        const chunks = contextResults.filter(r => r.entry.metadata.fileName === fileName).length;
        const category = contextResults.find(r => r.entry.metadata.fileName === fileName)?.entry.metadata.contextCategory || 'unknown';
        console.log(`[EnhancedRAG]    ✓ ${category}/${fileName} (${chunks} chunk${chunks > 1 ? 's' : ''})`);
      });
    } else if (contextChunksToRetrieve === 0) {
      console.log(`[EnhancedRAG] ℹ️  No context chunks requested (contextChunks=0)`);
    }
    
    // 8. Retrieve Master Checklist if explicitly referenced
    let masterChecklistContent: string | undefined = undefined;
    if (includeMasterChecklist && knowledge.masterChecklist) {
      console.log('[EnhancedRAG] 📋 Including Master Checklist in context');
      masterChecklistContent = knowledge.masterChecklist.content;
    }
    
    // 9. Assemble tiered context
    let ragContext = assembleContext(
      knowledge.primaryContext,
      procedureResults,
      contextResults,
      sopSummaries,
      contextSummaries,
      options,
      masterChecklistContent
    );
    
    // 10. Enforce token limits if needed
    const maxTokens = options.maxTokens || 150000;
    ragContext = enforceTokenLimit(ragContext, maxTokens);
    
    // 11. Build metadata
    const sources = new Set<string>();
    procedureResults.forEach(r => sources.add(r.entry.metadata.fileName));
    contextResults.forEach(r => sources.add(r.entry.metadata.fileName));
    
    const metadata = {
      primaryContextIncluded: options.includeFullPrimary ?? true,
      procedureChunksRetrieved: procedureResults.length,
      contextChunksRetrieved: contextResults.length,
      summariesGenerated: sopSummaries.size,
      contextSummariesGenerated: contextSummaries.size,
      totalTokensEstimate: estimateTokens(ragContext),
      sources: Array.from(sources)
    };
    
    // 12. Extract external standards for footnote tracking in orchestrator
    const externalStandards = extractExternalStandards(knowledge.primaryContext);

    return {
      ragContext,
      metadata,
      procedureChunks: procedureResults,
      contextChunks: contextResults,
      externalStandards
    };
  }


  /**
   * Build RAG context for LLM prompt with relevance filtering
   * Uses VectorStore for semantic search
   * 
   * NOTE: This method is used by the older buildRAGContext flow.
   * For new prompt-based generation, use retrieveRelevantContext() instead.
   */
  async buildRAGContext(knowledge: KnowledgeCache, promptText?: string, projectPath?: string): Promise<string> {
    const sections: string[] = [];
    const MAX_CHUNKS_PER_SOURCE = 8; // Limit chunks to avoid token overflow
    
    // TIER 1: Role & Instructions
    sections.push('=== YOUR ROLE AND CRITICAL INSTRUCTIONS ===\n\n');
    sections.push('You are PhaserGun AI, an AI regulatory documentation expert.\n\n');
    sections.push('CRITICAL: Write directly as requested. Do NOT analyze or summarize reference materials.\n');
    sections.push('Follow the exact format, tone, and length specified in user requests.\n\n');
    sections.push('---\n\n');
    
    // TIER 2: Reference Materials Header
    sections.push('=== REFERENCE MATERIALS ===\n');
    
    // If no vector store or no prompt, skip retrieval
    if (!this.vectorStore) {
      console.warn('[EnhancedRAG] No vector store available for retrieval');
      return sections.join('');
    }
    
    // Section 2 & 3: Use vector store to retrieve relevant chunks
    if (promptText && this.useEmbeddings) {
      try {
        const embeddingService = await this.getEmbeddingService(projectPath || knowledge.projectPath);
        const queryEmbedding = await embeddingService.embedText(promptText);
        const queryEmbeddingArray = VectorStore.float32ArrayToNumbers(queryEmbedding);
        
        // Search for procedures
        const procedureResults = this.vectorStore.search(queryEmbeddingArray, MAX_CHUNKS_PER_SOURCE, 'procedure');
        if (procedureResults.length > 0) {
          sections.push('=== COMPANY PROCEDURES AND SOPS (Relevant Sections) ===\n');
          procedureResults.forEach((result, idx) => {
            sections.push(`\n--- ${result.entry.metadata.fileName} (Chunk ${result.entry.metadata.chunkIndex + 1}, Similarity: ${(result.similarity * 100).toFixed(1)}%) ---\n`);
            sections.push(result.entry.metadata.content);
            sections.push('\n');
          });
        }
        
        // Search for context
        const contextResults = this.vectorStore.search(queryEmbeddingArray, MAX_CHUNKS_PER_SOURCE, 'context');
        if (contextResults.length > 0) {
          sections.push('=== PROJECT-SPECIFIC CONTEXT (Relevant Sections) ===\n');
          contextResults.forEach((result, idx) => {
            sections.push(`\n--- ${result.entry.metadata.fileName} (Chunk ${result.entry.metadata.chunkIndex + 1}, Similarity: ${(result.similarity * 100).toFixed(1)}%) ---\n`);
            sections.push(result.entry.metadata.content);
            sections.push('\n');
          });
        }
      } catch (error) {
        console.warn('[EnhancedRAG] Vector search failed, returning primary context only:', error);
      }
    } else {
      // No query provided, return top chunks from each category
      const procedureEntries = this.vectorStore.getEntriesByCategory('procedure').slice(0, MAX_CHUNKS_PER_SOURCE);
      const contextEntries = this.vectorStore.getEntriesByCategory('context').slice(0, MAX_CHUNKS_PER_SOURCE);
      
      if (procedureEntries.length > 0) {
        sections.push('=== COMPANY PROCEDURES AND SOPS (Sample Sections) ===\n');
        procedureEntries.forEach((entry, idx) => {
          sections.push(`\n--- ${entry.metadata.fileName} (Chunk ${entry.metadata.chunkIndex + 1}) ---\n`);
          sections.push(entry.metadata.content);
          sections.push('\n');
        });
      }
      
      if (contextEntries.length > 0) {
        sections.push('=== PROJECT-SPECIFIC CONTEXT (Sample Sections) ===\n');
        contextEntries.forEach((entry, idx) => {
          sections.push(`\n--- ${entry.metadata.fileName} (Chunk ${entry.metadata.chunkIndex + 1}) ---\n`);
          sections.push(entry.metadata.content);
          sections.push('\n');
        });
      }
    }
    
    return sections.join('');
  }

  /**
   * Retrieve knowledge context for a given prompt query with relevance filtering
   */
  async retrieveKnowledge(
    projectPath: string,
    primaryContextPath: string,
    promptText?: string
  ): Promise<{ ragContext: string; metadata: any }> {
    const knowledge = await this.loadKnowledge(projectPath, primaryContextPath);
    const ragContext = await this.buildRAGContext(knowledge, promptText, projectPath);
    
    const stats = this.vectorStore?.getStats() || { procedureEntries: 0, contextEntries: 0, totalEntries: 0 };
    
    const metadata = {
      primaryContextLoaded: !!knowledge.primaryContext,
      proceduresChunksTotal: stats.procedureEntries,
      contextChunksTotal: stats.contextEntries,
      totalChunks: stats.totalEntries,
      embeddingsUsed: true,
      cachedAt: knowledge.indexedAt,
      fingerprint: knowledge.fingerprint.substring(0, 16),
      vectorStoreFingerprint: knowledge.vectorStoreFingerprint.substring(0, 16),
      relevanceFiltering: !!promptText
    };
    
    return { ragContext, metadata };
  }

  /**
   * Clear cache for a specific project
   */
  clearCache(projectPath?: string): void {
    if (projectPath) {
      this.cache.delete(projectPath);
      console.log(`[EnhancedRAG] Cache cleared for project: ${projectPath}`);
    } else {
      this.cache.clear();
      console.log('[EnhancedRAG] All caches cleared');
    }
  }
}

// Export singleton instance
export const enhancedRAGService = new EnhancedRAGService();
