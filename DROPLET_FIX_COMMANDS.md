# Commands to Fix api-server on Droplet

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

### Step 3: Navigate to the api-server directory
```bash
cd /workspace/phasergun/src/api-server
```

### Step 4: Stop the PM2 process
```bash
pm2 stop meddev-api
```

### Step 5: Reinstall dependencies with updated package.json
```bash
# Remove old dependencies and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Step 6: Clean the old build
```bash
# Remove the old dist folder
rm -rf dist
```

### Step 7: Rebuild TypeScript
```bash
# Run the TypeScript compiler
npm run build
```

### Step 8: Verify the build succeeded
```bash
# Check that the routes folder was created in dist
ls -la dist/routes/

# You should see generate.js listed
# If you see it, the build was successful
```

### Step 9: Restart the PM2 process
```bash
pm2 restart meddev-api
```

### Step 10: Check the logs
```bash
# Watch the logs to see if it starts successfully
pm2 logs meddev-api --lines 50
```

---

## Alternative: Full Rebuild (if step 5 fails)

If `npm run build` fails, you may need to reinstall dependencies:

```bash
# Navigate to api-server
cd /workspace/phasergun/src/api-server

# Stop PM2
pm2 stop meddev-api

# Clean everything
rm -rf dist node_modules package-lock.json

# Reinstall dependencies
npm install

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
```

**Then sync to droplet** (however you're currently deploying)

**Then on droplet:**
```bash
pm2 restart all
```
