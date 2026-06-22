import { build } from 'esbuild';
import { copyFile, mkdir, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function buildPopup() {
  console.log('Building popup...');
  execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });
}

async function buildScripts() {
  console.log('Building extension scripts...');
  await ensureDir(path.join(DIST, 'scripts'));

  const entries = ['background.ts', 'offscreen.ts'];
  for (const entry of entries) {
    await build({
      entryPoints: [path.join(ROOT, 'src', entry)],
      outfile: path.join(DIST, 'scripts', entry.replace('.ts', '.js')),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      minify: true,
    });
    console.log(`  Built ${entry}`);
  }
}

async function copyAssets() {
  console.log('Copying assets...');

  // Copy manifest
  await copyFile(
    path.join(ROOT, 'manifest.json'),
    path.join(DIST, 'manifest.json')
  );

  // Copy icons
  const iconsDir = path.join(ROOT, 'public', 'icons');
  if (existsSync(iconsDir)) {
    const destIcons = path.join(DIST, 'icons');
    await ensureDir(destIcons);
    const files = await readdir(iconsDir);
    for (const f of files) {
      await copyFile(path.join(iconsDir, f), path.join(destIcons, f));
    }
  }

  // Copy offscreen.html to dist root
  await copyFile(
    path.join(ROOT, 'public', 'offscreen.html'),
    path.join(DIST, 'offscreen.html')
  );

  console.log('Assets copied.');
}

async function main() {
  await ensureDir(DIST);
  await buildPopup();
  await buildScripts();
  await copyAssets();
  console.log('\nBuild complete! dist/ is ready for loading.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
