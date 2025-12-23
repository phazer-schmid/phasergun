#!/bin/bash

# Deploy Deterministic Analysis Fix to Digital Ocean Droplet
# This script deploys the rebuilt services and updated ecosystem.config.js

set -e  # Exit on error

echo "================================================"
echo "Deploying Deterministic Analysis Fix to Droplet"
echo "================================================"
echo ""

# Check if droplet IP/hostname is provided
if [ -z "$1" ]; then
    echo "Usage: ./deploy-deterministic-fix.sh <droplet-ip-or-hostname>"
    echo "Example: ./deploy-deterministic-fix.sh root@123.456.789.0"
    echo "Example: ./deploy-deterministic-fix.sh root@phaser-ocean"
    exit 1
fi

DROPLET=$1
REMOTE_PATH="/workspace/phasergun"

echo "Target: $DROPLET:$REMOTE_PATH"
echo ""

# Step 1: Copy rebuilt files
echo "Step 1: Copying rebuilt files..."
echo "  - llm-service/dist (with temperature=0)"
echo "  - api-server/dist (with new imports)"
echo "  - ecosystem.config.js (with env loading)"

scp -r src/llm-service/dist "$DROPLET:$REMOTE_PATH/src/llm-service/" || {
    echo "Error: Failed to copy llm-service/dist"
    exit 1
}

scp -r src/api-server/dist "$DROPLET:$REMOTE_PATH/src/api-server/" || {
    echo "Error: Failed to copy api-server/dist"
    exit 1
}

scp ecosystem.config.js "$DROPLET:$REMOTE_PATH/" || {
    echo "Error: Failed to copy ecosystem.config.js"
    exit 1
}

echo "✓ Files copied successfully"
echo ""

# Step 2: Install dotenv if needed
echo "Step 2: Ensuring dotenv is installed on droplet..."
ssh "$DROPLET" "cd $REMOTE_PATH && npm list dotenv > /dev/null 2>&1 || npm install dotenv" || {
    echo "Warning: Could not verify/install dotenv. Continuing anyway..."
}
echo "✓ Dependencies checked"
echo ""

# Step 3: Restart PM2
echo "Step 3: Restarting PM2 on droplet..."
ssh "$DROPLET" << 'ENDSSH'
cd /workspace/phasergun

echo "  - Stopping PM2 process..."
pm2 stop meddev-api 2>/dev/null || true

echo "  - Deleting old PM2 configuration..."
pm2 delete meddev-api 2>/dev/null || true

echo "  - Starting with new configuration..."
pm2 start ecosystem.config.js

echo "  - Saving PM2 configuration..."
pm2 save

echo ""
echo "✓ PM2 restarted successfully"
echo ""
echo "Environment variables loaded:"
pm2 show meddev-api | grep -A 15 "env:" || pm2 env 0 | grep -E "(ANTHROPIC|LLM_MODE)"
ENDSSH

echo ""
echo "================================================"
echo "Deployment Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Test analysis on the droplet UI"
echo "2. Check logs: ssh $DROPLET 'pm2 logs meddev-api --lines 50'"
echo "3. Verify no 429 errors appear"
echo ""
echo "The analysis should now be:"
echo "  ✓ Deterministic (temperature=0)"
echo "  ✓ Using correct API key"
echo "  ✓ Consistent outputs"
echo ""
