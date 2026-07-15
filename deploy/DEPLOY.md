# Deploying Reel → Google Cloud Run → Google Play (TWA)

Reel is one process: a Flask/gunicorn app that serves **both** the JSON API and
the web UI. Target chosen: **host on Google Cloud Run**, then ship to Play as a
**Trusted Web Activity** (a thin Android wrapper around the hosted PWA).

```
   this repo ──▶ Cloud Run (HTTPS)  ──▶ PWA install
                      │
                      └──▶ Bubblewrap TWA ──▶ signed .aab ──▶ Play Console
```

## 0. Run locally first

```bash
docker compose up --build          # -> http://localhost:8000
# or, no Docker:
gunicorn wsgi:app --bind 0.0.0.0:8000 --workers 1 --threads 8 --timeout 180
```

The container reads `$PORT` (Cloud Run injects it), warms the detector at boot,
and keeps render jobs in `/tmp` (Cloud Run's writable, in-memory FS).

## 1. Deploy to Cloud Run

One command (uses the repo `Dockerfile` via Cloud Build):

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT
PROJECT=YOUR_PROJECT REGION=us-central1 ./deploy/cloudrun-deploy.sh
```

Under the hood it runs:

```bash
gcloud run deploy reel --source . --region us-central1 \
  --allow-unauthenticated --memory 1Gi --cpu 1 --concurrency 8 --timeout 300
```

The script prints the service URL (e.g. `https://reel-abc123-uc.a.run.app`).
Verify:

```bash
curl https://reel-abc123-uc.a.run.app/health          # -> {"status":"ok",...}
```

Notes for Cloud Run:
- **Lean image** (OpenCV only, ~600 MB) fits in 1 GiB. YOLO/PyTorch needs more —
  build a custom image (`docker build --build-arg WITH_YOLO=1`), push to
  Artifact Registry, and deploy with `--image` instead of `--source .`.
- **Ephemeral FS**: rendered MP4s live in `/tmp` and are meant to be downloaded
  right away; they don't persist across instances. That's fine for this flow.
- **Custom domain** (optional but nicer for Play): map one with
  `gcloud run domain-mappings create --service reel --domain reel.yourco.com`.
  The TWA host can be either the `run.app` URL or your custom domain.

## 2. Package for Google Play (Trusted Web Activity)

> Play distributes Android apps, not a Python server. The TWA wraps your hosted
> PWA — scoring/render keep running on Cloud Run; the Play app is the mobile
> front door. (A fully on-device rewrite is a separate, much larger project.)

1. Edit `deploy/twa-manifest.json`: set `host`, `webManifestUrl`, and the icon
   URLs to your Cloud Run / custom-domain HTTPS host, and choose a `packageId`
   (e.g. `com.yourco.reel`).
2. Build the Android bundle:

   ```bash
   ./deploy/build-twa.sh        # npx @bubblewrap/cli init + build
   ```

   Needs Node.js (Bubblewrap runs via `npx`); it will offer to install a JDK +
   Android SDK on first run. Output: `app-release-signed.aab` and a keystore.

### 3. Verify domain ownership (Digital Asset Links)

`build` prints your signing key's SHA-256 fingerprint. Serve an `assetlinks.json`
at `https://YOUR_HOST/.well-known/assetlinks.json` so Android hides the URL bar:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.yourco.reel",
    "sha256_cert_fingerprints": ["<FROM_BUBBLEWRAP_BUILD>"]
  }
}]
```

Reel already exposes the route — set `PV_ASSETLINKS` to the file's path on the
service and redeploy:

```bash
gcloud run services update reel --region us-central1 \
  --update-env-vars PV_ASSETLINKS=/tmp/assetlinks.json
```

(or bake the file into the image / mount it). Confirm:
`curl https://YOUR_HOST/.well-known/assetlinks.json`.

### 4. Submit

1. Create the app in the [Play Console](https://play.google.com/console)
   (one-time $25 developer registration).
2. Upload `app-release-signed.aab`, complete the listing (icon, screenshots,
   short/full description, **privacy policy URL**), and roll out to
   internal/closed testing first.
3. Promote to production once tested.

## Checklist

- [ ] `docker compose up` serves the app locally
- [ ] `./deploy/cloudrun-deploy.sh` deployed; `/health` + `/manifest.webmanifest` OK over HTTPS
- [ ] (optional) custom domain mapped
- [ ] `deploy/twa-manifest.json` edited with your host + packageId
- [ ] `./deploy/build-twa.sh` produced a signed `.aab`
- [ ] `/.well-known/assetlinks.json` served with the build fingerprint
- [ ] Store listing + privacy policy ready in Play Console
