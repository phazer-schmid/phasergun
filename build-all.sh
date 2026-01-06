#!/bin/bash
set -e  # Exit on error

echo "🔨 Building all TypeScript modules..."
echo ""

# Define modules in dependency order
modules=(
  "shared-types"
  "file-parser"
  "chunker"
  "llm-service"
  "file-source"
  "orchestrator"
  "rag-service"
  "dhf-scanner"
  "api-server"
)

# Build each module
for module in "${modules[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📦 Building src/$module"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cd "src/$module"
  
  if [ -f "tsconfig.json" ]; then
    npm run build
  else
    echo "⚠️  No tsconfig.json found, skipping..."
  fi
  
  cd ../..
  echo ""
done

# Build Vue UI
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 Building vue-ui"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd vue-ui
npm run build
cd ..

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All modules built successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "1. Deploy to droplet: ./deploy-to-droplet.sh"
echo "2. Configure RAG_CHECKS on droplet in src/api-server/.env"
echo "3. Restart PM2: pm2 restart all"
