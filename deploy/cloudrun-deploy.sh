#!/usr/bin/env bash
# Deploy Reel to Google Cloud Run from source (uses the repo Dockerfile).
#
# Prereqs: gcloud CLI authenticated (`gcloud auth login`) and a project set.
# Usage:   PROJECT=my-proj REGION=us-central1 ./deploy/cloudrun-deploy.sh
set -euo pipefail

SERVICE="${SERVICE:-reel}"
REGION="${REGION:-us-central1}"
PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"

if [ -z "${PROJECT}" ]; then
  echo "Set PROJECT=<gcp-project-id> (or run: gcloud config set project ...)" >&2
  exit 1
fi

echo "Deploying '${SERVICE}' to project '${PROJECT}' in '${REGION}'"

# --source . builds the repo Dockerfile via Cloud Build (lean image,
# WITH_YOLO=0 by default), then deploys. To include YOLO, build a custom
# image with `docker build --build-arg WITH_YOLO=1`, push it to Artifact
# Registry, and deploy that with `--image` instead of `--source .`.
gcloud run deploy "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --source . \
  --allow-unauthenticated \
  --memory "${MEMORY:-1Gi}" \
  --cpu "${CPU:-1}" \
  --concurrency "${CONCURRENCY:-8}" \
  --timeout "${TIMEOUT:-300}"

URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format 'value(status.url)')"
echo
echo "Live at: ${URL}"
echo "Health:  ${URL}/health"
echo "Manifest ${URL}/manifest.webmanifest"
echo
echo "Next: put this host in deploy/twa-manifest.json and run deploy/build-twa.sh"
