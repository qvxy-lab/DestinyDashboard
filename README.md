# Destiny Control Center

Official homepage: https://qvxy-lab.github.io/DestinyDashboard/

Pages deployed automatically from this repository:
- `index.html`: animated landing screen with the angled Destiny eagle.
- `dashboard.html`: existing Discord OAuth dashboard and server management interface.
- `documents.html`: getting started and feature documentation.
- `assets/destiny-eagle.svg`: vectorized eagle emblem based on the supplied logo.

## Navigation
The homepage's **Dashboard** and **Documents** links lead to real pages. The dashboard sidebar eagle and header Home button return to the main menu. After OAuth authorization, the running Destiny bot redirects to `dashboard.html`, preserving the session and chosen server.

The GitHub Pages Actions workflow deploys all three HTML files, the eagle asset, and public `destiny-config.js`. The secure OAuth API runs separately at the FadeHost bot. **Never commit Discord Client Secrets or bot tokens.**

Some server-configuration panels are still previews; they don't persist bot settings yet.
