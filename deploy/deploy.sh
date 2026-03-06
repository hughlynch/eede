#!/usr/bin/env bash
# Deploy eede to Cloud Run.
#
# Usage:
#   ./deploy/deploy.sh [PROJECT_ID] [REGION]
#
# Prerequisites:
#   - gcloud CLI authenticated
#   - APIs enabled: run, artifactregistry, cloudbuild

set -euo pipefail

PROJECT="${1:-$(gcloud config get-value project)}"
REGION="${2:-us-central1}"
REPO="eede"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/eede"

echo "==> Deploying eede to ${PROJECT} in ${REGION}"

# Ensure Artifact Registry repo exists.
gcloud artifacts repositories describe "${REPO}" \
    --project="${PROJECT}" \
    --location="${REGION}" 2>/dev/null || \
gcloud artifacts repositories create "${REPO}" \
    --project="${PROJECT}" \
    --location="${REGION}" \
    --repository-format=docker \
    --description="eede container images"

# Build and push.
echo "==> Building Docker image..."
docker build \
    -t "${IMAGE}:latest" \
    -f deploy/Dockerfile.cloudrun \
    .

echo "==> Pushing to Artifact Registry..."
docker push "${IMAGE}:latest"

# Deploy to Cloud Run.
echo "==> Deploying to Cloud Run..."
gcloud run deploy eede \
    --project="${PROJECT}" \
    --region="${REGION}" \
    --image="${IMAGE}:latest" \
    --platform=managed \
    --allow-unauthenticated \
    --port=8080 \
    --memory=2Gi \
    --cpu=2 \
    --min-instances=0 \
    --max-instances=10 \
    --timeout=3600

# Get the service URL.
URL=$(gcloud run services describe eede \
    --project="${PROJECT}" \
    --region="${REGION}" \
    --format='value(status.url)')

echo "==> Deployed: ${URL}"
echo ""
echo "To map to eede.abwp.ai:"
echo "  gcloud run domain-mappings create \\"
echo "    --service=eede \\"
echo "    --domain=eede.abwp.ai \\"
echo "    --region=${REGION}"
