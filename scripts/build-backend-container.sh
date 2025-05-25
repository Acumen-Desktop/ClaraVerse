#!/bin/bash

# Exit on any error
set -e

# Change to the backend directory
cd "$(dirname "$0")/../py_backend"

# Detect container engine (prefer Podman)
if command -v podman >/dev/null 2>&1; then
    CONTAINER_ENGINE="podman"
    echo "Using Podman as container engine"
elif command -v docker >/dev/null 2>&1; then
    CONTAINER_ENGINE="docker"
    echo "Using Docker as container engine"
else
    echo "Error: Neither Podman nor Docker found. Please install one of them."
    echo "Podman (recommended): https://podman.io/getting-started/installation"
    echo "Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if user is logged in to container registry
if [ "$CONTAINER_ENGINE" = "docker" ]; then
    if ! docker info 2>/dev/null | grep -q "Username: clara17verse"; then
        echo "Please log in to Docker Hub first"
        docker login -u clara17verse
    fi
elif [ "$CONTAINER_ENGINE" = "podman" ]; then
    # For Podman, we'll try to push and handle login if needed
    echo "Using Podman - will handle login during push if needed"
fi

# Create and use buildx builder if using Docker and it doesn't exist
if [ "$CONTAINER_ENGINE" = "docker" ]; then
    if ! docker buildx ls | grep -q "clarabuilder"; then
        echo "Creating buildx builder..."
        docker buildx create --name clarabuilder --use
    fi
    
    # Build and push for both architectures using Docker buildx
    echo "Building and pushing Docker image for multiple architectures..."
    docker buildx build --platform linux/amd64,linux/arm64 \
        -t clara17verse/clara-backend:latest \
        -t clara17verse/clara-backend:1.0.0 \
        --push .
else
    # For Podman, build for current architecture
    echo "Building and pushing Podman image..."
    podman build -t clara17verse/clara-backend:latest \
        -t clara17verse/clara-backend:1.0.0 .
    
    # Push the images
    podman push clara17verse/clara-backend:latest
    podman push clara17verse/clara-backend:1.0.0
fi

echo "Container image built and pushed successfully!"
