#!/bin/bash

# Test Local Folder Scan on Droplet
# This script tests the DHF scanner with the local /files folder

echo "========================================"
echo "Testing Local Folder DHF Scanner"
echo "========================================"
echo ""

# Configuration
API_URL="http://localhost:3001"
PROJECT_PATH="/files"
PROJECT_ID="test-project"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check if API server is running
echo -e "${YELLOW}Step 1: Checking API server status...${NC}"
pm2 list | grep -q "api-server"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ API server is running${NC}"
else
    echo -e "${RED}✗ API server is NOT running${NC}"
    echo "Starting API server..."
    pm2 start ecosystem.config.js
    sleep 3
fi
echo ""

# Step 2: Check if /files directory exists
echo -e "${YELLOW}Step 2: Checking /files directory...${NC}"
if [ -d "$PROJECT_PATH" ]; then
    echo -e "${GREEN}✓ Directory exists: $PROJECT_PATH${NC}"
    echo "Contents:"
    ls -la "$PROJECT_PATH" | head -10
else
    echo -e "${RED}✗ Directory does not exist: $PROJECT_PATH${NC}"
    exit 1
fi
echo ""

# Step 3: Check Phase 1 folder structure
echo -e "${YELLOW}Step 3: Checking Phase 1 folder structure...${NC}"
if [ -d "$PROJECT_PATH/Phase 1" ]; then
    echo -e "${GREEN}✓ Phase 1 folder exists${NC}"
    echo "Phase 1 contents:"
    ls -la "$PROJECT_PATH/Phase 1" | grep -E "Planning|Predicate|User|Regulatory"
else
    echo -e "${RED}✗ Phase 1 folder not found${NC}"
fi
echo ""

# Step 4: Test API health endpoint
echo -e "${YELLOW}Step 4: Testing API health endpoint...${NC}"
HEALTH_RESPONSE=$(curl -s "$API_URL/api/health")
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ API is responding${NC}"
    echo "$HEALTH_RESPONSE" | jq '.'
else
    echo -e "${RED}✗ API is not responding${NC}"
    echo "Check PM2 logs: pm2 logs api-server"
    exit 1
fi
echo ""

# Step 5: Test DHF folder structure endpoint
echo -e "${YELLOW}Step 5: Getting DHF folder structure config...${NC}"
FOLDER_STRUCTURE=$(curl -s "$API_URL/api/folder-structure")
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Folder structure loaded${NC}"
    echo "Phase 1 categories:"
    echo "$FOLDER_STRUCTURE" | jq '.folder_structure.phase_1.categories[].category_name'
else
    echo -e "${RED}✗ Failed to get folder structure${NC}"
fi
echo ""

# Step 6: Test DHF scan for Phase 1 only
echo -e "${YELLOW}Step 6: Scanning Phase 1 documents...${NC}"
SCAN_RESPONSE=$(curl -s -X POST "$API_URL/api/projects/$PROJECT_ID/scan-dhf" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectPath\": \"$PROJECT_PATH\",
    \"phaseId\": 1
  }")

if [ $? -eq 0 ]; then
    # Check if response contains error
    if echo "$SCAN_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
        echo -e "${RED}✗ Scan failed with error${NC}"
        echo "$SCAN_RESPONSE" | jq '.'
    else
        echo -e "${GREEN}✓ Scan completed successfully${NC}"
        echo ""
        echo "Scan Results:"
        echo "$SCAN_RESPONSE" | jq '.stats'
        echo ""
        echo "DHF Files Found:"
        echo "$SCAN_RESPONSE" | jq '.dhfFiles[] | {id: .id, name: .name, status: .status, docCount: (.documents | length)}'
    fi
else
    echo -e "${RED}✗ Failed to connect to API${NC}"
    exit 1
fi
echo ""

# Step 7: Test full project scan (all phases)
echo -e "${YELLOW}Step 7: Scanning ALL phases...${NC}"
FULL_SCAN_RESPONSE=$(curl -s -X POST "$API_URL/api/projects/$PROJECT_ID/scan-dhf" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectPath\": \"$PROJECT_PATH\"
  }")

if [ $? -eq 0 ]; then
    if echo "$FULL_SCAN_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
        echo -e "${RED}✗ Full scan failed${NC}"
        echo "$FULL_SCAN_RESPONSE" | jq '.'
    else
        echo -e "${GREEN}✓ Full scan completed${NC}"
        echo ""
        echo "Overall Statistics:"
        echo "$FULL_SCAN_RESPONSE" | jq '.stats'
    fi
else
    echo -e "${RED}✗ Failed to connect to API${NC}"
fi
echo ""

echo "========================================"
echo "Test Complete!"
echo "========================================"
echo ""
echo "Troubleshooting Tips:"
echo "- If scan fails, check: pm2 logs api-server"
echo "- Verify folder names match: ls -la /files/Phase\\ 1/"
echo "- Check file permissions: ls -la /files"
echo "- Ensure ANTHROPIC_API_KEY is set in .env"
