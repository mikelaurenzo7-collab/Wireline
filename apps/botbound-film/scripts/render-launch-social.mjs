import {copyFile, mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, '..');
const repositoryDirectory = resolve(projectDirectory, '..', '..');
const outputDirectory = join(
  repositoryDirectory,
  'brand-work',
  'launch-2026-09',
  'exports',
  'motion',
);
const remotionCli = join(projectDirectory, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const remotionEntry = join(projectDirectory, 'src', 'index.ts');
const shimPath = join(projectDirectory, 'scripts', 'remotion-network-shim.cjs');

const deliveries = [
  {
    composition: 'BotBound-SecondRing-15s-Vertical-4K',
    fileName: 'botbound-second-ring-15s-vertical-1080x1920.mp4',
  },
  {
    composition: 'BotBound-SecondRing-10s-Square-4K',
    fileName: 'botbound-second-ring-10s-square-1080x1080.mp4',
  },
  {
    composition: 'BotBound-SecondRing-6s-Vertical-4K',
    fileName: 'botbound-second-ring-6s-vertical-1080x1920.mp4',
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
      '--scale=0.5',
      '--concurrency=2',
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

for (const cut of ['15s', '10s', '6s']) {
  for (const extension of ['json', 'srt', 'vtt']) {
    const fileName = `botbound-second-ring-${cut}.${extension}`;
    await copyFile(
      join(projectDirectory, 'public', 'captions', fileName),
      join(outputDirectory, fileName),
    );
  }
}

console.log(`Rendered ${deliveries.length} launch-social masters and copied caption sidecars to ${outputDirectory}.`);
