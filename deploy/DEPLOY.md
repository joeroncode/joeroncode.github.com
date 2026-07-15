# Deploying Reel

Reel is one process: a Flask/gunicorn app that serves **both** the JSON API and
the web UI (front end and backend are already combined — there is nothing to
wire together). This guide covers running it in production and getting it onto
**Google Play**.

## 1. Run the combined app

### Docker (recommended)

```bash
docker compose up --build          # -> http://localhost:8000
# or plain docker:
docker build -t reel .
docker run -p 8000:8000 -v reel-jobs:/data/jobs reel
```

The image is lean (OpenCV detector, no PyTorch). To bake in the YOLO backend
where model weights are reachable:

```bash
docker build --build-arg WITH_YOLO=1 -t reel:yolo .
```

### Without Docker

```bash
pip install -r requirements.txt gunicorn
gunicorn wsgi:app --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 180
```

The detector is warmed at boot, so the first request is fast.

## 2. Host it over HTTPS

Google Play's web wrapper (below) requires the app to be served over **HTTPS on
a real domain**. Put the container behind any TLS terminator:

- A managed host (Cloud Run, Fly.io, Render, an EC2/VM behind Nginx/Caddy), or
- Caddy in front of the container for automatic certificates.

Once live, confirm `https://YOUR_HOST/manifest.webmanifest` and
`https://YOUR_HOST/health` both return 200. The UI is already a PWA
(`manifest.webmanifest` + `sw.js` + maskable icons), so Android will offer
"Install app" directly.

## 3. Package for Google Play (Trusted Web Activity)

> Reality check: Play distributes **Android apps**, not a Python server. The
> fastest path that reuses everything here is a **Trusted Web Activity** — a
> thin Android wrapper around the hosted PWA. The scoring/render still runs on
> your server; the Play app is the mobile front door. (A fully on-device
> Android rewrite — TensorFlow Lite / OpenCV-Android — is a separate, much
> larger project.)

Using Google's [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap):

```bash
npm i -g @bubblewrap/cli

# Edit deploy/twa-manifest.json first: set "host", "packageId",
# "webManifestUrl" and the icon URLs to your real HTTPS domain.
bubblewrap init --manifest ./deploy/twa-manifest.json
bubblewrap build          # produces app-release-signed.aab + a keystore
```

### Verify domain ownership (Digital Asset Links)

`bubblewrap build` prints your signing key's SHA-256 fingerprint. Put it in an
`assetlinks.json` and serve it at `https://YOUR_HOST/.well-known/assetlinks.json`
so the Android URL bar is hidden:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.example.reel",
    "sha256_cert_fingerprints": ["<FROM_BUBBLEWRAP_BUILD>"]
  }
}]
```

The app serves this automatically if you set `PV_ASSETLINKS` to the file path
(see `photo_video/server/app.py`), or host the file at that path yourself.

### Submit

1. Create the app in the [Play Console](https://play.google.com/console)
   (one-time $25 developer registration).
2. Upload `app-release-signed.aab`, fill the store listing (icon, screenshots,
   description, privacy policy), and roll out to internal/closed testing first.
3. Promote to production once tested.

## Checklist

- [ ] `docker compose up` serves the app at :8000
- [ ] Hosted over HTTPS on a real domain; `/health` and `/manifest.webmanifest` OK
- [ ] `deploy/twa-manifest.json` edited with your host + packageId
- [ ] `bubblewrap build` produced a signed `.aab`
- [ ] `/.well-known/assetlinks.json` served with the build fingerprint
- [ ] Store listing + privacy policy ready in Play Console
