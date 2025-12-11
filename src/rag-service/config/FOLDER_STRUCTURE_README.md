# Folder Structure Configuration System

## Overview

This document explains the new **centralized folder structure configuration** for the FDA 510(k) project management system. Instead of hardcoding folder paths across multiple validation files, we now maintain a single source of truth in `folder-structure.yaml`.

## What Changed

### Before (Old System)
Each validation file contained hardcoded folder paths:
```yaml
planning_and_scope:
  display_name: Planning & Scope  # Used "&" shortcut
  folder_path: Phase 1/Planning and Scope  # Hardcoded path
  check_count: 4
```

**Problems:**
- Folder paths duplicated across multiple files
- Inconsistent use of "&" vs "and" in names
- Hard to refactor folder structure
- No single source of truth

### After (New System)
Validation files reference category IDs from `folder-structure.yaml`:
```yaml
planning_and_scope:
  display_name: Planning and Scope  # Consistent naming (no "&")
  folder_category_id: planning_and_scope  # References folder-structure.yaml
  check_count: 4
```

**Benefits:**
✅ Single source of truth for folder structure  
✅ Consistent naming (all "and", no "&")  
✅ Easy to refactor paths in one place  
✅ Better separation of concerns  
✅ Enables dynamic UI generation  

## Folder Structure YAML

### Location
```
src/rag-service/config/folder-structure.yaml
```

### Structure
The YAML defines 5 phases with 22 total categories:

```yaml
folder_structure:
  phase_1:
    phase_id: 1
    phase_name: "Phase 1: Planning"
    phase_path: "Phase 1"
    categories:
      - category_id: planning_and_scope
        category_name: "Planning and Scope"
        folder_path: "Phase 1/Planning and Scope"
        description: "Project planning, device description..."
        required: true
```

### Key Fields

| Field | Description | Example |
|-------|-------------|---------|
| `category_id` | Unique identifier (snake_case) | `planning_and_scope` |
| `category_name` | Display name (uses "and") | `Planning and Scope` |
| `folder_path` | Full path from project root | `Phase 1/Planning and Scope` |
| `description` | Purpose of the category | `Project planning, device description...` |
| `required` | Mandatory for 510(k)? | `true` or `false` |

## How to Use

### 1. Loading Folder Structure (Code)

```typescript
import * as yaml from 'js-yaml';
import * as fs from 'fs';

// Load folder structure
const folderStructure = yaml.load(
  fs.readFileSync('config/folder-structure.yaml', 'utf8')
);

// Get folder path by category ID
function getFolderPath(categoryId: string): string {
  for (const phase of Object.values(folderStructure.folder_structure)) {
    const category = phase.categories.find(c => c.category_id === categoryId);
    if (category) {
      return category.folder_path;
    }
  }
  throw new Error(`Category ${categoryId} not found`);
}

// Usage
const path = getFolderPath('planning_and_scope');
// Returns: "Phase 1/Planning and Scope"
```

### 2. Validation File Format

When creating or updating validation files, use `folder_category_id` instead of `folder_path`:

```yaml
planning_and_scope:
  display_name: Planning and Scope
  folder_category_id: planning_and_scope  # References folder-structure.yaml
  check_count: 4
  validation_checks:
    - check_id: P1-PLAN-001
      # ... validation checks
```

### 3. Generating UI Navigation

The folder structure can dynamically generate the sidebar navigation:

```typescript
// Generate sidebar from folder-structure.yaml
function generateSidebar() {
  const sidebar = [];
  for (const [phaseKey, phase] of Object.entries(folderStructure.folder_structure)) {
    sidebar.push({
      id: phase.phase_id,
      name: phase.phase_name,
      categories: phase.categories.map(cat => ({
        id: cat.category_id,
        name: cat.category_name,
        required: cat.required
      }))
    });
  }
  return sidebar;
}
```

## Complete Folder Hierarchy

### Phase 1: Planning (4 categories)
- ✅ Planning and Scope
- ✅ Predicate Selection
- ✅ Regulatory
- ✅ User Needs and Claims

### Phase 2: Design (4 categories)
- ✅ Design Inputs
- ✅ Labeling Drafts
- ✅ Prototype and Drawings
- ✅ Risk Management Planning

### Phase 3: Development (7 categories)
- Biocompatibility (optional)
- ✅ Design Outputs
- ✅ Design Verification (Bench)
- ✅ Device-Specific Testing
- Electrical and EMC (optional)
- Software and Cybersecurity (optional)
- Sterilization and Shelf Life (optional)

### Phase 4: Testing (5 categories)
- Clinical Data (if required) (optional)
- ✅ Design Validation (Human Factors)
- ✅ Final Labeling and Packaging
- ✅ Manufacturing Transfer
- ✅ Risk Management (Final)

### Phase 5: Submission (3 categories)
- ✅ 510(k) Compilation
- ✅ DHF Compilation
- ✅ Post-Market Surveillance Plan

**Legend:** ✅ = Required for submission

## Migration Status

### ✅ Completed
- [x] Created `folder-structure.yaml` with all 22 categories
- [x] Updated Phase 1 validation file (`phase1-validation.yaml`)
- [x] Fixed all "&" shortcuts to use "and"
- [x] Created this documentation

### ⚠️ Pending
- [ ] Update Phase 2 validation file (`phase2-validation.yaml`)
- [ ] Update Phase 3 validation file (`phase3-validation.yaml`)
- [ ] Update Phase 4 validation file (`phase4-validation.yaml`)
- [ ] Update Phase 5 validation file (`phase5-validation.yaml`)
- [ ] Update DHF scanner to load from `folder-structure.yaml`
- [ ] Update UI sidebar to dynamically generate from `folder-structure.yaml`
- [ ] Update API server to resolve category IDs to paths

## Naming Conventions

### ✅ DO Use
- **"and"** instead of "&"
  - ✅ `User Needs and Claims`
  - ✅ `Electrical and EMC`
  - ✅ `Software and Cybersecurity`

### ❌ DON'T Use
- **"&"** symbols
  - ❌ `User Needs & Claims`
  - ❌ `Electrical & EMC`
  - ❌ `Software & Cybersecurity`

### Category ID Format
- Use `snake_case` for programmatic reference
- Match the category name logically
- Examples:
  - `planning_and_scope` → "Planning and Scope"
  - `design_verification_bench` → "Design Verification (Bench)"
  - `user_needs_and_claims` → "User Needs and Claims"

## Migration Guide (For Remaining Phases)

### Step 1: Find Current Entries
```bash
grep -n "folder_path:" phase2-validation.yaml
```

### Step 2: Replace with Category ID

**Before:**
```yaml
design_inputs:
  display_name: Design Inputs
  folder_path: Phase 2/Design Inputs
```

**After:**
```yaml
design_inputs:
  display_name: Design Inputs
  folder_category_id: design_inputs
```

### Step 3: Fix "&" in Display Names

**Before:**
```yaml
display_name: User Needs & Claims
```

**After:**
```yaml
display_name: User Needs and Claims
```

### Step 4: Verify Category ID Exists
Check that the `category_id` exists in `folder-structure.yaml`:

```bash
grep "category_id: design_inputs" folder-structure.yaml
```

## Code Integration Examples

### Example 1: DHF Scanner Integration

```typescript
import * as yaml from 'js-yaml';
import * as fs from 'fs';

class DHFScanner {
  private folderStructure: any;
  
  constructor() {
    // Load folder structure on init
    this.folderStructure = yaml.load(
      fs.readFileSync('config/folder-structure.yaml', 'utf8')
    );
  }
  
  resolveCategory(categoryId: string): {path: string, name: string} {
    for (const phase of Object.values(this.folderStructure.folder_structure)) {
      const category = phase.categories.find(
        c => c.category_id === categoryId
      );
      if (category) {
        return {
          path: category.folder_path,
          name: category.category_name
        };
      }
    }
    throw new Error(`Unknown category: ${categoryId}`);
  }
  
  scanProjectFolder(projectPath: string, phaseId?: number) {
    // Load validation config
    const validation = yaml.load(
      fs.readFileSync(`config/validation/phase${phaseId}-validation.yaml`, 'utf8')
    );
    
    // Resolve each category's folder path
    for (const [key, value] of Object.entries(validation)) {
      const categoryId = value.folder_category_id;
      const category = this.resolveCategory(categoryId);
      const fullPath = path.join(projectPath, category.path);
      
      // Scan the folder
      this.scanFolder(fullPath, category.name);
    }
  }
}
```

### Example 2: API Server Integration

```typescript
// Load folder structure once on server startup
let folderStructure: any;

async function loadFolderStructure() {
  const yamlPath = path.join(__dirname, '../config/folder-structure.yaml');
  const fileContents = await fs.readFile(yamlPath, 'utf8');
  folderStructure = yaml.load(fileContents);
}

// Resolve category ID to folder path
function getCategoryPath(categoryId: string): string {
  for (const phase of Object.values(folderStructure.folder_structure)) {
    const category = phase.categories.find(c => c.category_id === categoryId);
    if (category) return category.folder_path;
  }
  throw new Error(`Category ${categoryId} not found`);
}

// Use in API endpoint
app.post('/api/analyze', async (req, res) => {
  const { categoryId, filePath } = req.body;
  const categoryPath = getCategoryPath(categoryId);
  const fullPath = path.join(projectPath, categoryPath, filePath);
  // ... analyze file
});
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-11 | Initial release with all 22 categories |

## Future Enhancements

1. **Validation Rules** - Add folder structure validation to ensure consistency
2. **Auto-generation** - Generate TypeScript types from the YAML
3. **Localization** - Support multiple languages for category names
4. **Custom Structures** - Allow users to customize folder hierarchy per project
5. **Templates** - Pre-defined folder structures for different device types

## Support

For questions or issues:
1. Check this README
2. Review `folder-structure.yaml` for available categories
3. See Phase 1 validation file as migration example
4. Contact the development team

---

**Last Updated:** 2025-12-11  
**Status:** Phase 1 Complete, Phases 2-5 Pending
