import { ParsedDocument } from '@phasergun/shared-types';
import { ComprehensiveFileParser } from '@phasergun/file-parser';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface CategorizedContextFile {
  doc: ParsedDocument;
  contextCategory: 'primary-context-root' | 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy' | 'general';
}

/**
 * A procedure document tagged with its subcategory from the Procedures/ folder structure.
 * Mirrors ProcedureDoc in rag-core/vector-builder.ts but with the required subcategory field.
 * Maps to: knowledge_sources.procedures.subcategories in primary-context.yaml
 */
export interface CategorizedProcedureFile {
  doc: ParsedDocument;
  procedureSubcategory: 'sops' | 'quality_policies' | 'project_quality_plans';
  procedureCategoryId?: string;
}

export class DocumentLoader {
  private fileParser: ComprehensiveFileParser;

  constructor() {
    this.fileParser = new ComprehensiveFileParser();
  }

  async loadPrimaryContext(yamlPath: string): Promise<any> {
    console.log('[DocumentLoader] Loading primary context from:', yamlPath);
    const fileContents = await fs.readFile(yamlPath, 'utf8');
    const primaryContext = yaml.load(fileContents) as any;
    console.log('[DocumentLoader] Primary context loaded successfully');
    return primaryContext;
  }

  async loadProceduresFolder(folderPath: string): Promise<CategorizedProcedureFile[]> {
    console.log('[DocumentLoader] Loading Procedures folder:', folderPath);

    try {
      await fs.access(folderPath);
    } catch {
      console.warn('[DocumentLoader] Procedures folder not found or empty:', folderPath);
      return [];
    }

    const results: CategorizedProcedureFile[] = [];

    // Map known subfolder names to their subcategory IDs
    // Maps to: knowledge_sources.procedures.subcategories in primary-context.yaml
    const subfolderMapping: Record<string, 'sops' | 'quality_policies' | 'project_quality_plans'> = {
      'SOPs': 'sops',
      'QPs': 'quality_policies',
      'QaPs': 'project_quality_plans',
    };

    // Scan all documents in the Procedures tree once
    const allDocs = await this.fileParser.scanAndParseFolder(folderPath);

    for (const doc of allDocs) {
      const relPath = path.relative(folderPath, doc.filePath);
      const parts = relPath.split(path.sep);

      // Determine subcategory from the immediate parent folder name
      let subcategory: 'sops' | 'quality_policies' | 'project_quality_plans' = 'sops';
      if (parts.length > 1) {
        const parentFolder = parts[0];
        subcategory = subfolderMapping[parentFolder] ?? 'sops';
      }
      // Files at the Procedures/ root (parts.length === 1) default to 'sops' for backward compat

      results.push({ doc, procedureSubcategory: subcategory });
    }

    // Log a breakdown by subcategory
    const counts: Record<string, number> = {};
    for (const { procedureSubcategory } of results) {
      counts[procedureSubcategory] = (counts[procedureSubcategory] || 0) + 1;
    }
    Object.entries(counts).forEach(([sub, n]) =>
      console.log(`[DocumentLoader] ✓ ${n} procedure file(s) tagged as ${sub}`)
    );
    console.log(`[DocumentLoader] Total procedure files loaded: ${results.length}`);

    return results;
  }

  async loadContextFolder(folderPath: string): Promise<ParsedDocument[]> {
    console.log('[DocumentLoader] Loading Context folder:', folderPath);
    
    try {
      await fs.access(folderPath);
      const documents = await this.fileParser.scanAndParseFolder(folderPath);
      console.log(`[DocumentLoader] Loaded ${documents.length} files from Context folder`);
      return documents;
    } catch (error) {
      console.warn('[DocumentLoader] Context folder not found or empty:', folderPath);
      return [];
    }
  }

  async loadContextFolderStructured(contextBasePath: string): Promise<CategorizedContextFile[]> {
    console.log('[DocumentLoader] Loading structured Context folder:', contextBasePath);
    
    const categorizedFiles: CategorizedContextFile[] = [];
    
    try {
      await fs.access(contextBasePath);
      
      const categoryMapping: Record<string, 'initiation' | 'ongoing' | 'predicates' | 'regulatory-strategy'> = {
        'Initiation': 'initiation',
        'Ongoing': 'ongoing',
        'Predicates': 'predicates',
        'Regulatory Strategy': 'regulatory-strategy'
      };
      
      for (const [folderName, category] of Object.entries(categoryMapping)) {
        const folderPath = path.join(contextBasePath, folderName);
        
        try {
          await fs.access(folderPath);
          const docs = await this.fileParser.scanAndParseFolder(folderPath);
          
          for (const doc of docs) {
            categorizedFiles.push({ doc, contextCategory: category });
          }
          
          console.log(`[DocumentLoader] ✓ Loaded ${docs.length} files from ${folderName}/ (category: ${category})`);
        } catch {
          console.log(`[DocumentLoader] ⏭️  Skipping ${folderName}/ (not found)`);
        }
      }
      
      // Load General subfolder
      const generalPath = path.join(contextBasePath, 'General');
      try {
        await fs.access(generalPath);
        const generalDocs = await this.fileParser.scanAndParseFolder(generalPath);
        generalDocs.forEach(doc => {
          categorizedFiles.push({ doc, contextCategory: 'general' });
        });
        console.log(`[DocumentLoader] ✓ Loaded ${generalDocs.length} files from General/ (category: general)`);
      } catch {
        console.log('[DocumentLoader] ⏭️  Skipping General/ (not found)');
      }
      
      // Load root-level files (e.g., Primary Context.docx)
      // We need to scan the base folder and filter for files at root only
      const allDocs = await this.fileParser.scanAndParseFolder(contextBasePath);
      const rootDocs = allDocs.filter(doc => {
        const relPath = path.relative(contextBasePath, doc.filePath);
        // Check if file is at root (no directory separators in relative path)
        return !relPath.includes(path.sep);
      });
      
      if (rootDocs.length > 0) {
        rootDocs.forEach(doc => {
          categorizedFiles.push({ doc, contextCategory: 'primary-context-root' });
        });
        console.log(`[DocumentLoader] ✓ Loaded ${rootDocs.length} root-level files (category: primary-context-root)`);
      }
      
      console.log(`[DocumentLoader] ✓ Total context files loaded: ${categorizedFiles.length}`);
      
    } catch (error) {
      console.warn('[DocumentLoader] Context folder not found or empty:', contextBasePath);
    }
    
    return categorizedFiles;
  }

  async loadFile(filePath: string): Promise<ParsedDocument> {
    console.log('[DocumentLoader] Loading file:', filePath);
    // Parse the containing directory and find the specific file
    const dirPath = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const docs = await this.fileParser.scanAndParseFolder(dirPath);
    const doc = docs.find(d => d.fileName === fileName);
    
    if (!doc) {
      throw new Error(`File not found or could not be parsed: ${filePath}`);
    }
    
    return doc;
  }

  /**
   * Load the Project Master Record document and parse its field values into a key-value map.
   * The master record is formatted as:
   *   FIELD_NAME
   *       Field value text
   *
   * Looks for the file by scanning the Context folder (and its immediate subdirectories)
   * for any .docx file whose name contains both "master" and "record" (case-insensitive).
   * Falls back to the conventional name "Project-Master-Record.docx" first.
   *
   * Maps to: knowledge_sources.master_record in primary-context.yaml
   */
  async loadMasterRecord(contextPath: string): Promise<ParsedDocument | null> {
    console.log('[DocumentLoader] Loading Master Record...');

    // 1. Try the conventional exact name first
    const conventionalPath = path.join(contextPath, 'Project-Master-Record.docx');
    try {
      await fs.access(conventionalPath);
      const doc = await this.loadFile(conventionalPath);
      console.log('[DocumentLoader] ✓ Master Record loaded (conventional name):', doc.fileName);
      return doc;
    } catch {
      // Not at conventional path — fall through to directory scan
    }

    // 2. Scan the Context root for any file (with or without .docx extension)
    //    whose name contains "master" and "record".
    //    Extension-less files are handled by ComprehensiveFileParser via magic bytes.
    try {
      const entries = await fs.readdir(contextPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const nameLower = entry.name.toLowerCase();
        if (nameLower.includes('master') && nameLower.includes('record')) {
          const filePath = path.join(contextPath, entry.name);
          try {
            const doc = await this.loadFile(filePath);
            console.log('[DocumentLoader] ✓ Master Record loaded (by pattern scan):', doc.fileName);
            return doc;
          } catch (err) {
            console.warn(`[DocumentLoader] Could not load candidate "${entry.name}":`, err);
          }
        }
      }
    } catch (err) {
      console.warn('[DocumentLoader] Could not scan Context folder for master record:', err);
    }

    console.warn('[DocumentLoader] ⚠️  Master Record not found in Context folder (tried conventional name and pattern scan)');
    return null;
  }

  /**
   * Parse the text content of a master record document into a field-value map.
   *
   * Handles multiple formats that mammoth or other parsers may produce:
   *   1. Multi-line:   "FIELD_NAME\n    value text"  (standard definition-list style)
   *   2. Colon-sep:   "FIELD_NAME: value text"       (inline with colon)
   *   3. Tab-sep:     "FIELD_NAME\tvalue text"        (inline with tab, from table cells)
   *
   * Field names must be ALL_CAPS identifiers (letters, digits, underscores, min 3 chars).
   *
   * Returns a Map<FIELD_NAME, value> suitable for token substitution.
   */
  static parseMasterRecordFields(content: string): Map<string, string> {
    const fields = new Map<string, string>();
    // A field name is an all-caps identifier (may include underscores, digits)
    const fieldNamePattern = /^[A-Z][A-Z0-9_]{2,}$/;
    // Inline format: FIELD_NAME: value  OR  FIELD_NAME\tvalue
    const inlinePattern = /^([A-Z][A-Z0-9_]{2,})[\t:]\s*(.+)$/;

    const lines = content.split(/\r?\n/);

    let currentField: string | null = null;
    const valueLines: string[] = [];

    const flush = () => {
      if (currentField && valueLines.length > 0) {
        fields.set(currentField, valueLines.join(' ').trim());
      }
      currentField = null;
      valueLines.length = 0;
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        continue;
      }

      // Check for inline format first: "FIELD_NAME: value" or "FIELD_NAME\tvalue"
      const inlineMatch = line.match(inlinePattern);
      if (inlineMatch) {
        flush();
        fields.set(inlineMatch[1], inlineMatch[2].trim());
        currentField = null; // already stored, no multi-line continuation
        continue;
      }

      if (fieldNamePattern.test(line)) {
        // Bare field name on its own line — value is on subsequent lines
        flush();
        currentField = line;
      } else if (currentField) {
        // Value line for the current field
        valueLines.push(line);
      }
      // Lines before any field name (e.g. headings, descriptions) are ignored
    }

    flush(); // Save last field

    // ── Synthesize composite fields that prompts commonly reference ──────────
    //
    // TEAM_MEMBERS: the master record stores individual role fields
    // (PROJECT_MANAGER, LEAD_ENGINEER, etc.) but prompts reference TEAM_MEMBERS.
    // Build a composite so the token resolves to real data.
    if (!fields.has('TEAM_MEMBERS')) {
      const roleMap: Array<[string, string]> = [
        ['PROJECT_MANAGER',       'Project Manager'],
        ['LEAD_ENGINEER',         'Lead Engineer'],
        ['QUALITY_ENGINEER',      'Quality Engineer'],
        ['REGULATORY_AFFAIRS',    'Regulatory Affairs'],
        ['CLINICAL_REPRESENTATIVE','Clinical Representative'],
      ];
      const entries = roleMap
        .filter(([key]) => fields.has(key))
        .map(([key, label]) => `${label}: ${fields.get(key)}`);
      if (entries.length > 0) {
        fields.set('TEAM_MEMBERS', entries.join(', '));
      }
    }

    return fields;
  }

  /**
   * Parse master record field values from mammoth's HTML output.
   *
   * This is more reliable than raw text extraction because HTML preserves
   * the structural relationship between field names and values regardless
   * of whether the Word doc uses:
   *   • Bold field name + value in same paragraph
   *   • Bold field name paragraph + following value paragraph
   *   • Table with two columns (field name | value)
   *   • Plain colon-separated text: FIELD_NAME: value
   *
   * All four formats are supported.
   */
  static parseMasterRecordFieldsFromHtml(html: string): Map<string, string> {
    const fields = new Map<string, string>();
    const fieldNamePattern = /^[A-Z][A-Z0-9_]{2,}$/;

    // Decode common HTML entities and strip tags from a snippet
    const decode = (s: string) =>
      s
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        .replace(/&#8212;/g, '—')
        .replace(/&#8211;/g, '–')
        .replace(/&#[0-9]+;/g, c => String.fromCharCode(parseInt(c.slice(2, -1), 10)))
        .replace(/&[a-z]+;/g, '')
        .trim();

    // ── Strategy 1: Word tables ─────────────────────────────────────────────
    // <tr><td>FIELD_NAME</td><td>Value</td></tr>  (bold or not in first cell)
    const tableRowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = tableRowPattern.exec(html)) !== null) {
      const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
      if (cells.length >= 2) {
        const fieldText = decode(cells[0][1]);
        const valueText = decode(cells[1][1]);
        if (fieldNamePattern.test(fieldText) && valueText) {
          fields.set(fieldText, valueText);
        }
      }
    }

    // ── Strategy 2: Paragraphs ──────────────────────────────────────────────
    // Split on <p> tags and inspect each paragraph
    const paragraphPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let currentField: string | null = null;
    let pMatch: RegExpExecArray | null;

    while ((pMatch = paragraphPattern.exec(html)) !== null) {
      const inner = pMatch[1];
      const text = decode(inner);
      if (!text) continue;

      // -- 2a: Same-paragraph bold name + inline value -----------------------
      // e.g. <p><strong>PROJECT_MANAGER</strong> Rohun</p>
      const boldMatch = inner.match(/<(?:strong|b)[^>]*>([^<]+)<\/(?:strong|b)>\s*([\s\S]*)/i);
      if (boldMatch) {
        const boldText = decode(boldMatch[1]);
        const afterBold = decode(boldMatch[2]);
        if (fieldNamePattern.test(boldText)) {
          if (afterBold) {
            fields.set(boldText, afterBold);
            currentField = null;
          } else {
            // Field name only — value is in the next paragraph
            currentField = boldText;
          }
          continue;
        }
      }

      // -- 2b: Colon-separated: FIELD_NAME: value ----------------------------
      const colonMatch = text.match(/^([A-Z][A-Z0-9_]{2,}):\s*(.+)$/s);
      if (colonMatch) {
        fields.set(colonMatch[1], colonMatch[2].trim());
        currentField = null;
        continue;
      }

      // -- 2c: Tab-separated: FIELD_NAME\tvalue (mammoth table fallback) ------
      const tabMatch = text.match(/^([A-Z][A-Z0-9_]{2,})\t(.+)$/);
      if (tabMatch) {
        fields.set(tabMatch[1], tabMatch[2].trim());
        currentField = null;
        continue;
      }

      // -- 2d: Standalone ALL_CAPS field name --------------------------------
      if (fieldNamePattern.test(text)) {
        currentField = text;
        continue;
      }

      // -- 2e: Value line following a standalone field name ------------------
      if (currentField && text) {
        if (!fields.has(currentField)) {
          fields.set(currentField, text);
        }
        currentField = null;
      }
    }

    return fields;
  }

  /**
   * Parse master record field values directly from the .docx file on disk,
   * using mammoth's HTML output for structural fidelity.
   *
   * Falls back to raw-text parsing (parseMasterRecordFields) if HTML extraction fails.
   *
   * This is the preferred entry point for the orchestrator — it handles all
   * common Word document formatting styles without requiring the user to
   * follow a specific layout.
   */
  static async parseMasterRecordFieldsFromFile(filePath: string): Promise<Map<string, string>> {
    try {
      const mammoth = await import('mammoth');
      const fileBuffer = await fs.readFile(filePath);
      const { value: html } = await mammoth.convertToHtml({ buffer: fileBuffer });

      const htmlFields = DocumentLoader.parseMasterRecordFieldsFromHtml(html);

      if (htmlFields.size > 0) {
        console.log(`[DocumentLoader] ✓ Parsed ${htmlFields.size} field(s) from master record (HTML)`);

        // Post-process: synthesize composite TEAM_MEMBERS if not already present
        const withComposites = DocumentLoader.synthesizeCompositeFields(htmlFields);
        return withComposites;
      }
    } catch (err) {
      console.warn('[DocumentLoader] HTML parsing failed for master record, falling back to raw text:', err);
    }

    // Fallback: raw-text content was already extracted by ComprehensiveFileParser
    // (returned by loadMasterRecord as doc.content)
    return new Map(); // caller should fall back to parseMasterRecordFields(doc.content)
  }

  /**
   * Synthesize composite fields (e.g. TEAM_MEMBERS from individual role fields).
   * Extracted here so both raw-text and HTML parsers share the same logic.
   */
  static synthesizeCompositeFields(fields: Map<string, string>): Map<string, string> {
    if (!fields.has('TEAM_MEMBERS')) {
      const roleMap: Array<[string, string]> = [
        ['PROJECT_MANAGER',        'Project Manager'],
        ['LEAD_ENGINEER',          'Lead Engineer'],
        ['QUALITY_ENGINEER',       'Quality Engineer'],
        ['REGULATORY_AFFAIRS',     'Regulatory Affairs'],
        ['CLINICAL_REPRESENTATIVE','Clinical Representative'],
      ];
      const entries = roleMap
        .filter(([key]) => fields.has(key))
        .map(([key, label]) => `${label}: ${fields.get(key)}`);
      if (entries.length > 0) {
        fields.set('TEAM_MEMBERS', entries.join(', '));
      }
    }
    return fields;
  }

  /**
   * Load a bootstrap document by its referenced name.
   * The referenced name (e.g., "DDP-Bootstrap-Phase1.docx") may not match the exact filename
   * on disk (e.g., "DDP-Bootstrap-Phase1-V4.docx"), so this method does fuzzy matching:
   *   1. Exact filename match
   *   2. Filename starts with the base name (handles version suffixes like -V4)
   *   3. Filename contains the base name
   *
   * Searches the Context root and one level of subdirectories.
   *
   * Maps to: knowledge_sources.document_bootstraps in primary-context.yaml
   */
  async loadBootstrapDocument(contextPath: string, bootstrapDocName: string): Promise<ParsedDocument | null> {
    console.log(`[DocumentLoader] Loading bootstrap document: ${bootstrapDocName}`);

    // Normalize: strip extension for matching
    const refBaseLower = bootstrapDocName.replace(/\.docx$/i, '').toLowerCase();

    // Build search directories: Context root + one level of subdirectories
    const searchDirs: string[] = [contextPath];
    try {
      const entries = await fs.readdir(contextPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          searchDirs.push(path.join(contextPath, entry.name));
        }
      }
    } catch {}

    for (const searchDir of searchDirs) {
      let entries: import('fs').Dirent[];
      try {
        entries = await fs.readdir(searchDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const nameLower = entry.name.toLowerCase();
        // Strip .docx extension if present for comparison (also handles extension-less files)
        const baseNameLower = nameLower.replace(/\.docx$/i, '');

        const isMatch =
          baseNameLower === refBaseLower ||            // exact
          baseNameLower.startsWith(refBaseLower) ||    // version suffix (DDP-Bootstrap-Phase1-V4)
          baseNameLower.includes(refBaseLower);        // contains

        if (isMatch) {
          const filePath = path.join(searchDir, entry.name);
          try {
            const doc = await this.loadFile(filePath);
            console.log(`[DocumentLoader] ✓ Bootstrap doc loaded: ${doc.fileName} (for reference: "${bootstrapDocName}")`);
            return doc;
          } catch (err) {
            console.warn(`[DocumentLoader] Could not parse bootstrap file ${filePath}:`, err);
          }
        }
      }
    }

    console.warn(`[DocumentLoader] ⚠️  Bootstrap document not found: "${bootstrapDocName}" (searched in ${contextPath})`);
    return null;
  }

  async loadMasterChecklist(contextPath: string): Promise<ParsedDocument | null> {
    console.log('[DocumentLoader] Loading Master Checklist...');
    
    const checklistPath = path.join(contextPath, 'Project-Master-Checklist.docx');
    
    try {
      await fs.access(checklistPath);
      const doc = await this.loadFile(checklistPath);
      console.log('[DocumentLoader] ✓ Master Checklist loaded:', doc.fileName);
      return doc;
    } catch (error) {
      console.log('[DocumentLoader] ⏭️  Master Checklist not found (Project-Master-Checklist.docx)');
      return null;
    }
  }
}
