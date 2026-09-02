import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Resvg} from '@resvg/resvg-js';

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
const qaDirectory = join(outputDirectory, 'qa');
const compositorDirectory = join(
  projectDirectory,
  'node_modules',
  '.pnpm',
  '@remotion+compositor-win32-x64-msvc@4.0.506',
  'node_modules',
  '@remotion',
  'compositor-win32-x64-msvc',
);
const ffmpeg = join(compositorDirectory, 'ffmpeg.exe');
const ffprobe = join(compositorDirectory, 'ffprobe.exe');

const deliveries = [
  {
    stem: 'botbound-first-move-15s-vertical-1080x1920',
    times: [1.5, 5.1, 8.8, 12.7],
  },
  {
    stem: 'botbound-first-move-10s-square-1080x1080',
    times: [0.9, 3, 5.4, 8.4],
  },
  {
    stem: 'botbound-first-move-6s-vertical-1080x1920',
    times: [0.55, 1.85, 3.15, 5.2],
  },
];

const run = (command, args) => {
  const result = spawnSync(command, args, {cwd: projectDirectory, encoding: 'utf8'});
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout;
};

const sha256 = async (filePath) =>
  createHash('sha256').update(await readFile(filePath)).digest('hex');

await mkdir(qaDirectory, {recursive: true});

const metadata = [];
const qaFrames = [];
const positions = ['find', 'call', 'book', 'end'];

for (const delivery of deliveries) {
  const videoPath = join(outputDirectory, `${delivery.stem}.mp4`);
  if (!existsSync(videoPath)) {
    throw new Error(`Missing motion master: ${videoPath}`);
  }

  const probe = JSON.parse(
    run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', videoPath]),
  );
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');

  metadata.push({
    file: `${delivery.stem}.mp4`,
    sha256: await sha256(videoPath),
    bytes: Number(probe.format.size),
    durationSeconds: Number(probe.format.duration),
    video: {
      codec: video?.codec_name,
      width: video?.width,
      height: video?.height,
      frameRate: video?.avg_frame_rate,
      pixelFormat: video?.pix_fmt,
      colorSpace: video?.color_space,
    },
    audio: {
      codec: audio?.codec_name,
      sampleRate: Number(audio?.sample_rate),
      channels: audio?.channels,
    },
  });

  for (const [index, time] of delivery.times.entries()) {
    const framePath = join(qaDirectory, `${delivery.stem}-${positions[index]}.png`);
    run(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(time),
      '-i',
      videoPath,
      '-frames:v',
      '1',
      framePath,
    ]);
    qaFrames.push(framePath);
  }
}

const columns = 4;
const rows = deliveries.length;
const cellWidth = 320;
const cellHeight = 610;
const svgCells = await Promise.all(
  qaFrames.map(async (framePath, index) => {
    const x = (index % columns) * cellWidth;
    const y = Math.floor(index / columns) * cellHeight;
    const label = framePath
      .split(/[\\/]/)
      .at(-1)
      .replace('botbound-first-move-', '')
      .replace('.png', '')
      .replaceAll('&', '&amp;');
    const image = (await readFile(framePath)).toString('base64');
    return `
      <rect x="${x + 8}" y="${y + 8}" width="304" height="594" rx="20" fill="#11111a" stroke="#302945"/>
      <text x="${x + 22}" y="${y + 39}" fill="#ddd9e8" font-family="Arial, sans-serif" font-size="14" font-weight="700">${label}</text>
      <image x="${x + 18}" y="${y + 55}" width="284" height="528" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${image}"/>
    `;
  }),
);
const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellWidth}" height="${rows * cellHeight}">
    <rect width="100%" height="100%" fill="#06060A"/>
    ${svgCells.join('')}
  </svg>
`;
await writeFile(
  join(qaDirectory, 'botbound-first-move-motion-qa-contact-sheet.png'),
  new Resvg(svg).render().asPng(),
);

await writeFile(
  join(outputDirectory, 'metadata.json'),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      campaign: 'THE FIRST MOVE',
      audioProgram: {
        spokenDialogue: false,
        content: 'Original BotBound score and UI confirmation chime only.',
        captionSidecars: 'Not applicable: there is no spoken dialogue and campaign copy is burned in.',
      },
      deliveries: metadata,
      qaContactSheet: 'qa/botbound-first-move-motion-qa-contact-sheet.png',
    },
    null,
    2,
  )}\n`,
  'utf8',
);
await writeFile(
  join(outputDirectory, 'SHA256SUMS.txt'),
  `${metadata.map((entry) => `${entry.sha256}  ${entry.file}`).join('\n')}\n`,
  'utf8',
);

console.log(`Verified ${deliveries.length} masters and wrote ${qaFrames.length} QA frames.`);
