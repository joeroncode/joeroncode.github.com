# Launch checklist — Reel to Google Play

A single ordered runbook. Work straight down it. Each step has the exact
command and how to confirm it worked. Detailed background lives in
[`deploy/DEPLOY.md`](deploy/DEPLOY.md); this is the sequence.

**Path:** combined app → Cloud Run (HTTPS) → PWA → Bubblewrap TWA → Play.
Everything up to "You do" is already built and tested in this repo.

---

## 0. Smoke-test locally (5 min)

```bash
pip install -r requirements.txt gunicorn
gunicorn wsgi:app --bind 0.0.0.0:8000 --workers 1 --threads 8 --timeout 180
```

- [ ] Open http://localhost:8000 → the **Reel** UI loads
- [ ] Click **Try it with sample photos** → 8 ranked cards with detection boxes
- [ ] **Render slideshow** → video plays, **Download MP4** works
- [ ] Scoring lab: toggle **re-rank live**, drag a weight → order changes
- [ ] http://localhost:8000/privacy loads
- [ ] http://localhost:8000/health → `{"status":"ok",...}`

## 1. Edit the privacy policy (required by Play)

Open `photo_video/server/web/privacy.html` and replace every
amber-highlighted placeholder:

- [ ] `[operator contact email]` → a real, monitored address
- [ ] `[your organization / name]`
- [ ] `[your hosting provider, e.g. Google Cloud Run]` → Google Cloud Run

Commit the change.

## 2. Deploy to Cloud Run

Prereqs: `gcloud` installed + authenticated, billing enabled on the project.

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT
PROJECT=YOUR_PROJECT REGION=us-central1 ./deploy/cloudrun-deploy.sh
```

The script prints your service URL. Confirm:

- [ ] `curl https://YOUR_HOST/health` → `{"status":"ok",...}`
- [ ] `https://YOUR_HOST/manifest.webmanifest` returns 200
- [ ] `https://YOUR_HOST/privacy` shows your edited policy

> Optional: map a custom domain
> `gcloud run domain-mappings create --service reel --domain reel.yourco.com`.
> Whatever host you settle on is the one you use everywhere below.

## 3. Confirm it's installable (PWA)

- [ ] Visit `https://YOUR_HOST` on Android Chrome → you get an **Install app**
      prompt (this is the check that the TWA wrapper will pass)

## 4. Build the Android app (Trusted Web Activity)

Prereqs: Node.js installed (Bubblewrap runs via `npx` and will offer to
install a JDK + Android SDK on first run).

1. Edit `deploy/twa-manifest.json`:
   - [ ] `"host"` → `YOUR_HOST` (no scheme)
   - [ ] `"webManifestUrl"` → `https://YOUR_HOST/manifest.webmanifest`
   - [ ] `"iconUrl"` / `"maskableIconUrl"` → `https://YOUR_HOST/assets/icon-512.png`
         and `.../icon-maskable.png`
   - [ ] `"packageId"` → e.g. `com.yourco.reel` (permanent once published)
2. Build:
   ```bash
   ./deploy/build-twa.sh
   ```
   - [ ] Produces `app-release-signed.aab`
   - [ ] **Save the keystore it creates** (losing it means you can never
         update the app) and note the printed SHA-256 fingerprint

## 5. Verify domain ownership (Digital Asset Links)

Put the SHA-256 from step 4 into an `assetlinks.json`:

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

Serve it at `https://YOUR_HOST/.well-known/assetlinks.json` — the app already
has the route; point it at the file and redeploy:

```bash
# upload assetlinks.json somewhere on the instance (e.g. bake into the image),
# then:
gcloud run services update reel --region us-central1 \
  --update-env-vars PV_ASSETLINKS=/path/to/assetlinks.json
```

- [ ] `curl https://YOUR_HOST/.well-known/assetlinks.json` returns your JSON

## 6. Play Console

- [ ] Create a Play Console account ($25 one-time) and a new app
- [ ] Upload `app-release-signed.aab`
- [ ] Store listing: app name, short + full description, feature graphic,
      screenshots (grab from a phone or the running app)
- [ ] **Privacy policy URL** → `https://YOUR_HOST/privacy`
- [ ] Complete the Data safety form. What to declare, matching this app:
      - Collects **Photos** — processed, **not** stored/shared, not for tracking
      - No account, no location, no advertising ID
- [ ] Roll out to **Internal testing** first; install on a device and verify
      the app opens full-screen with **no browser URL bar** (proves asset
      links are correct)
- [ ] Promote to Production

---

## Operational knobs (already wired)

Set as Cloud Run env vars (`gcloud run services update reel --update-env-vars ...`):

| Env | Default | Purpose |
|-----|---------|---------|
| `PV_RATE_LIMIT`    | `30`  | requests/window per IP (`0` = off) |
| `PV_RATE_WINDOW`   | `60`  | window seconds |
| `PV_MAX_IMAGES`    | `40`  | images per request |
| `PV_MAX_UPLOAD_MB` | `64`  | request-body cap |
| `PV_ASSETLINKS`    | –     | path to assetlinks.json |

## Known limits (fine for launch, plan for scale)

- **Rate limit is per-instance** (in-memory). If Cloud Run scales out, the cap
  is per-instance. For a global limit, add Memorystore/Redis.
- **Rendered videos are ephemeral** (`/tmp`); they're meant to be downloaded
  immediately and don't persist across instances.
- **Detector**: OpenCV Haar+HOG by default. YOLO turns on automatically where
  its weights are reachable — build with `--build-arg WITH_YOLO=1` and give the
  service more memory (≥2Gi) if you want it.
