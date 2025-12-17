#!/bin/bash
#
# Rebuild and Deploy API Server
# Run this ON THE DROPLET after git pull
#
# Usage: ./rebuild-api.sh
#

set -e

echo "========================================="
echo "  Rebuilding API Server"
echo "========================================="

# Step 1: Build shared-types (dependency)
echo ""
echo "[1/5] Building shared-types..."
cd src/shared-types
npm install
npm run build
echo "✓ Shared types built"

# Step 2: Install API dependencies
echo ""
echo "[2/5] Installing API dependencies..."
cd ../api-server
npm install
echo "✓ Dependencies installed"

# Step 3: Build API
echo ""
echo "[3/5] Building API server..."
npm run build
echo "✓ API built"

# Step 4: Create .env if missing
echo ""
echo "[4/5] Checking environment file..."
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
NODE_ENV=production
PORT=3001
EOF
    echo "✓ Environment file created"
else
    echo "✓ Environment file exists"
fi

# Step 5: Restart PM2
echo ""
echo "[5/5] Restarting PM2..."
cd ../..
pm2 restart meddev-api || pm2 start ecosystem.config.js
echo "✓ PM2 restarted"

echo ""
echo "========================================="
echo "  API Server Rebuild Complete!"
echo "========================================="
echo ""
echo "Check logs: pm2 logs meddev-api"
echo ""
