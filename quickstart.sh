#!/usr/bin/env bash
# TierMax Gateway — 1-Click Quickstart Script for Linux and macOS

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "====================================================="
echo "  🚀 TierMax Gateway — 1-Click Installer"
echo "====================================================="

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 22 or later."
    exit 1
fi

node scripts/setup.mjs

echo ""
read -p "Would you like to start TierMax now? (Y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    npm run dev
fi
