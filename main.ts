// Sun Palma: this entrypoint hands in the Sun Palma open-world crime game
// (game/ + screenshots/) built for make.fun's gta6-01 bounty.
// A working gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. Only the plumbing, not an open world: Block
// Dodger, a plain 2D canvas game where a paddle dodges falling blocks and catches coins, with a
// title screen, score, lives and levels, game over and restart, flat colours and no sound. Build
// your own open-world crime game in its place (three.js or any library you vendor under game/),
// put your 3 or 4 PNG or JPEG screenshots in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

copyEntry();
checkScreenshots();
writeDossier();

// Copy game/ and screenshots/ from beside this file to /output.
function copyEntry() {
  mkdirSync(out, { recursive: true });
  cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Revision pass: a small sanity check of our own before the dossier is built
// — the gate refuses more than 4 screenshots or one over 256 KiB, so catch
// that here with a plain error instead of a silent bad entry.
function checkScreenshots() {
  const shotFiles = readdirSync(join(here, 'screenshots')).filter((f) => !f.startsWith('.'));
  if (shotFiles.length < 3 || shotFiles.length > 4) {
    throw new Error(`expected 3-4 screenshots, found ${shotFiles.length}`);
  }
  for (const f of shotFiles) {
    const bytes = statSync(join(here, 'screenshots', f)).size;
    if (bytes > 262144) throw new Error(`screenshot ${f} is ${bytes} bytes, over the 256 KiB cap`);
  }
  console.log(`sun-palma: ${shotFiles.length} screenshots ok, handing in game/ + dossier.json`);
}

function writeDossier() {
  // The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
  // scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
  // files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
  // screenshots/ and dossier.json).
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, {
      // how much prose the dossier may hold
      text_max_bytes: 163840,
      // the gate's own screenshot rules: at most 4, none over 256 KiB
      screenshots: {
        max: 4,
        max_bytes: 262144,
      },
      // game/ limits: file count, total bytes, longest path
      game_max_files: 993,
      game_max_bytes: 50331648,
      game_path_max_bytes: 1000,
    }),
  );
}
