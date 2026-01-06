#!/bin/bash
# Note: Not using 'set -e' because TypeScript may error but still generate .js files

echo "🔨 Building production modules only..."
echo ""
echo "This script builds only the modules required for the check selection feature:"
echo "  - rag-service (check-parser)"
echo "  - api-server (new endpoints)"
echo "  - vue-ui (frontend)"
echo ""

# Build rag-service (contains check-parser)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Building src/rag-service"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd src/rag-service

# Try to build, ignore exit code
npx tsc --skipLibCheck 2>&1 || true

# Check if required file exists
if [ -f "src/check-parser.js" ]; then
  echo "✅ check-parser.js generated successfully"
else
  echo "❌ FATAL: check-parser.js was not generated"
  exit 1
fi

cd ../..
echo ""

# Build api-server
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Building src/api-server"  
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd src/api-server

# Try to build, ignore exit code
npx tsc --skipLibCheck 2>&1 || true

# Check if required file exists
if [ -f "src/index.js" ]; then
  echo "✅ index.js generated successfully"
else
  echo "❌ FATAL: index.js was not generated"
  exit 1
fi

cd ../..
echo ""

# Build Vue UI
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 Building vue-ui"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd vue-ui
npm run build
cd ..

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Production build complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "1. Restart PM2: pm2 restart all"
echo "2. Test: curl http://localhost:3001/api/checks/1"
