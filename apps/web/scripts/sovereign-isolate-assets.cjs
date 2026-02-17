/**
 * Sovereign Mode Asset Isolation Script
 * 
 * This script moves legacy assets from /public to /private/legacy_assets
 * when SOVEREIGN_MODE=true, preventing them from being publicly served.
 * 
 * The assets are preserved for potential future reactivation but are not
 * accessible in Sovereign-only deployments.
 */

const fs = require('fs');
const path = require('path');

const sovereignMode = String(process.env.SOVEREIGN_MODE || '').trim().toLowerCase() === 'true';

if (!sovereignMode) {
  console.log('[SOVEREIGN-BUILD] SOVEREIGN_MODE=false - keeping all public assets accessible');
  process.exit(0);
}

console.log('[SOVEREIGN-BUILD] SOVEREIGN_MODE=true - isolating legacy assets...');

const publicDir = path.join(__dirname, '..', 'public');
const legacyDir = path.join(__dirname, '..', 'private', 'legacy_assets');

// Legacy asset patterns to isolate
const legacyPatterns = [
  /^phoenix-zero-.*\.js$/,
  /^playground\.html$/,
  /^agent-playground\.html$/,
  /^demo-anchor-selector\.html$/
];

// Ensure legacy directory exists
if (!fs.existsSync(legacyDir)) {
  fs.mkdirSync(legacyDir, { recursive: true });
}

// Scan public directory
const files = fs.readdirSync(publicDir);
let movedCount = 0;

for (const file of files) {
  const isLegacy = legacyPatterns.some(pattern => pattern.test(file));
  
  if (isLegacy) {
    const sourcePath = path.join(publicDir, file);
    const destPath = path.join(legacyDir, file);
    
    // Check if it's a file (not directory)
    const stat = fs.statSync(sourcePath);
    if (stat.isFile()) {
      // Move to legacy directory
      fs.renameSync(sourcePath, destPath);
      console.log(`[SOVEREIGN-BUILD] Isolated: ${file} -> private/legacy_assets/`);
      movedCount++;
    }
  }
}

console.log(`[SOVEREIGN-BUILD] Isolated ${movedCount} legacy assets`);
console.log('[SOVEREIGN-BUILD] Legacy assets preserved in private/legacy_assets/ for potential future reactivation');
