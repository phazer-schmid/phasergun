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
     * Load and parse all files from Procedures folder
     */
    async loadProceduresFolder(folderPath) {
        console.log('[EnhancedRAG] Loading Procedures folder:', folderPath);
        try {
            await fs.access(folderPath);
            const documents = await this.fileParser.scanAndParseFolder(folderPath);
            console.log(`[EnhancedRAG] Loaded ${documents.length} files from Procedures folder`);
            return documents;
        }
        catch (error) {
            console.warn('[EnhancedRAG] Procedures folder not found or empty:', folderPath);
            return [];
        }
    }
    /**
     * Load and parse all files from Context folder
     */
    async loadContextFolder(folderPath) {
        console.log('[EnhancedRAG] Loading Context folder:', folderPath);
        try {
            await fs.access(folderPath);
            const documents = await this.fileParser.scanAndParseFolder(folderPath);
            console.log(`[EnhancedRAG] Loaded ${documents.length} files from Context folder`);
            return documents;
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
        const [primaryContext, proceduresFiles, contextFiles] = await Promise.all([
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
            proceduresFiles,
            contextFiles,
            indexedAt: new Date().toISOString()
        };
        // Store in cache
        this.cache.set(projectPath, knowledgeCache);
        console.log('[EnhancedRAG] ========================================');
        console.log('[EnhancedRAG] Knowledge Base Loaded Successfully');
        console.log(`[EnhancedRAG] Primary Context: ✓`);
        console.log(`[EnhancedRAG] Procedures: ${proceduresFiles.length} files`);
        console.log(`[EnhancedRAG] Context: ${contextFiles.length} files`);
        console.log(`[EnhancedRAG] Cache Fingerprint: ${fingerprint.substring(0, 16)}...`);
        console.log('[EnhancedRAG] ========================================\n');
        return knowledgeCache;
    }
    /**
     * Build RAG context for LLM prompt
     */
    buildRAGContext(knowledge) {
        const sections = [];
        // Section 1: Primary Context (PhaserGun role and framework)
        sections.push('=== PRIMARY CONTEXT: PHASERGUN AI REGULATORY ENGINEER ===\n');
        sections.push(yaml.dump(knowledge.primaryContext));
        sections.push('\n');
        // Section 2: Procedures (Company SOPs and Guidelines)
        if (knowledge.proceduresFiles.length > 0) {
            sections.push('=== COMPANY PROCEDURES AND SOPS ===\n');
            knowledge.proceduresFiles.forEach((doc, idx) => {
                sections.push(`\n--- Procedure ${idx + 1}: ${doc.fileName} ---\n`);
                sections.push(doc.content);
                sections.push('\n');
            });
        }
        // Section 3: Context (Project-Specific Information)
        if (knowledge.contextFiles.length > 0) {
            sections.push('=== PROJECT-SPECIFIC CONTEXT ===\n');
            knowledge.contextFiles.forEach((doc, idx) => {
                sections.push(`\n--- Context Document ${idx + 1}: ${doc.fileName} ---\n`);
                sections.push(doc.content);
                sections.push('\n');
            });
        }
        return sections.join('');
    }
    /**
     * Retrieve knowledge context for a given prompt query
     * This can be enhanced with semantic search later
     */
    async retrieveKnowledge(projectPath, primaryContextPath, query) {
        const knowledge = await this.loadKnowledge(projectPath, primaryContextPath);
        const ragContext = this.buildRAGContext(knowledge);
        const metadata = {
            primaryContextLoaded: !!knowledge.primaryContext,
            proceduresCount: knowledge.proceduresFiles.length,
            contextFilesCount: knowledge.contextFiles.length,
            cachedAt: knowledge.indexedAt,
            fingerprint: knowledge.fingerprint.substring(0, 16)
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
