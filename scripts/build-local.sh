#!/bin/bash

# Build Clara containers locally - Full or Lean versions
# This allows running ClaraVerse completely offline after initial build

set -e

# Parse command line arguments
BUILD_MODE="lean"  # Default to lean
SKIP_HEAVY="false"

while [[ $# -gt 0 ]]; do
    case $1 in
        --full)
            BUILD_MODE="full"
            shift
            ;;
        --lean)
            BUILD_MODE="lean"
            shift
            ;;
        --skip-heavy)
            SKIP_HEAVY="true"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--full|--lean] [--skip-heavy]"
            echo "  --full       Build full version with all ML dependencies (3GB+)"
            echo "  --lean       Build lean version with essential features only (200MB)"
            echo "  --skip-heavy Skip heavy services (N8N, interpreter)"
            exit 0
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

echo "🏗️  Building Clara containers locally (${BUILD_MODE} mode)..."

# Detect container engine (prefer Podman)
if command -v podman >/dev/null 2>&1; then
    CONTAINER_ENGINE="podman"
    echo "Using Podman as container engine"
elif command -v docker >/dev/null 2>&1; then
    CONTAINER_ENGINE="docker"
    echo "Using Docker as container engine"
else
    echo "❌ Error: Neither Podman nor Docker found. Please install one of them."
    echo "Podman (recommended): https://podman.io/getting-started/installation"
    echo "Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Build Clara Backend
echo "📦 Building Clara Backend (${BUILD_MODE} mode)..."
cd "$(dirname "$0")/../py_backend"

if [ "$BUILD_MODE" = "lean" ]; then
    echo "   Using lean Dockerfile (essential features only, ~200MB)"
    $CONTAINER_ENGINE build -f Dockerfile.lean -t clara17verse/clara-backend:lean .
    $CONTAINER_ENGINE tag clara17verse/clara-backend:lean clara17verse/clara-backend:latest
else
    echo "   Using full Dockerfile (all features, 3GB+)"
    $CONTAINER_ENGINE build -t clara17verse/clara-backend:latest .
fi
echo "✅ Clara Backend built successfully"

# Build Clara Frontend (main app)
echo "📦 Building Clara Frontend..."
cd "$(dirname "$0")/../"
$CONTAINER_ENGINE build -t clara-ollama:latest .
echo "✅ Clara Frontend built successfully"

echo ""
echo "🎉 Local build complete!"
echo ""
echo "Built containers:"
if [ "$BUILD_MODE" = "lean" ]; then
    echo "  - clara17verse/clara-backend:lean (~200MB, essential features)"
else
    echo "  - clara17verse/clara-backend:latest (~3GB, full features)"
fi
echo "  - clara-ollama:latest (Frontend)"
echo ""

if [ "$SKIP_HEAVY" = "false" ]; then
    echo "Heavy services (will be downloaded on first run):"
    echo "  - clara17verse/clara-interpreter:latest (Code interpreter - 1.77GB)"
    echo "  - n8nio/n8n (Workflow automation - 736MB)"
else
    echo "Heavy services skipped (use --skip-heavy=false to include)"
fi

echo "  - ollama/ollama (LLM runtime - optional if Ollama installed locally)"
echo ""
echo "💡 Tip: Use 'yarn electron:dev' to start the app with your locally built containers"
