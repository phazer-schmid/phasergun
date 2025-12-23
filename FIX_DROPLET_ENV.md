# Fix PM2 Environment Variable Loading on Droplet

## Problem
PM2 was not loading the `ANTHROPIC_API_KEY` from the `.env` file, causing 429 rate limit errors.

## Solution
Updated `ecosystem.config.js` to explicitly load environment variables from `.env` file.

## Deployment Steps

### 1. Rebuild Services Locally

**IMPORTANT:** Both llm-service and api-server need to be rebuilt:

```bash
# Rebuild llm-service (has temperature=0 changes)
cd src/llm-service
npm run build

# Rebuild api-server
cd ../api-server
npm run build

# Return to project root
cd ../..
```

### 2. Deploy to Droplet

From your local machine:

```bash
# Option A: Use git (recommended)
git add .
git commit -m "Fix: PM2 env loading and deterministic LLM"
git push

# Then on droplet
ssh root@your-droplet
cd /workspace/phasergun
git pull
npm install  # Make sure dotenv is installed

# Option B: Manual copy (if not using git)
scp -r src/llm-service/dist root@your-droplet:/workspace/phasergun/src/llm-service/
scp -r src/api-server/dist root@your-droplet:/workspace/phasergun/src/api-server/
scp ecosystem.config.js root@your-droplet:/workspace/phasergun/
```

### 3. Restart PM2 on Droplet

```bash
# SSH to droplet
ssh root@your-droplet

# Navigate to project
cd /workspace/phasergun

# Stop current PM2 process
pm2 stop meddev-api

# Delete old process
pm2 delete meddev-api

# Start with new config (this will load .env)
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Verify environment variables loaded
pm2 show meddev-api | grep -A 20 "env:"
```

### 3. Verify API Key is Loaded

You should now see output like:
```
env:
  NODE_ENV: production
  PORT: 3001
  ANTHROPIC_API_KEY: sk-ant-api03-...
  ANTHROPIC_MODEL: claude-3-haiku-20240307
  LLM_MODE: anthropic
```

### 4. Test Analysis

Try analyzing a file again - it should now work without the 429 error!

```bash
# Check logs
pm2 logs meddev-api --lines 50
```

## What Changed

**Before:**
```javascript
env: {
  NODE_ENV: 'production',
  PORT: 3001
}
```

**After:**
```javascript
// Load from .env file at PM2 startup
require('dotenv').config({ path: './src/api-server/.env' });

env: {
  NODE_ENV: 'production',
  PORT: process.env.PORT || 3001,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  // ... all other env vars
}
```

## Troubleshooting

### If API key still doesn't load:

1. **Check .env file exists on droplet:**
   ```bash
   cat /workspace/phasergun/src/api-server/.env | grep ANTHROPIC_API_KEY
   ```

2. **Check dotenv is installed:**
   ```bash
   cd /workspace/phasergun
   npm list dotenv
   ```
   
   If not installed:
   ```bash
   npm install dotenv
   ```

3. **Manually verify the env var:**
   ```bash
   pm2 env 0  # Show all env vars for process 0
   ```

### If you still get 429 errors:

Check that the API key is valid:
```bash
export ANTHROPIC_API_KEY="your-key-from-env-file"
curl https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-haiku-20240307","max_tokens":100,"temperature":0,"messages":[{"role":"user","content":"test"}]}'
```

Should return a proper response, not an error.

## Related to Deterministic Analysis

This fix is separate from the deterministic analysis work (temperature=0). That's already implemented and working. This fix just ensures PM2 loads the API key correctly on your droplet.
