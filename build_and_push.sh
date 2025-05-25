#!/bin/bash
set -e

# Configuration
IMAGE_NAME="clara17verse/clara-interpreter"
TAG="latest"
DOCKERFILE_PATH="./clara_interpreter_dockerstuff/Dockerfile"  # Updated path to Dockerfile

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

# Login to container registry - uncomment and run manually if not logged in
# $CONTAINER_ENGINE login -u clara17verse

if [ "$CONTAINER_ENGINE" = "docker" ]; then
    # Clean up any existing builder instances
    docker buildx ls | grep -q multiarch-builder && docker buildx rm multiarch-builder || true
    docker context rm multiarch-context 2>/dev/null || true

    # Create a new context and builder
    docker context create multiarch-context 2>/dev/null || true
    docker buildx create --name multiarch-builder --driver docker-container --driver-opt network=host --use multiarch-context
fi

# Build and push image
echo "Building and pushing image: ${IMAGE_NAME}:${TAG}"

if [ "$CONTAINER_ENGINE" = "docker" ]; then
    # Build for multiple platforms and push using Docker buildx
    docker buildx build --platform linux/amd64,linux/arm64 \
      -t ${IMAGE_NAME}:${TAG} \
      --push \
      -f ${DOCKERFILE_PATH} .

    echo "Successfully built and pushed ${IMAGE_NAME}:${TAG} for multiple architectures"

    # Optional: List the supported architectures of the pushed image
    echo "Listing supported architectures:"
    docker buildx imagetools inspect ${IMAGE_NAME}:${TAG}

    # Clean up
    docker buildx rm multiarch-builder
    docker context rm multiarch-context
else
    # Build for current platform and push using Podman
    podman build -t ${IMAGE_NAME}:${TAG} -f ${DOCKERFILE_PATH} .
    podman push ${IMAGE_NAME}:${TAG}

    echo "Successfully built and pushed ${IMAGE_NAME}:${TAG} for current architecture"
fi

echo "Build and push completed successfully!"