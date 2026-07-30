---
to: nginx.conf
---
server {
    # 8080, not 80: the unprivileged nginx image runs as UID 101 and cannot bind a privileged port.
    listen 8080;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # The one rule that makes a SPA work behind a static server.
    #
    # Client-side routing means /settings exists only in JavaScript — nginx has no such file and
    # would answer 404. Falling back to index.html lets the router take over. The symptom without
    # it is subtle: navigating inside the app works, but reloading that page or opening the link
    # directly 404s.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Hashed filenames are content-addressed, so a year is safe and a changed file gets a new name.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # index.html must never be cached: it is the map to those hashed filenames. Cached, a browser
    # keeps requesting the previous deploy's assets long after they are gone.
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # A dedicated liveness target for the Kubernetes probe. Cheaper than serving index.html, and it
    # does not appear in the access log every few seconds.
    location = /healthz {
        access_log off;
        add_header Content-Type text/plain;
        return 200 'ok';
    }

    # Headers a static app can set safely. A Content-Security-Policy is deliberately absent: a
    # useful one depends on what this app actually loads, and a wrong one breaks the page while
    # looking like it works in development.
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
