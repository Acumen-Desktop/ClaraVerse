#!/bin/bash

# Check if DOCKER_USERNAME is set
if [ -z "$DOCKER_USERNAME" ]; then
    echo "Please set DOCKER_USERNAME environment variable"
    echo "Usage: DOCKER_USERNAME=yourusername ./container-publish.sh"
    exit 1
fi

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

# Build the image
echo "Building image with $CONTAINER_ENGINE..."
$CONTAINER_ENGINE build -t $DOCKER_USERNAME/clara-ollama:latest .

# Login to container registry
echo "Logging in to container registry..."
$CONTAINER_ENGINE login

# Push the image
echo "Pushing image..."
$CONTAINER_ENGINE push $DOCKER_USERNAME/clara-ollama:latest

echo "Successfully published to registry as $DOCKER_USERNAME/clara-ollama:latest"
echo "Users can now pull and run using:"
echo "$CONTAINER_ENGINE pull $DOCKER_USERNAME/clara-ollama:latest"
echo "$CONTAINER_ENGINE run -p 8069:8069 $DOCKER_USERNAME/clara-ollama:latest"
