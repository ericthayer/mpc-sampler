// Assemble the deployable site in ./site: only the files the browser loads.
// Run after `tsc` (see `npm run build:site`). Keeps source, tests and node_modules off the host.
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'site');
const FILES = ['index.html', 'help.html', 'sw.js', 'manifest.webmanifest', 'styles', 'icons', 'dist'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of FILES) {
  await stat(join(root, file)); // fail loudly if something is missing
  await cp(join(root, file), join(out, file), { recursive: true });
}
console.log(`site/ ready: ${FILES.join(', ')}`);
