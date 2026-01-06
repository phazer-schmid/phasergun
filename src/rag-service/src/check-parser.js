"use strict";
/**
 * Check Parser Service
 * Parses DOCX check documents to extract validation criteria
 */
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
exports.parseCheckDocument = parseCheckDocument;
exports.listCheckFiles = listCheckFiles;
exports.getCheckFilePath = getCheckFilePath;
const fs = __importStar(require("fs/promises"));
const mammoth = __importStar(require("mammoth"));
/**
 * Parse a check DOCX file and extract criteria
 */
async function parseCheckDocument(filePath, filename, phase) {
    try {
        // Read and parse DOCX file
        const result = await mammoth.extractRawText({ path: filePath });
        const rawContent = result.value;
        if (!rawContent || rawContent.trim().length === 0) {
            return {
                success: false,
                error: `Check document '${filename}' is empty or could not be read`,
                filename
            };
        }
        // Find the Criteria section
        const criteriaSection = extractCriteriaSection(rawContent);
        if (!criteriaSection) {
            return {
                success: false,
                error: `Check document '${filename}' is missing required 'Criteria' section`,
                filename
            };
        }
        // Extract individual criteria items
        const criteria = extractCriteriaItems(criteriaSection);
        if (criteria.length === 0) {
            return {
                success: false,
                error: `Criteria section in '${filename}' is empty or improperly formatted. Expected bullet points or numbered list.`,
                filename
            };
        }
        // Generate display name from filename (remove .docx extension)
        const checkName = filename.replace(/\.docx$/i, '');
        return {
            success: true,
            filename,
            checkName,
            phase,
            criteria,
            rawContent
        };
    }
    catch (error) {
        return {
            success: false,
            error: `Unable to parse check document '${filename}': ${error.message}. File may be corrupted.`,
            filename
        };
    }
}
/**
 * Extract the Criteria section from document content
 */
function extractCriteriaSection(content) {
    // Look for "Criteria" header (case-insensitive)
    const lines = content.split('\n');
    let criteriaStartIndex = -1;
    let nextSectionIndex = -1;
    // Find where Criteria section starts
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^criteria$/i.test(line)) {
            criteriaStartIndex = i;
            break;
        }
    }
    if (criteriaStartIndex === -1) {
        return null;
    }
    // Find where next section starts (sections typically start with a single word followed by newline)
    // Common sections: "Notes", "Scope", "Check", "Remediation", etc.
    for (let i = criteriaStartIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
        // Check if this looks like a section header (short line, followed by content or empty line)
        if (line.length > 0 && line.length < 50 && /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(line)) {
            // This might be a section header
            // Verify it's not just part of criteria text by checking if next line is empty or starts new content
            if (nextLine.length === 0 || /^[A-Z]/.test(nextLine)) {
                nextSectionIndex = i;
                break;
            }
        }
    }
    // Extract criteria section text
    const endIndex = nextSectionIndex !== -1 ? nextSectionIndex : lines.length;
    const criteriaLines = lines.slice(criteriaStartIndex + 1, endIndex);
    return criteriaLines.join('\n').trim();
}
/**
 * Extract individual criteria items from criteria section text
 */
function extractCriteriaItems(criteriaText) {
    const criteria = [];
    const lines = criteriaText.split('\n');
    let currentCriterion = '';
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.length === 0) {
            // Empty line - if we have accumulated criterion text, save it
            if (currentCriterion.trim().length > 0) {
                criteria.push(currentCriterion.trim());
                currentCriterion = '';
            }
            continue;
        }
        // Check if line starts a new criterion (typically starts with bullet, number, or letter)
        // Common patterns: "•", "-", "*", "1.", "a)", etc.
        const isBulletPoint = /^[\u2022\u2023\u25E6\u2043\u2219•\-\*]/.test(trimmedLine);
        const isNumbered = /^\d+[\.\)]/.test(trimmedLine);
        const isLettered = /^[a-z][\.\)]/.test(trimmedLine);
        if (isBulletPoint || isNumbered || isLettered) {
            // Save previous criterion if exists
            if (currentCriterion.trim().length > 0) {
                criteria.push(currentCriterion.trim());
            }
            // Start new criterion (remove bullet/number prefix)
            currentCriterion = trimmedLine.replace(/^[\u2022\u2023\u25E6\u2043\u2219•\-\*\d+a-z][\.\)]*\s*/, '');
        }
        else {
            // Continuation of current criterion
            if (currentCriterion.length > 0) {
                currentCriterion += ' ' + trimmedLine;
            }
            else {
                // First line without bullet - still add it
                currentCriterion = trimmedLine;
            }
        }
    }
    // Add final criterion
    if (currentCriterion.trim().length > 0) {
        criteria.push(currentCriterion.trim());
    }
    return criteria;
}
/**
 * List all check files in a phase folder
 */
async function listCheckFiles(ragChecksPath, phase) {
    try {
        const phaseFolderPath = `${ragChecksPath}/Phase ${phase}`;
        // Check if phase folder exists
        try {
            await fs.access(phaseFolderPath);
        }
        catch {
            // Phase folder doesn't exist
            return [];
        }
        const entries = await fs.readdir(phaseFolderPath, { withFileTypes: true });
        // Filter to only .docx files (not temp files like ~$*.docx)
        const checkFiles = entries
            .filter(entry => entry.isFile() &&
            entry.name.endsWith('.docx') &&
            !entry.name.startsWith('~$'))
            .map(entry => entry.name);
        return checkFiles.sort();
    }
    catch (error) {
        console.error(`[CheckParser] Error listing check files for Phase ${phase}:`, error);
        return [];
    }
}
/**
 * Get full path to a check file
 */
function getCheckFilePath(ragChecksPath, phase, filename) {
    return `${ragChecksPath}/Phase ${phase}/${filename}`;
}
