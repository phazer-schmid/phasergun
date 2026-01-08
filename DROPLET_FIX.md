# 🔧 Droplet Fix Guide - API Server 502 Error

## Problem Summary
The API server was crashing because PM2 couldn't find the compiled JavaScript file. The TypeScript compiler creates a nested directory structure, but PM2 was looking in the wrong place.

## ✅ What Was Fixed Locally
- **ecosystem.config.js**: Updated script path from `dist/index.js` to `dist/api-server/src/index.js`

## 📋 Deployment Steps for Droplet

### Step 1: Push the fix to GitHub
```bash
# On your local machine:
git add ecosystem.config.js
git commit -m "Fix PM2 script path for nested TypeScript build output"
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

# Start fresh with the updated config:
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

1. **Verify the compiled file exists:**
   ```bash
   ls -la /workspace/phasergun/src/api-server/dist/api-server/src/index.js
   ```
   If this file doesn't exist, run `./build-all.sh` again.

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

## 📝 Why This Happened

The TypeScript compiler uses the project references feature, which creates a nested output structure to keep compiled modules organized. When building from the project root, it compiles to:
```
dist/
  api-server/
    src/
      index.js  ← Actual location
```

But the old PM2 config was expecting:
```
dist/
  index.js  ← PM2 was looking here
```

This fix updates PM2 to look in the correct location.
