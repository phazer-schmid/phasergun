"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhancedRAGService = exports.EnhancedRAGService = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const crypto = __importStar(require("crypto"));
const file_parser_1 = require("@fda-compliance/file-parser");
/**
 * Enhanced RAG Service for DHF Document Generation
 * Combines three knowledge sources:
 * 1. Static: primary-context.yaml (PhaserGun role, regulatory framework)
 * 2. Dynamic: Files in /Procedures folder (SOPs, company guidelines)
 * 3. Dynamic: Files in /Context folder (project-specific information)
 */
class EnhancedRAGService {
    cache = new Map();
    fileParser;
    constructor() {
        this.fileParser = new file_parser_1.ComprehensiveFileParser();
    }
    /**
     * Load primary context from YAML file
     */
    async loadPrimaryContext(yamlPath) {
        console.log('[EnhancedRAG] Loading primary context from:', yamlPath);
        const fileContents = await fs.readFile(yamlPath, 'utf8');
        const primaryContext = yaml.load(fileContents);
        console.log('[EnhancedRAG] Primary context loaded successfully');
        return primaryContext;
    }
    /**
     * Chunk a document into semantic segments
     */
    chunkDocument(doc) {
        const chunks = [];
        const content = doc.content;
        // Split by double newlines (paragraphs) or by sections
        const segments = content.split(/\n\n+/);
        // Combine small segments and split large ones to target ~500-1000 chars per chunk
        const targetChunkSize = 800;
        const maxChunkSize = 1500;
        let currentChunk = '';
        let chunkIndex = 0;
        for (const segment of segments) {
            const trimmed = segment.trim();
            if (!trimmed)
                continue;
            // If current chunk + segment is still reasonable size, combine them
            if (currentChunk.length > 0 && (currentChunk.length + trimmed.length) < maxChunkSize) {
                currentChunk += '\n\n' + trimmed;
            }
            else {
                // Save current chunk if it exists
                if (currentChunk.length > 0) {
                    chunks.push({
                        content: currentChunk,
                        fileName: doc.fileName,
                        filePath: doc.filePath,
                        chunkIndex: chunkIndex++,
                        totalChunks: 0, // Will update after
                        keywords: this.extractKeywords(currentChunk)
                    });
                }
                // Start new chunk
                // If segment itself is too large, split it
                if (trimmed.length > maxChunkSize) {
                    const subChunks = this.splitLargeText(trimmed, targetChunkSize);
                    for (const subChunk of subChunks) {
                        chunks.push({
                            content: subChunk,
                            fileName: doc.fileName,
                            filePath: doc.filePath,
                            chunkIndex: chunkIndex++,
                            totalChunks: 0,
                            keywords: this.extractKeywords(subChunk)
                        });
                    }
                    currentChunk = '';
                }
                else {
                    currentChunk = trimmed;
                }
            }
        }
        // Don't forget the last chunk
        if (currentChunk.length > 0) {
            chunks.push({
                content: currentChunk,
                fileName: doc.fileName,
                filePath: doc.filePath,
                chunkIndex: chunkIndex++,
                totalChunks: 0,
                keywords: this.extractKeywords(currentChunk)
            });
        }
        // Update totalChunks for all chunks
        chunks.forEach(chunk => chunk.totalChunks = chunks.length);
        return chunks;
    }
    /**
     * Split large text into smaller chunks
     */
    splitLargeText(text, targetSize) {
        const chunks = [];
        const sentences = text.split(/\.(?:\s|$)/);
        let currentChunk = '';
        for (const sentence of sentences) {
            if (!sentence.trim())
                continue;
            if (currentChunk.length + sentence.length < targetSize * 1.5) {
                currentChunk += sentence + '. ';
            }
            else {
                if (currentChunk)
                    chunks.push(currentChunk.trim());
                currentChunk = sentence + '. ';
            }
        }
        if (currentChunk)
            chunks.push(currentChunk.trim());
        return chunks;
    }
    /**
     * Extract keywords from text for relevance matching
     */
    extractKeywords(text) {
        // Convert to lowercase and remove special characters
        const cleaned = text.toLowerCase().replace(/[^\w\s]/g, ' ');
        // Common stop words to filter out
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'been', 'be',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
            'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
        ]);
        // Extract words, filter stop words, count frequency
        const words = cleaned.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
        // Get unique important keywords (simple frequency-based)
        const frequency = new Map();
        words.forEach(word => frequency.set(word, (frequency.get(word) || 0) + 1));
        // Return top keywords sorted by frequency
        return Array.from(frequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([word]) => word);
    }
    /**
     * Load and chunk all files from Procedures folder
     */
    async loadProceduresFolder(folderPath) {
        console.log('[EnhancedRAG] Loading Procedures folder:', folderPath);
        try {
            await fs.access(folderPath);
            const documents = await this.fileParser.scanAndParseFolder(folderPath);
            console.log(`[EnhancedRAG] Loaded ${documents.length} files from Procedures folder`);
            // Chunk all documents
            const allChunks = [];
            for (const doc of documents) {
                const chunks = this.chunkDocument(doc);
                allChunks.push(...chunks);
            }
            console.log(`[EnhancedRAG] Created ${allChunks.length} chunks from Procedures`);
            return allChunks;
        }
        catch (error) {
            console.warn('[EnhancedRAG] Procedures folder not found or empty:', folderPath);
            return [];
        }
    }
    /**
     * Load and chunk all files from Context folder
     */
    async loadContextFolder(folderPath) {
        console.log('[EnhancedRAG] Loading Context folder:', folderPath);
        try {
            await fs.access(folderPath);
            const documents = await this.fileParser.scanAndParseFolder(folderPath);
            console.log(`[EnhancedRAG] Loaded ${documents.length} files from Context folder`);
            // Chunk all documents
            const allChunks = [];
            for (const doc of documents) {
                const chunks = this.chunkDocument(doc);
                allChunks.push(...chunks);
            }
            console.log(`[EnhancedRAG] Created ${allChunks.length} chunks from Context`);
            return allChunks;
        }
        catch (error) {
            console.warn('[EnhancedRAG] Context folder not found or empty:', folderPath);
            return [];
        }
    }
    /**
     * Compute fingerprint for a folder (all file paths, sizes, and mtimes)
     */
    async computeFolderFingerprint(folderPath) {
        try {
            await fs.access(folderPath);
            const files = await this.getAllFiles(folderPath);
            const fileInfos = await Promise.all(files.map(async (filePath) => {
                const stats = await fs.stat(filePath);
                return `${filePath}:${stats.size}:${stats.mtimeMs}`;
            }));
            const combined = fileInfos.sort().join('|');
            return crypto.createHash('sha256').update(combined).digest('hex');
        }
        catch (error) {
            // Folder doesn't exist, return empty fingerprint
            return crypto.createHash('sha256').update('empty').digest('hex');
        }
    }
    /**
     * Recursively get all files from a directory
     */
    async getAllFiles(dirPath) {
        const files = [];
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    const subFiles = await this.getAllFiles(fullPath);
                    files.push(...subFiles);
                }
                else if (entry.isFile()) {
                    files.push(fullPath);
                }
            }
        }
        catch (error) {
            console.error(`Error reading directory ${dirPath}:`, error);
        }
        return files;
    }
    /**
     * Compute combined fingerprint for cache validation
     */
    async computeCacheFingerprint(projectPath, primaryContextPath) {
        const proceduresPath = path.join(projectPath, 'Procedures');
        const contextPath = path.join(projectPath, 'Context');
        // Get fingerprints for all three sources
        const [primaryStats, proceduresFingerprint, contextFingerprint] = await Promise.all([
            fs.stat(primaryContextPath).catch(() => ({ mtimeMs: 0, size: 0 })),
            this.computeFolderFingerprint(proceduresPath),
            this.computeFolderFingerprint(contextPath)
        ]);
        const primaryFingerprint = `${primaryContextPath}:${primaryStats.size}:${primaryStats.mtimeMs}`;
        const combined = `${primaryFingerprint}|${proceduresFingerprint}|${contextFingerprint}`;
        return crypto.createHash('sha256').update(combined).digest('hex');
    }
    /**
     * Check if cache is valid for a project
     */
    async isCacheValid(projectPath, primaryContextPath) {
        const cached = this.cache.get(projectPath);
        if (!cached) {
            return false;
        }
        const currentFingerprint = await this.computeCacheFingerprint(projectPath, primaryContextPath);
        return cached.fingerprint === currentFingerprint;
    }
    /**
     * Load all knowledge sources with caching
     */
    async loadKnowledge(projectPath, primaryContextPath) {
        console.log('\n[EnhancedRAG] ========================================');
        console.log('[EnhancedRAG] Loading Knowledge Base');
        console.log('[EnhancedRAG] ========================================\n');
        // Check if cache is valid
        const cacheValid = await this.isCacheValid(projectPath, primaryContextPath);
        if (cacheValid) {
            console.log('[EnhancedRAG] ✓ Cache is valid, using cached knowledge\n');
            return this.cache.get(projectPath);
        }
        console.log('[EnhancedRAG] Cache invalid or missing, loading fresh knowledge...\n');
        // Load all three sources
        const [primaryContext, proceduresChunks, contextChunks] = await Promise.all([
            this.loadPrimaryContext(primaryContextPath),
            this.loadProceduresFolder(path.join(projectPath, 'Procedures')),
            this.loadContextFolder(path.join(projectPath, 'Context'))
        ]);
        // Compute fingerprint
        const fingerprint = await this.computeCacheFingerprint(projectPath, primaryContextPath);
        // Create cache entry
        const knowledgeCache = {
            projectPath,
            fingerprint,
            primaryContext,
            proceduresChunks,
            contextChunks,
            indexedAt: new Date().toISOString()
        };
        // Store in cache
        this.cache.set(projectPath, knowledgeCache);
        console.log('[EnhancedRAG] ========================================');
        console.log('[EnhancedRAG] Knowledge Base Loaded Successfully');
        console.log(`[EnhancedRAG] Primary Context: ✓`);
        console.log(`[EnhancedRAG] Procedures: ${proceduresChunks.length} chunks`);
        console.log(`[EnhancedRAG] Context: ${contextChunks.length} chunks`);
        console.log(`[EnhancedRAG] Cache Fingerprint: ${fingerprint.substring(0, 16)}...`);
        console.log('[EnhancedRAG] ========================================\n');
        return knowledgeCache;
    }
    /**
     * Calculate relevance score between query and chunk
     */
    calculateRelevance(queryKeywords, chunk) {
        const chunkKeywords = new Set(chunk.keywords);
        let matches = 0;
        // Count how many query keywords appear in chunk keywords
        for (const keyword of queryKeywords) {
            if (chunkKeywords.has(keyword)) {
                matches++;
            }
        }
        // Normalize by query length
        return queryKeywords.length > 0 ? matches / queryKeywords.length : 0;
    }
    /**
     * Retrieve top-K most relevant chunks based on query
     */
    retrieveRelevantChunks(chunks, queryKeywords, topK = 5) {
        // Score all chunks
        const scoredChunks = chunks.map(chunk => ({
            chunk,
            score: this.calculateRelevance(queryKeywords, chunk)
        }));
        // Sort by score and take top K
        return scoredChunks
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(sc => sc.chunk);
    }
    /**
     * Build RAG context for LLM prompt with relevance filtering
     */
    buildRAGContext(knowledge, promptText) {
        const sections = [];
        const MAX_CHUNKS_PER_SOURCE = 8; // Limit chunks to avoid token overflow
        // Extract keywords from prompt for relevance matching
        const promptKeywords = promptText ? this.extractKeywords(promptText) : [];
        // Section 1: Primary Context (always include - it's the role definition)
        sections.push('=== PRIMARY CONTEXT: PHASERGUN AI REGULATORY ENGINEER ===\n');
        sections.push(yaml.dump(knowledge.primaryContext));
        sections.push('\n');
        // Section 2: Procedures (Company SOPs and Guidelines) - Top relevant chunks
        if (knowledge.proceduresChunks.length > 0) {
            const relevantChunks = promptKeywords.length > 0
                ? this.retrieveRelevantChunks(knowledge.proceduresChunks, promptKeywords, MAX_CHUNKS_PER_SOURCE)
                : knowledge.proceduresChunks.slice(0, MAX_CHUNKS_PER_SOURCE);
            if (relevantChunks.length > 0) {
                sections.push('=== COMPANY PROCEDURES AND SOPS (Relevant Sections) ===\n');
                relevantChunks.forEach((chunk, idx) => {
                    sections.push(`\n--- ${chunk.fileName} (Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks}) ---\n`);
                    sections.push(chunk.content);
                    sections.push('\n');
                });
            }
        }
        // Section 3: Context (Project-Specific Information) - Top relevant chunks
        if (knowledge.contextChunks.length > 0) {
            const relevantChunks = promptKeywords.length > 0
                ? this.retrieveRelevantChunks(knowledge.contextChunks, promptKeywords, MAX_CHUNKS_PER_SOURCE)
                : knowledge.contextChunks.slice(0, MAX_CHUNKS_PER_SOURCE);
            if (relevantChunks.length > 0) {
                sections.push('=== PROJECT-SPECIFIC CONTEXT (Relevant Sections) ===\n');
                relevantChunks.forEach((chunk, idx) => {
                    sections.push(`\n--- ${chunk.fileName} (Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks}) ---\n`);
                    sections.push(chunk.content);
                    sections.push('\n');
                });
            }
        }
        return sections.join('');
    }
    /**
     * Retrieve knowledge context for a given prompt query with relevance filtering
     */
    async retrieveKnowledge(projectPath, primaryContextPath, promptText) {
        const knowledge = await this.loadKnowledge(projectPath, primaryContextPath);
        const ragContext = this.buildRAGContext(knowledge, promptText);
        const metadata = {
            primaryContextLoaded: !!knowledge.primaryContext,
            proceduresChunksTotal: knowledge.proceduresChunks.length,
            contextChunksTotal: knowledge.contextChunks.length,
            cachedAt: knowledge.indexedAt,
            fingerprint: knowledge.fingerprint.substring(0, 16),
            relevanceFiltering: !!promptText
        };
        return { ragContext, metadata };
    }
    /**
     * Clear cache for a specific project
     */
    clearCache(projectPath) {
        if (projectPath) {
            this.cache.delete(projectPath);
            console.log(`[EnhancedRAG] Cache cleared for project: ${projectPath}`);
        }
        else {
            this.cache.clear();
            console.log('[EnhancedRAG] All caches cleared');
        }
    }
}
exports.EnhancedRAGService = EnhancedRAGService;
// Export singleton instance
exports.enhancedRAGService = new EnhancedRAGService();
