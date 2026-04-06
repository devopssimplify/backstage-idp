#!/bin/bash

# Build and push Backstage to Google Container Registry (GCR)
# Usage: ./build-and-push.sh [version]

set -e

# Configuration
PROJECT_ID="project-7d27fad9-61bb-42c4-b2e"
IMAGE_NAME="backstage"
REGISTRY="gcr.io"
VERSION="${1:-latest}"

FULL_IMAGE="${REGISTRY}/${PROJECT_ID}/${IMAGE_NAME}:${VERSION}"

echo "========================================="
echo "Building Backstage Docker Image"
echo "========================================="
echo "Project: ${PROJECT_ID}"
echo "Image: ${FULL_IMAGE}"
echo "========================================="

# Authenticate with GCR (if not already authenticated)
echo "Configuring Docker for GCR..."
gcloud auth configure-docker ${REGISTRY} --quiet

# Build the Docker image
echo "Building Docker image..."
docker build -t ${FULL_IMAGE} -f Dockerfile.gke .

# Also tag as latest
if [ "$VERSION" != "latest" ]; then
    echo "Tagging as latest..."
    docker tag ${FULL_IMAGE} ${REGISTRY}/${PROJECT_ID}/${IMAGE_NAME}:latest
fi

# Push to GCR
echo "Pushing image to GCR..."
docker push ${FULL_IMAGE}

if [ "$VERSION" != "latest" ]; then
    docker push ${REGISTRY}/${PROJECT_ID}/${IMAGE_NAME}:latest
fi

echo "========================================="
echo "Build and push completed successfully!"
echo "========================================="
echo "Image: ${FULL_IMAGE}"
echo ""
echo "To deploy this image to GKE, update the Kubernetes manifest"
echo "with this image tag and apply it:"
echo ""
echo "  kubectl apply -f k8s/"
echo "========================================="
