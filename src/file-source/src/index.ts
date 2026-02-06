import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * File Metadata Interface
 */
export interface FileMetadata {
  name: string;
  path: string;
  mimeType: string;
  size: number;
  modifiedTime: Date;
  isFolder: boolean;
  children?: FileMetadata[]; // For nested directory listing
}

/**
 * Folder Contents Interface
 */
export interface FolderContents {
  files: FileMetadata[];
  folders: FileMetadata[];
}

/**
 * MIME type mapping for supported file extensions
 */
const MIME_TYPES: Record<string, string> = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml'
};

/**
 * Supported file extensions for filtering
 */
const SUPPORTED_EXTENSIONS = new Set(['.docx', '.pdf', '.txt', '.md', '.xlsx', '.yaml', '.yml']);

/**
 * Local Filesystem Implementation
 * Real filesystem adapter for reading project files
 */
export class LocalFileSource {
  /**
   * List contents of a folder recursively
   * @param folderPath - Absolute or relative path to folder
   * @returns Folder contents with files and folders
   */
  async listFolder(folderPath: string): Promise<FolderContents> {
    console.log(`[LocalFileSource] Listing folder: ${folderPath}`);

    // Verify folder exists
    await this.verifyFolderExists(folderPath);

    const files: FileMetadata[] = [];
    const folders: FileMetadata[] = [];

    await this.listFolderRecursive(folderPath, files, folders);

    console.log(`[LocalFileSource] Found ${files.length} files and ${folders.length} folders`);
    return { files, folders };
  }

  /**
   * List contents of a folder (single level, non-recursive)
   * @param folderPath - Absolute or relative path to folder
   * @returns Folder contents with files and folders at top level only
   */
  async listFolderFlat(folderPath: string): Promise<FolderContents> {
    console.log(`[LocalFileSource] Listing folder (flat): ${folderPath}`);

    // Verify folder exists
    await this.verifyFolderExists(folderPath);

    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const files: FileMetadata[] = [];
    const folders: FileMetadata[] = [];

    for (const entry of entries) {
      // Skip hidden files and folders (starting with .)
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(folderPath, entry.name);
      const stats = await fs.stat(fullPath);

      if (entry.isDirectory()) {
        folders.push({
          name: entry.name,
          path: fullPath,
          mimeType: 'folder',
          size: 0,
          modifiedTime: stats.mtime,
          isFolder: true
        });
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        
        // Strict filtering: throw error for unsupported file types
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          throw new Error(
            `Unsupported file type: ${fullPath}\n` +
            `Supported extensions: ${Array.from(SUPPORTED_EXTENSIONS).join(', ')}`
          );
        }

        files.push({
          name: entry.name,
          path: fullPath,
          mimeType: this.getMimeType(ext),
          size: stats.size,
          modifiedTime: stats.mtime,
          isFolder: false
        });
      }
    }

    console.log(`[LocalFileSource] Found ${files.length} files and ${folders.length} folders (flat)`);
    return { files, folders };
  }

  /**
   * List folder contents as nested tree structure
   * @param folderPath - Absolute or relative path to folder
   * @returns Root folder metadata with children populated recursively
   */
  async listTree(folderPath: string): Promise<FileMetadata> {
    console.log(`[LocalFileSource] Building tree for: ${folderPath}`);

    // Verify folder exists
    await this.verifyFolderExists(folderPath);

    const stats = await fs.stat(folderPath);
    const folderName = path.basename(folderPath);

    const root: FileMetadata = {
      name: folderName,
      path: folderPath,
      mimeType: 'folder',
      size: 0,
      modifiedTime: stats.mtime,
      isFolder: true,
      children: []
    };

    await this.buildTree(folderPath, root);

    console.log(`[LocalFileSource] Tree built for: ${folderName}`);
    return root;
  }

  /**
   * Read file contents as UTF-8 string
   * @param filePath - Absolute or relative path to file
   * @returns File content as string
   */
  async readFile(filePath: string): Promise<string> {
    console.log(`[LocalFileSource] Reading file: ${filePath}`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(`[LocalFileSource] Read ${content.length} characters from ${path.basename(filePath)}`);
      return content;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${filePath}`);
      }
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Download file as buffer (for binary files)
   * @param filePath - Absolute or relative path to file
   * @returns File content as buffer
   */
  async downloadFile(filePath: string): Promise<Buffer> {
    console.log(`[LocalFileSource] Downloading file: ${filePath}`);

    try {
      const buffer = await fs.readFile(filePath);
      console.log(`[LocalFileSource] Downloaded ${buffer.length} bytes from ${path.basename(filePath)}`);
      return buffer;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${filePath}`);
      }
      throw new Error(`Failed to download file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Get metadata for a file or folder
   * @param filePath - Absolute or relative path
   * @returns File metadata
   */
  async getFileMetadata(filePath: string): Promise<FileMetadata> {
    console.log(`[LocalFileSource] Getting metadata for: ${filePath}`);

    try {
      const stats = await fs.stat(filePath);
      const fileName = path.basename(filePath);
      const ext = path.extname(fileName).toLowerCase();

      return {
        name: fileName,
        path: filePath,
        mimeType: stats.isDirectory() ? 'folder' : this.getMimeType(ext),
        size: stats.size,
        modifiedTime: stats.mtime,
        isFolder: stats.isDirectory()
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Path not found: ${filePath}`);
      }
      if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${filePath}`);
      }
      throw new Error(`Failed to get metadata for ${filePath}: ${error.message}`);
    }
  }

  /**
   * Search for files by filename (case-insensitive contains)
   * @param query - Search query string
   * @param folderPath - Optional folder to search within
   * @returns Matching files
   */
  async searchFiles(query: string, folderPath?: string): Promise<FileMetadata[]> {
    const searchPath = folderPath || '.';
    console.log(`[LocalFileSource] Searching for "${query}" in ${searchPath}`);

    await this.verifyFolderExists(searchPath);

    const results: FileMetadata[] = [];
    const lowerQuery = query.toLowerCase();

    await this.searchFilesRecursive(searchPath, lowerQuery, results);

    console.log(`[LocalFileSource] Found ${results.length} matching files`);
    return results;
  }

  /**
   * Helper: Recursively list all files and folders
   */
  private async listFolderRecursive(
    folderPath: string,
    files: FileMetadata[],
    folders: FileMetadata[]
  ): Promise<void> {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files and folders (starting with .)
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(folderPath, entry.name);
      const stats = await fs.stat(fullPath);

      if (entry.isDirectory()) {
        folders.push({
          name: entry.name,
          path: fullPath,
          mimeType: 'folder',
          size: 0,
          modifiedTime: stats.mtime,
          isFolder: true
        });

        // Recurse into subdirectory
        await this.listFolderRecursive(fullPath, files, folders);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        
        // Strict filtering: throw error for unsupported file types
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          throw new Error(
            `Unsupported file type: ${fullPath}\n` +
            `Supported extensions: ${Array.from(SUPPORTED_EXTENSIONS).join(', ')}`
          );
        }

        files.push({
          name: entry.name,
          path: fullPath,
          mimeType: this.getMimeType(ext),
          size: stats.size,
          modifiedTime: stats.mtime,
          isFolder: false
        });
      }
    }
  }

  /**
   * Helper: Build nested tree structure with children
   */
  private async buildTree(folderPath: string, parent: FileMetadata): Promise<void> {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files and folders (starting with .)
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(folderPath, entry.name);
      const stats = await fs.stat(fullPath);

      if (entry.isDirectory()) {
        const folder: FileMetadata = {
          name: entry.name,
          path: fullPath,
          mimeType: 'folder',
          size: 0,
          modifiedTime: stats.mtime,
          isFolder: true,
          children: []
        };

        parent.children!.push(folder);

        // Recurse into subdirectory
        await this.buildTree(fullPath, folder);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        
        // Strict filtering: throw error for unsupported file types
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          throw new Error(
            `Unsupported file type: ${fullPath}\n` +
            `Supported extensions: ${Array.from(SUPPORTED_EXTENSIONS).join(', ')}`
          );
        }

        const file: FileMetadata = {
          name: entry.name,
          path: fullPath,
          mimeType: this.getMimeType(ext),
          size: stats.size,
          modifiedTime: stats.mtime,
          isFolder: false
        };

        parent.children!.push(file);
      }
    }

    // Sort children: folders first, then files, alphabetically within each group
    parent.children!.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Helper: Search files recursively
   */
  private async searchFilesRecursive(
    folderPath: string,
    lowerQuery: string,
    results: FileMetadata[]
  ): Promise<void> {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files and folders (starting with .)
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(folderPath, entry.name);
      const stats = await fs.stat(fullPath);

      if (entry.isDirectory()) {
        // Recurse into subdirectory
        await this.searchFilesRecursive(fullPath, lowerQuery, results);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        
        // Skip unsupported file types during search (don't throw)
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          continue;
        }

        // Check if filename contains query (case-insensitive)
        if (entry.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            name: entry.name,
            path: fullPath,
            mimeType: this.getMimeType(ext),
            size: stats.size,
            modifiedTime: stats.mtime,
            isFolder: false
          });
        }
      }
    }
  }

  /**
   * Helper: Verify folder exists and is a directory
   */
  private async verifyFolderExists(folderPath: string): Promise<void> {
    try {
      const stats = await fs.stat(folderPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${folderPath}`);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Directory not found: ${folderPath}`);
      }
      if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${folderPath}`);
      }
      throw error;
    }
  }

  /**
   * Helper: Get MIME type from file extension
   */
  private getMimeType(ext: string): string {
    return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
  }
}

/**
 * Factory function to create file source
 */
export function createFileSource(): LocalFileSource {
  return new LocalFileSource();
}

// Export the class
export { LocalFileSource as default };
