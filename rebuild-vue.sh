#!/bin/bash
#
# Rebuild and Deploy Vue UI
# Run this ON THE DROPLET after git pull
#
# Usage: ./rebuild-vue.sh
#

set -e

echo "========================================="
echo "  Rebuilding Vue UI"
echo "========================================="

# Step 1: Build shared-types (dependency)
echo ""
echo "[1/4] Building shared-types..."
cd src/shared-types
npm install
npm run build
echo "✓ Shared types built"

# Step 2: Install Vue UI dependencies
echo ""
echo "[2/4] Installing Vue UI dependencies..."
cd ../../vue-ui
npm install
echo "✓ Dependencies installed"

# Step 3: Build Vue UI
echo ""
echo "[3/4] Building Vue UI for production..."
npm run build
echo "✓ Vue UI built"

# Step 4: Reload nginx
echo ""
echo "[4/4] Reloading nginx..."
if systemctl is-active --quiet nginx; then
    systemctl reload nginx
    echo "✓ Nginx reloaded"
else
    echo "⚠ Nginx not running"
fi

echo ""
echo "========================================="
echo "  Vue UI Rebuild Complete!"
echo "========================================="
echo ""
echo "Test your app: https://phasergun.app"
echo ""
