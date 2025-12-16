# Droplet Local Folder Fix

## Issue Identified

The Local Folder approach is failing because of a **folder name mismatch** between your actual droplet folder structure and the configuration file.

### Your Actual Droplet Structure
```
/files/
  ├── Phase 1/
  │   ├── Planning and Scope/
  │   ├── Predicate Selection/
  │   └── User Needs/           ⚠️ MISMATCH!
```

### What the Config Expected
```yaml
# Was expecting:
- "Phase 1/User Needs and Claims"  ❌

# Fixed to match your folders:
- "Phase 1/User Needs"  ✅
```

## What Was Fixed

✅ Updated `src/rag-service/config/folder-structure.yaml`:
- Changed `"User Needs and Claims"` → `"User Needs"`
- Changed category ID from `user_needs_and_claims` → `user_needs`

## Testing on the Droplet

### 1. Test API Endpoint with Correct Path

SSH into your droplet and run:

```bash
# Test the scan-dhf endpoint with the correct path
curl -X POST http://localhost:3001/api/projects/test-project/scan-dhf \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/files",
    "phaseId": 1
  }'
```

**Important:** The path should be `/files` (the root folder), NOT `/files/Phase 1/`.

The scanner will automatically:
1. Find the "Phase 1" folder inside `/files`
2. Look for category folders like "Planning and Scope", "Predicate Selection", etc.
3. Scan all documents inside those folders

### 2. Verify the API Server is Running

```bash
# Check if API server is running
pm2 list

# If not running, start it:
pm2 start ecosystem.config.js

# Check logs:
pm2 logs api-server
```

### 3. Check File Permissions

Make sure the API server can read the files:

```bash
# Check permissions on /files
ls -la /files

# If needed, make files readable:
chmod -R 755 /files
```

### 4. Test Path Handling

The API server normalizes paths by replacing escaped spaces `\ ` with actual spaces.

```bash
# If you're passing the path from a shell, use quotes:
curl -X POST http://localhost:3001/api/projects/test/scan-dhf \
  -H "Content-Type: application/json" \
  -d "{
    \"projectPath\": \"/files\",
    \"phaseId\": 1
  }"
```

## Expected Behavior

When working correctly, you should see:

```json
{
  "projectId": "test-project",
  "dhfFiles": [
    {
      "id": "planning_and_scope",
      "name": "Planning and Scope",
      "status": "complete",
      "documents": [
        {
          "name": "document1.pdf",
          "status": "complete",
          "date": "2025-12-16",
          "reviewer": "Auto-scanned"
        }
      ]
    }
  ],
  "scanStatus": "complete",
  "stats": {
    "totalDHFFiles": 4,
    "completedFiles": 3,
    "totalDocuments": 15
  }
}
```

## Troubleshooting

### Error: "Project path is required"
**Fix:** Make sure you're sending `projectPath` in the request body.

### Error: "ENOENT: no such file or directory"
**Fix:** 
1. Verify the path exists: `ls -la /files`
2. Check that the API server has read permissions
3. Make sure you're using the absolute path: `/files` not `files`

### Error: "Found 0 phase folders"
**Fix:**
1. Verify folder names match the pattern: `Phase 1`, `Phase 2`, etc.
2. Check the scanner's regex in `src/dhf-scanner/src/index.ts`:
   ```typescript
   const match = entry.name.match(/(?:phase|p)[\s_-]*([1-4])/i);
   ```
3. Your folders should be named: `Phase 1`, `Phase 2`, `Phase 3`, `Phase 4`

### Error: "Anthropic API key not configured"
**Fix:** Set the environment variable on the droplet:

```bash
# Edit the .env file
nano /root/code/poc-decoupled-app/src/api-server/.env

# Add:
ANTHROPIC_API_KEY=your_key_here

# Restart the server
pm2 restart api-server
```

## Additional Folder Mismatches to Check

Based on your droplet, you only showed **Phase 1** with 3 folders:
- Planning and Scope ✅
- Predicate Selection ✅
- User Needs ✅

But the config defines **4 categories** for Phase 1:
- Planning and Scope ✅
- Predicate Selection ✅
- Regulatory ❌ (missing on droplet?)
- User Needs ✅

**Action:** If you don't have a "Regulatory" folder, you can either:
1. Create it on the droplet: `mkdir /files/Phase\ 1/Regulatory`
2. Or mark it as not required in the YAML (it's currently `required: true`)

## Deploy the Fix

Once you've verified it works locally, deploy to the droplet:

```bash
# From your local machine:
./deploy.sh

# This will:
# 1. Build the updated code
# 2. Copy files to the droplet
# 3. Restart PM2 services
```

## Next Steps

1. ✅ Fixed `folder-structure.yaml` to match your droplet folders
2. 🔄 Deploy the changes to the droplet
3. 🧪 Test the `/api/projects/:projectId/scan-dhf` endpoint
4. 📊 Verify the scanner finds your documents
5. 🎉 Local Folder approach should now work!

## Still Not Working?

If you're still having issues, check these logs on the droplet:

```bash
# API server logs
pm2 logs api-server --lines 50

# System logs
journalctl -u nginx -n 50
```

And provide the output so I can help debug further!
