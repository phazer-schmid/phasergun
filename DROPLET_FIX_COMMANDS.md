# Commands to Fix Issues on Droplet

---

## Issue 1: vue-ui Build Error - vue-tsc Not Found

### Problem
When building vue-ui, you get the error:
```
sh: 1: vue-tsc: not found
npm error Lifecycle script `build` failed with error:
npm error code 127
```

**Root Cause:** The vue-ui dependencies haven't been installed on the droplet.

### Solution: Install vue-ui Dependencies on Droplet

#### Step 1: SSH into your droplet
```bash
ssh root@your-droplet-ip
```

#### Step 2: Navigate to the vue-ui directory
```bash
cd /workspace/phasergun/vue-ui
```

#### Step 3: Sync the updated package.json to the droplet
**IMPORTANT:** The package.json has been updated to include Vite 7's peer dependencies (`esbuild` and `rollup`). You need to sync the updated file to your droplet first.

```bash
# If using git
cd /workspace/phasergun
git pull origin main

# Or if copying manually
scp /path/to/local/vue-ui/package.json root@droplet:/workspace/phasergun/vue-ui/
```

#### Step 4: Clean install dependencies
```bash
# Clean install to ensure all dependencies are properly resolved
rm -rf node_modules package-lock.json

# Regular install (should work now with explicit peer deps)
npm install
```

#### Step 5: Build the vue-ui
```bash
npm run build
```

#### Step 6: Verify the build succeeded
```bash
# Check that the dist folder was created
ls -la dist/

# You should see:
# - index.html
# - assets/ folder with .js and .css files
```

#### Expected Output
After successful build, you should see:
```
dist/index.html                   0.47 kB │ gzip:  0.31 kB
dist/assets/index-*.css          ~28 kB │ gzip: ~6 kB
dist/assets/index-*.js          ~112 kB │ gzip: ~41 kB
✓ built in XXXms
```

---

## Issue 2: api-server Build Error - Missing Routes

## Problem
The `dist/routes/generate.js` file is missing from the compiled build, causing the error:
```
Error: Cannot find module './routes/generate'
```

**Root Cause:** The api-server package.json was missing required dependencies for the routes/generate.ts file:
- `@fda-compliance/orchestrator`
- `@fda-compliance/file-parser`
- `@fda-compliance/chunker`
- `@fda-compliance/rag-service`
- `@fda-compliance/llm-service`

These have now been added to package.json. You need to sync this file to the droplet and reinstall dependencies.

## Solution: Update and Rebuild api-server on Droplet

### Step 1: Sync the updated package.json to droplet
**IMPORTANT:** First, you need to sync the updated `src/api-server/package.json` file to your droplet.

Use whatever method you normally use to deploy (git pull, rsync, scp, etc.). For example:
```bash
# If using git
cd /workspace/phasergun
git pull origin main

# Or if copying manually
scp /path/to/local/src/api-server/package.json root@droplet:/workspace/phasergun/src/api-server/
```

### Step 2: SSH into your droplet
```bash
ssh root@your-droplet-ip
# or however you normally connect
```

### Step 3: Stop the PM2 process
```bash
cd /workspace/phasergun
pm2 stop meddev-api
```

### Step 4: Build ALL workspace dependencies first
```bash
# The api-server depends on other workspace packages
# We need to build them all in the correct order
./build-all.sh
```

**Note:** If `build-all.sh` doesn't exist or fails, manually build dependencies:

```bash
# Build in dependency order
cd /workspace/phasergun

# 1. Shared types (no dependencies)
cd src/shared-types && rm -rf dist && npm run build && cd ../..

# 2. LLM Service (no dependencies)
cd src/llm-service && rm -rf dist && npm run build && cd ../..

# 3. File Parser (depends on shared-types)
cd src/file-parser && rm -rf dist && npm run build && cd ../..

# 4. Chunker (depends on shared-types)
cd src/chunker && rm -rf dist && npm run build && cd ../..

# 5. RAG Service (depends on shared-types, llm-service)
cd src/rag-service && rm -rf dist tsconfig.tsbuildinfo && npm run build && cd ../..

# 6. DHF Scanner (depends on shared-types)
cd src/dhf-scanner && rm -rf dist && npm run build && cd ../..

# 7. Orchestrator (depends on all above)
cd src/orchestrator && rm -rf dist && npm run build && cd ../..

# 8. API Server (depends on all above)
cd src/api-server && rm -rf dist tsconfig.tsbuildinfo && npm run build && cd ../..
```

### Step 5: Verify the api-server build succeeded
```bash
cd /workspace/phasergun/src/api-server

# Check that the routes folder was created in dist
ls -la dist/routes/

# You should see generate.js listed
```

### Step 6: Restart the PM2 process
```bash
pm2 restart meddev-api
```

### Step 7: Check the logs
```bash
# Watch the logs to see if it starts successfully
pm2 logs meddev-api --lines 50
```

---

## Alternative: Full Rebuild (if above steps fail)

If `npm run build` fails, you may need to reinstall dependencies:

```bash
# Navigate to api-server
cd /workspace/phasergun/src/api-server

# Stop PM2
pm2 stop meddev-api

# Clean everything INCLUDING the incremental cache
rm -rf dist node_modules package-lock.json tsconfig.tsbuildinfo

# Reinstall dependencies (use --legacy-peer-deps to avoid workspace conflicts)
npm install --legacy-peer-deps

# Rebuild
npm run build

# Verify routes folder exists
ls -la dist/routes/

# Restart PM2
pm2 restart meddev-api

# Check logs
pm2 logs meddev-api --lines 50
```

---

## Root Cause: Incremental Build Cache

The tsconfig.json has `"incremental": true` which creates a `tsconfig.tsbuildinfo` cache file. This cache can become stale and prevent new files (like routes/generate.ts) from being compiled. **Always delete `tsconfig.tsbuildinfo` when doing a clean rebuild.**

---

## Expected Output

After successful rebuild, `ls -la dist/` should show:
```
drwxr-xr-x  routes/
-rw-r--r--  index.js
```

And `ls -la dist/routes/` should show:
```
-rw-r--r--  generate.js
```

---

## Troubleshooting

### If build fails with TypeScript errors:
1. Check that you have the latest source code synced to the droplet
2. Verify TypeScript version: `npx tsc --version`
3. Check for syntax errors in the source files

### If PM2 won't start after rebuild:
```bash
# Check for other errors in the logs
pm2 logs meddev-api --err --lines 100

# Try starting manually to see full error
cd /workspace/phasergun/src/api-server
node dist/index.js
```

### If you need to rebuild ALL services:
```bash
cd /workspace/phasergun
./build-all.sh
```

---

## Prevention: Always build before deploying

In the future, make sure to run the build step before syncing to the droplet:

**Locally:**
```bash
cd /Users/davidschmid/Documents/gun/code/poc-decoupled-app
./build-all.sh

# Also build vue-ui locally
cd vue-ui && npm run build
```

**Then sync to droplet** (however you're currently deploying)

**Then on droplet:**
```bash
# Install vue-ui dependencies if not already done
cd /workspace/phasergun/vue-ui && npm install

# Rebuild vue-ui on droplet
npm run build

# Restart all services
pm2 restart all
```
