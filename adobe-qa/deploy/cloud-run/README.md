# Cloud Run learning deployment

This is the first internal-hosting step: the existing web app and Chrome worker
run in one private Cloud Run service. It is intentionally configured as one
always-allocated instance because the current queue is in process memory.

## What gets deployed

```text
Browser → private Cloud Run service
              ├── Next.js UI/API
              ├── in-memory serial queue
              └── Chrome QA runner
```

This is suitable for learning and controlled team use. A container restart
loses queued/completed in-memory jobs. Before treating the service as durable
production infrastructure, replace that queue with Cloud Tasks and persist
reports/plans in Cloud Storage or a database.

## 1. Prerequisites

- A Google Cloud project with billing enabled.
- `gcloud` installed and authenticated.
- Permission to enable APIs, deploy Cloud Run, and grant invoker access.
- A Google Workspace user or group that should access the tool.

Set the values once in your shell:

```bash
export PROJECT_ID="your-google-cloud-project"
export REGION="us-central1"
export SERVICE="adobe-qa"
export INVOKER="group:analytics-team@example.com"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## 2. Build the same image locally

From `adobe-qa/`:

```bash
docker build -t adobe-qa:local .
docker run --rm -p 8080:8080 adobe-qa:local
```

Open `http://localhost:8080`. This confirms that Node, Chrome, the SDR, and the
data-layer map are all present inside the container.

## 3. Deploy privately

From `adobe-qa/`:

```bash
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --no-allow-unauthenticated \
  --min-instances 1 \
  --max-instances 1 \
  --no-cpu-throttling \
  --cpu 2 \
  --memory 2Gi \
  --concurrency 20 \
  --timeout 3600 \
  --set-env-vars CHROME_PATH=/usr/bin/google-chrome-stable,ADOBE_QA_ROOT=/app
```

Why these settings:

- `--no-allow-unauthenticated` keeps the service private.
- One instance preserves queue visibility and prevents concurrent Chrome
  workers.
- Always-allocated CPU lets a queued browser run continue after the short
  submission request returns.
- 2 CPU / 2 GiB is a safe starting point for one Chrome session; inspect actual
  Cloud Monitoring usage before changing it.

An always-allocated minimum instance incurs cost while idle. Set a Google Cloud
budget alert before inviting the team.

## 4. Grant team access

```bash
gcloud run services add-iam-policy-binding "$SERVICE" \
  --region "$REGION" \
  --member "$INVOKER" \
  --role roles/run.invoker
```

Cloud Run IAM protects the service, but opening an IAM-only URL directly in a
normal browser is not the final friendly SSO experience. For daily team use,
place the service behind an external HTTPS load balancer with Identity-Aware
Proxy (IAP), then grant the same Workspace group IAP access.

## 5. Observe and remove

```bash
gcloud run services logs read "$SERVICE" --region "$REGION" --limit 100
gcloud run services describe "$SERVICE" --region "$REGION"
```

To stop all service cost after a learning exercise:

```bash
gcloud run services delete "$SERVICE" --region "$REGION"
```

## Durable split after the learning deployment

```text
Next.js UI/API (Cloud Run)
        │ creates task
        ▼
Cloud Tasks
        │ authenticated worker request
        ▼
Chrome worker (Cloud Run, max instances controlled)
        │
        ├── Cloud Storage: uploaded plans + report.html/report.json
        └── Firestore/SQL: run status and searchable metadata
```

This keeps GitHub as the source of truth while moving runtime files and job
state to services designed for persistence.
