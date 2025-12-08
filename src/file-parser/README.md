# FDA Compliance File Parser

A comprehensive TypeScript file parser for extracting text and metadata from various document formats, specifically designed for FDA Design History File (DHF) document analysis.

## Features

### Supported File Formats

- **PDF Documents** (`.pdf`)
  - Full text extraction
  - Page count and document metadata
  - PDF info and metadata extraction

- **Word Documents** (`.docx`, `.doc`)
  - Text extraction with formatting preserved
  - Detection of images and tables
  - Word count statistics
  - Message/warning extraction

- **PowerPoint Presentations** (`.pptx`, `.ppt`)
  - Slide text extraction
  - Complete presentation content parsing
  - Structure preservation

- **Images** (`.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.tiff`, `.webp`)
  - OCR (Optical Character Recognition) text extraction
  - Image metadata (dimensions, format, color space, etc.)
  - Orientation and density information
  - Support for various image formats

- **Text Files** (`.txt`, `.md`, `.csv`)
  - Direct text content extraction
  - UTF-8 encoding support

## Key Capabilities

### 1. Text Extraction
- Extracts all readable text from documents
- Preserves document structure where possible
- Handles multi-page documents

### 2. OCR for Images
- Automatic text recognition from images using Tesseract.js
- Supports multiple languages (configurable)
- Extracts text from scanned documents or image files

### 3. Metadata Extraction
- File size, modification dates
- Document-specific metadata:
  - PDF: page count, author, creation date
  - DOCX: word count, embedded images/tables
  - Images: dimensions, format, color depth
  - PowerPoint: slide count, embedded content

### 4. Recursive Folder Scanning
- Scans entire directory trees
- Processes all supported files automatically
- Maintains file path relationships

## Installation

```bash
npm install
```

## Dependencies

- **mammoth**: DOCX text extraction with HTML conversion
- **pdf-parse**: PDF text and metadata extraction
- **tesseract.js**: OCR engine for image text recognition
- **sharp**: Image processing and metadata extraction
- **officeparser**: Legacy Office format support (DOC, PPT)

## Usage

### Basic Usage

```typescript
import { ComprehensiveFileParser } from '@fda-compliance/file-parser';

const parser = new ComprehensiveFileParser();

// Scan and parse all documents in a folder
const documents = await parser.scanAndParseFolder('/path/to/dhf/folder');

// Process results
documents.forEach(doc => {
  console.log(`File: ${doc.fileName}`);
  console.log(`Type: ${doc.mimeType}`);
  console.log(`Content length: ${doc.content.length}`);
  console.log(`Metadata:`, doc.metadata);
});
```

### Using the Mock Parser for Testing

```typescript
import { MockFileParser } from '@fda-compliance/file-parser';

const mockParser = new MockFileParser();
const mockDocuments = await mockParser.scanAndParseFolder('/test/path');
```

## Parsed Document Structure

Each parsed document returns a `ParsedDocument` object with:

```typescript
interface ParsedDocument {
  id: string;              // Unique identifier (MD5 hash of file path)
  filePath: string;        // Full path to the file
  fileName: string;        // File name with extension
  content: string;         // Extracted text content
  mimeType: string;        // MIME type of the file
  metadata: {
    fileSize: number;      // Size in bytes
    parsedAt: string;      // ISO timestamp
    extension: string;     // File extension
    // Format-specific metadata...
    pageCount?: number;    // For PDFs and presentations
    width?: number;        // For images
    height?: number;       // For images
    wordCount?: number;    // For text documents
    // ... and more
  }
}
```

## Image Processing Details

The parser uses advanced image processing to extract maximum information:

1. **Metadata Extraction** (via Sharp)
   - Dimensions (width × height)
   - Format (PNG, JPEG, etc.)
   - Color space and channels
   - Bit depth
   - DPI/density
   - Alpha channel presence
   - EXIF orientation

2. **OCR Text Extraction** (via Tesseract.js)
   - Automatic language detection
   - Text recognition with confidence scoring
   - Layout preservation
   - Handles rotated or skewed text

## Advanced Features

### Recursive Directory Scanning
The parser automatically traverses subdirectories, making it ideal for complex DHF folder structures:

```
/DHF
  /Planning
    design_inputs.pdf
    requirements.docx
  /Design
    /Drawings
      schematic.png
      diagram.jpg
    risk_analysis.docx
  /Testing
    test_results.pptx
    validation_report.pdf
```

### Error Handling
- Graceful failure for individual files
- Continues processing remaining files if one fails
- Detailed error logging
- Fallback mechanisms for unsupported content

### Performance
- Parallel processing capability (can be extended)
- Efficient memory usage with streaming where possible
- Progress logging for large document sets

## Use Cases

### FDA Compliance Documentation
- DHF (Design History File) analysis
- Technical documentation review
- Regulatory submission preparation
- Quality management system documentation

### Document Analysis
- Content indexing and search
- Automated compliance checking
- Document classification
- Text mining and analysis

## Error Handling

The parser handles various error scenarios:

```typescript
try {
  const documents = await parser.scanAndParseFolder(folderPath);
} catch (error) {
  console.error('Parsing failed:', error);
  // Handle error appropriately
}
```

Individual file failures don't stop the entire process - they're logged and skipped.

## Extending the Parser

The parser can be extended to support additional formats:

```typescript
class ExtendedParser extends ComprehensiveFileParser {
  // Add custom parsing logic
  private async parseCustomFormat(filePath: string) {
    // Your implementation
  }
}
```

## Performance Considerations

- **Large PDFs**: May take several seconds to parse
- **OCR**: Image text extraction is compute-intensive
- **PowerPoint**: Complex presentations may have longer processing times
- **Recommendations**: 
  - Process files in batches for large document sets
  - Consider caching parsed results
  - Use progress indicators for user feedback

## Limitations

- OCR accuracy depends on image quality
- Scanned PDFs require OCR (not text-layer extraction)
- Password-protected files are not supported
- Very large files (>100MB) may require additional memory

## Contributing

To add support for new file formats:

1. Add file extension to `supportedExtensions`
2. Implement parser method
3. Add MIME type mapping
4. Update documentation

## License

See project license file.

## Support

For issues or questions, please refer to the main project documentation.
