import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, '..');
const repositoryDirectory = resolve(projectDirectory, '..', '..');
const outputDirectory = join(
  repositoryDirectory,
  'brand-work',
  'launch-2026-09-outbound',
  'exports',
  'motion',
);
const remotionCli = join(projectDirectory, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const remotionEntry = join(projectDirectory, 'src', 'index.ts');
const shimPath = join(projectDirectory, 'scripts', 'remotion-network-shim.cjs');

const deliveries = [
  {
    composition: 'BotBound-FirstMove-15s-Vertical',
    fileName: 'botbound-first-move-15s-vertical-1080x1920.mp4',
  },
  {
    composition: 'BotBound-FirstMove-10s-Square',
    fileName: 'botbound-first-move-10s-square-1080x1080.mp4',
  },
  {
    composition: 'BotBound-FirstMove-6s-Vertical',
    fileName: 'botbound-first-move-6s-vertical-1080x1920.mp4',
  },
];

await mkdir(outputDirectory, {recursive: true});

for (const delivery of deliveries) {
  const outputPath = join(outputDirectory, delivery.fileName);
  const result = spawnSync(
    process.execPath,
    [
      remotionCli,
      'render',
      remotionEntry,
      delivery.composition,
      outputPath,
      '--codec=h264',
      '--crf=16',
      '--pixel-format=yuv420p',
      '--color-space=bt709',
      '--audio-codec=aac',
      '--audio-bitrate=256k',
      '--concurrency=1',
    ],
    {
      cwd: projectDirectory,
      env: {
        ...process.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${shimPath}`].filter(Boolean).join(' '),
      },
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    throw new Error(`Render failed for ${delivery.composition} with exit code ${result.status}.`);
  }
}

console.log(`Rendered ${deliveries.length} outbound social masters to ${outputDirectory}.`);
