#!/bin/bash

# Script to delete all node_modules directories
# This script will recursively find and delete all node_modules folders

echo "🔍 Searching for node_modules directories..."
echo ""

# Find all top-level node_modules directories and count them
node_modules_count=$(find . -name "node_modules" -type d -prune | wc -l)

# Check if any node_modules directories were found
if [ "$node_modules_count" -eq 0 ]; then
    echo "✅ No node_modules directories found."
    exit 0
fi

# Display found directories
echo "Found $node_modules_count top-level node_modules directories:"
find . -name "node_modules" -type d -prune | while read -r dir; do
    echo "  - $dir"
done
echo ""

# Ask for confirmation
echo -n "⚠️  Do you want to delete all these directories? (y/N): "
read -r REPLY

if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
    echo ""
    echo "🗑️  Deleting node_modules directories..."
    
    # Delete each directory in parallel with progress feedback
    while read -r dir; do
        echo "  Removing: $dir"
        rm -rf "$dir" &
    done < <(find . -name "node_modules" -type d -prune)
    
    # Wait for all background deletions to complete
    wait
    
    echo ""
    echo "✅ All node_modules directories have been deleted!"
    echo "💡 Run 'npm install' in each package directory to reinstall dependencies."
else
    echo ""
    echo "❌ Operation cancelled. No directories were deleted."
fi
