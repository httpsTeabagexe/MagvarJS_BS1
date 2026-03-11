GeomagJS — Portable offline bundle

This workspace now includes a simple offline bundler that embeds the data files into a single self-contained JavaScript bundle and generates an `index-offline.html` you can open with `file://` (no web server required).

How to produce the portable package (Windows):

1. Install dev deps (once):

```powershell
npm install
```

2. Build the portable ZIP (runs the offline bundler then zips the `public/` folder):

```powershell
npm run portable
```

This produces `public/bundle.js`, `public/index-offline.html`, and `portable.zip` at the repo root.

How to use on an offline machine:

- Copy the `public/` folder (or `portable.zip`) to your flash drive.
- On the offline machine extract `portable.zip` or copy `public/` to a local folder.
- Open `public/index-offline.html` in your browser (double-click or use `file://` URL). No server required.

Notes and troubleshooting:

- The `bundle-offline` script embeds `src/data/IGRF14.COF` and `src/data/countries-110m.json` into the bundle. If you want to update those files, re-run `npm run bundle:offline`.
- The bundle expects the local copies of `libs/d3.min.js`, `libs/topojson.min.js`, and `libs/d3-geo-projection.min.js` inside `public/libs/`. These are already present in the `public/libs/` folder.
- If you need a smaller bundle: consider compressing or using topojson simplification.

If you want, I can also add a small script that verifies the offline page works by launching a headless browser to open `public/index-offline.html` and confirm it loads without 404s.
