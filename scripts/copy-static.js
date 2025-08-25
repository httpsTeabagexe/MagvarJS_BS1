// scripts/copy-static.js
// Copies static model + geo data from src/data -> public/data for browser fetch.
const K_FS = require('fs');
const K_PATH = require('path');

const par_src_dir = K_PATH.join(__dirname, '..', 'src', 'data');
const par_dest_dir = K_PATH.join(__dirname, '..', 'public', 'data');

if (!K_FS.existsSync(par_src_dir)) {
  console.log('[copy-static] No src/data directory found, nothing to copy.');
  process.exit(0);
}
K_FS.mkdirSync(par_dest_dir, { recursive: true });

const entries = K_FS.readdirSync(par_src_dir, { withFileTypes: true });
let loc_copied = 0;
entries.forEach(e => {
  if (e.isFile()) {
    const par_from = K_PATH.join(par_src_dir, e.name);
    const par_to = K_PATH.join(par_dest_dir, e.name);
    K_FS.copyFileSync(par_from, par_to);
    loc_copied++;
  }
});
console.log(`[copy-static] Copied ${loc_copied} file(s) from src/data to public/data.`);

