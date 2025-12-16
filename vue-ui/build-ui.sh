#!/bin/bash

# Vue UI Build Script
# This script builds the Vue.js frontend application

echo "=== Vue UI Build Script ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Clean previous build
echo -e "${YELLOW}[1/3] Cleaning previous build...${NC}"
rm -rf dist
echo -e "${GREEN}✓ Cleaned${NC}"

# Step 2: Install dependencies
echo -e "${YELLOW}[2/3] Installing dependencies...${NC}"
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Error: npm install failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Step 3: Build Vue UI
echo -e "${YELLOW}[3/3] Building Vue UI...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Error: Build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build complete${NC}"

echo ""
echo -e "${GREEN}=== Vue UI Build Complete! ===${NC}"
echo ""
echo "Build output location: ${SCRIPT_DIR}/dist"
echo ""
echo "To serve locally:"
echo "  npm run preview"
echo ""
echo "To deploy to production:"
echo "  - Copy the 'dist' folder to your web server"
echo "  - Configure nginx/apache to serve the files"
echo "  - Or use: cd .. && ./deploy.sh"
