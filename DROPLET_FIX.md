# 🔧 Droplet Fix Guide - API Server 502 Error

## Problem Summary
The API server was crashing because the TypeScript build was creating a nested directory structure without `rootDir` configured. This caused PM2 to look for the compiled file in the wrong location.

## ✅ What Was Fixed
- **src/api-server/tsconfig.json**: Added `"rootDir": "./src"` to create flat output structure
- **Result**: TypeScript now compiles to `dist/index.js` instead of `dist/api-server/src/index.js`

## Why This Happened

When `build-all.sh` runs, it changes into each module directory and runs `tsc`:
```bash
cd "src/api-server"
npx tsc
```

Without `rootDir` specified in `tsconfig.json`, TypeScript infers the root from the source file paths and preserves the directory structure, creating:
- ❌ `src/api-server/dist/api-server/src/index.js` (nested, PM2 can't find it)

With `rootDir: "./src"`, TypeScript knows to strip the `src/` prefix from output paths, creating:
- ✅ `src/api-server/dist/index.js` (flat, PM2 finds it)

## 📋 Deployment Steps for Droplet

### Step 1: Push the fix to GitHub
```bash
# On your local machine:
git add src/api-server/tsconfig.json DROPLET_FIX.md
git commit -m "Fix TypeScript build structure with rootDir config"
git push origin main
```

### Step 2: Update the droplet
```bash
# SSH into your droplet:
ssh root@phasergun.app

# Navigate to project directory:
cd /workspace/phasergun

# Pull the latest changes:
git pull origin main

# Rebuild with the new tsconfig:
./build-all.sh

# Update the RAG_CHECKS path in .env (IMPORTANT!)
nano src/api-server/.env

# Change this line:
# RAG_CHECKS=/Users/davidschmid/gdrive/eLum PDP Files/RAG
# To:
# RAG_CHECKS=/gdrive/eLum PDP Files/RAG

# Save and exit (Ctrl+X, then Y, then Enter)
```

### Step 3: Restart the API server
```bash
# Stop the errored process:
pm2 stop meddev-api

# Delete it:
pm2 delete meddev-api

# Start fresh with the correct build:
pm2 start ecosystem.config.js

# Check status:
pm2 status

# View logs to verify it's working:
pm2 logs meddev-api --lines 30
```

### Step 4: Verify the fix
```bash
# Test the API health endpoint:
curl http://localhost:3001/api/health

# You should see:
# {"status":"ok","timestamp":"...","dhfMappingLoaded":true}
```

Then open your browser to https://phasergun.app and try loading DHF documents.

## 🔍 Expected Results

**Before Fix:**
- PM2 status: `errored` with 91+ restarts
- API logs: "Script not found: /workspace/phasergun/src/api-server/dist/index.js"
- Browser console: 502 Bad Gateway errors

**After Fix:**
- PM2 status: `online` with 0 restarts
- API logs: "Server running on http://localhost:3001"
- Browser: DHF documents load successfully

## 🚨 Troubleshooting

If it still doesn't work after following the steps above:

1. **Verify the compiled file exists at the correct location:**
   ```bash
   ls -la /workspace/phasergun/src/api-server/dist/index.js
   ```
   If this file doesn't exist, run `./build-all.sh` again and check for errors.

2. **Check for .env errors:**
   ```bash
   pm2 logs meddev-api --err --lines 50
   ```
   Look for "RAG_CHECKS" or path-related errors.

3. **Verify RAG folder exists:**
   ```bash
   ls -la "/gdrive/eLum PDP Files/RAG"
   ```
   If this doesn't exist, you need to mount your Google Drive or update RAG_CHECKS to the correct path.

4. **Check nginx is proxying correctly:**
   ```bash
   sudo nginx -t
   sudo systemctl status nginx
   ```

## 📝 Technical Details

### The Root Cause
TypeScript's compiler infers directory structure when `rootDir` is not specified. Since we're building from `src/api-server/` directory and the source files are in `src/api-server/src/`, TypeScript preserved this structure in the output.

### The Solution
Adding `"rootDir": "./src"` tells TypeScript:
- All source files are under the `src/` directory
- Strip the `src/` prefix when creating output files
- Result: `src/index.ts` → `dist/index.js` (not `dist/api-server/src/index.js`)

### Why This Works Everywhere
- **Local dev (`npm run dev`)**: Uses `ts-node`, runs TypeScript directly, no compilation needed
- **Production build (`build-all.sh`)**: TypeScript compiles with proper `rootDir`, creates flat structure
- **PM2**: Looks for `dist/index.js`, finds it at the correct location
- **No code changes needed**: The same source code works in both environments
