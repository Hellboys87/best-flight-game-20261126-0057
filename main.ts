// Skyline Courier — the hand-in program.
//
// Copies game/ and screenshots/ from beside this file into the output
// directory (MAKEFUN_OUTPUT_DIR, or /output), then writes the dossier
// that the kit's library builds from those files. Node standard library
// only, no network, and fully deterministic: run it twice and the two
// output trees are byte for byte the same.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from an empty output directory so a stale file can never leak in.
// Clear the directory's contents, not the directory itself: in the grader
// /output is a mounted volume, and removing a mount point fails.
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) {
  rmSync(join(outDir, entry), { recursive: true, force: true });
}

// The game itself.
const gameDir = join(here, 'game');
if (!existsSync(gameDir)) throw new Error('game/ is missing from the repository');
cpSync(gameDir, join(outDir, 'game'), { recursive: true });

// The screenshots, taken from the running game.
const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) throw new Error('screenshots/ is missing from the repository');
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

// The dossier, built from exactly what was just copied.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`Skyline Courier handed in to ${outDir}`);
