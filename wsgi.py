"""WSGI entrypoint for production servers (gunicorn, uWSGI, ...).

    gunicorn wsgi:app --bind 0.0.0.0:8000 --workers 2 --timeout 120

The detector is built once at import so the first request isn't blocked by
model loading.
"""

from photo_video.server.app import app, get_detector

# Warm the shared detector at boot.
get_detector()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
