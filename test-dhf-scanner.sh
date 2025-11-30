#!/bin/bash

# DHF Scanner Test Script
# This script tests the DHF scanner API endpoint

API_URL="http://localhost:3001"
PROJECT_ID="test-project"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================="
echo "DHF Scanner Test Script"
echo "========================================="
echo ""

# Check if API server is running
echo -n "Checking API server health... "
HEALTH_CHECK=$(curl -s "${API_URL}/api/health" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ API server is running${NC}"
    echo "Health: $HEALTH_CHECK"
else
    echo -e "${RED}✗ API server is not running${NC}"
    echo "Please start the API server:"
    echo "  cd src/api-server && npm run dev"
    exit 1
fi

echo ""
echo "========================================="
echo "DHF Mapping Test"
echo "========================================="
echo "Fetching DHF mapping..."
curl -s "${API_URL}/api/dhf-mapping" | json_pp
echo ""

# Check if project path is provided
if [ -z "$1" ]; then
    echo -e "${YELLOW}⚠ No project path provided${NC}"
    echo ""
    echo "Usage: $0 <project-folder-path> [phase-id]"
    echo ""
    echo "Examples:"
    echo "  $0 /Users/yourname/Documents/MedicalDevice"
    echo "  $0 /Users/yourname/Documents/MedicalDevice 3"
    echo ""
    exit 1
fi

PROJECT_PATH="$1"
PHASE_ID="${2:-}"

# Verify project path exists
if [ ! -d "$PROJECT_PATH" ]; then
    echo -e "${RED}✗ Project path does not exist: $PROJECT_PATH${NC}"
    exit 1
fi

echo ""
echo "========================================="
echo "DHF Document Scan Test"
echo "========================================="
echo "Project Path: $PROJECT_PATH"
if [ -n "$PHASE_ID" ]; then
    echo "Phase Filter: Phase $PHASE_ID"
    SCAN_SCOPE="Phase $PHASE_ID"
else
    echo "Phase Filter: All phases"
    SCAN_SCOPE="entire project"
fi
echo ""

# Build JSON payload
if [ -n "$PHASE_ID" ]; then
    JSON_PAYLOAD="{\"projectPath\": \"$PROJECT_PATH\", \"phaseId\": $PHASE_ID}"
else
    JSON_PAYLOAD="{\"projectPath\": \"$PROJECT_PATH\"}"
fi

echo "Scanning ${SCAN_SCOPE}..."
echo ""

# Make the API call
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/api/projects/${PROJECT_ID}/scan-dhf" \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD")

# Extract response body and status code
HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo -e "${GREEN}✓ Scan completed successfully${NC}"
    echo ""
    echo "Results:"
    echo "$HTTP_BODY" | json_pp
    
    # Parse and display summary
    echo ""
    echo "========================================="
    echo "Summary"
    echo "========================================="
    
    TOTAL_FILES=$(echo "$HTTP_BODY" | grep -o '"totalDHFFiles":[0-9]*' | grep -o '[0-9]*')
    COMPLETED_FILES=$(echo "$HTTP_BODY" | grep -o '"completedFiles":[0-9]*' | grep -o '[0-9]*')
    TOTAL_DOCS=$(echo "$HTTP_BODY" | grep -o '"totalDocuments":[0-9]*' | grep -o '[0-9]*')
    
    echo "Total DHF File Categories: $TOTAL_FILES"
    echo "Categories with Documents: $COMPLETED_FILES"
    echo "Total Documents Found: $TOTAL_DOCS"
    echo ""
    
    if [ "$TOTAL_DOCS" -eq 0 ]; then
        echo -e "${YELLOW}⚠ No documents were found${NC}"
        echo ""
        echo "Possible reasons:"
        echo "  1. No phase folders exist (e.g., 'Phase 1', 'Phase_1', etc.)"
        echo "  2. No supported files in phase folders (.pdf, .docx, .txt, .md)"
        echo "  3. All files exceed 10MB size limit"
        echo ""
    else
        echo -e "${GREEN}✓ Documents were successfully classified${NC}"
    fi
    
else
    echo -e "${RED}✗ Scan failed (HTTP $HTTP_STATUS)${NC}"
    echo ""
    echo "Error response:"
    echo "$HTTP_BODY" | json_pp
    echo ""
fi

echo "========================================="
echo "Test Complete"
echo "========================================="
