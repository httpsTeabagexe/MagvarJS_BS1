// scripts/bundle-offline.js
// Bundles the full app into public/bundle.js (IIFE, no ES modules needed).
// Data files are embedded at build time so fetch() is never called.
// Result: open public/index-offline.html directly via file:// – no server required.

const esbuild = require('esbuild');
const path    = require('path');
const fs      = require('fs');

const rootDir   = path.join(__dirname, '..');
const dataDir   = path.join(rootDir, 'src', 'data');
const publicDir = path.join(rootDir, 'public');

// Read both data files that the app currently loads via fetch / d3.json
const cofText   = fs.readFileSync(path.join(dataDir, 'IGRF14.COF'), 'utf8');
const worldText = fs.readFileSync(path.join(dataDir, 'countries-110m.json'), 'utf8');

console.log(`[bundle-offline] Embedding IGRF14.COF  (${(cofText.length / 1024).toFixed(1)} KB)`);
console.log(`[bundle-offline] Embedding countries-110m.json (${(worldText.length / 1024).toFixed(1)} KB)`);

esbuild.build({
  entryPoints: [ path.join(rootDir, 'src', 'main.ts') ],
  bundle:      true,
  format:      'iife',
  // d3 / topojson / d3-geo-projection are already loaded as globals via <script>
  // tags in index.html – mark them external so esbuild leaves the references alone.
  // (geomag_visualizer.ts never imports them; it uses the window globals directly.)
  external: [],          // nothing to mark external – d3/topojson aren't imported
  outfile:  path.join(publicDir, 'bundle.js'),
  target:   ['es2017'],
  // Inject both data files as compile-time string/object constants.
  // The TS source checks  typeof __OFFLINE_COF__ !== 'undefined'  at runtime;
  // esbuild replaces those identifiers with the literal values below.
  define: {
    // COF file → a JS string literal (double-stringified so the define value
    // is itself a valid JS string expression)
    '__OFFLINE_COF__':   JSON.stringify(cofText),
    // World atlas → a JS object literal (raw JSON is valid JS)
    '__OFFLINE_WORLD__': worldText,
  },
  // TypeScript is handled natively by esbuild – no separate tsc step needed.
  loader: { '.ts': 'ts', '.js': 'js' },
  minify:    false,
  sourcemap: false,
  logLevel:  'info',
}).then(() => {
  console.log('[bundle-offline] ✓  public/bundle.js written.');

  // ── Write public/index-offline.html ─────────────────────────────────────
  const devHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

  // Replace the dev module script with the self-contained bundle
  const offlineHtml = devHtml.replace(
    /<script\s+type="module"\s+src="\.\/dist\/main\.js"><\/script>/,
    '<script src="./bundle.js"></script>'
  );

  if (offlineHtml === devHtml) {
    console.warn('[bundle-offline] ⚠  Could not find the module <script> tag in index.html.');
    console.warn('                    Edit public/index.html manually and change the last');
    console.warn('                    <script> to:  <script src="./bundle.js"></script>');
  } else {
    fs.writeFileSync(path.join(publicDir, 'index-offline.html'), offlineHtml, 'utf8');
    console.log('[bundle-offline] ✓  public/index-offline.html written.');
  }

  console.log('\n[bundle-offline] ✓  Done!  Copy the public/ folder to your flash drive.');
  console.log('                    Open  public/index-offline.html  in any browser.');
}).catch(err => {
  console.error('[bundle-offline] ✗  Build failed:', err.message);
  process.exit(1);
});
