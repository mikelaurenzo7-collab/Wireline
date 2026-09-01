import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Resvg} from '@resvg/resvg-js';

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
    stem: 'botbound-second-ring-6s-vertical-1080x1920',
    cut: '6s',
    times: [0.7, 2.7, 5.0],
  },
  {
    stem: 'botbound-second-ring-10s-square-1080x1080',
    cut: '10s',
    times: [0.9, 4.8, 8.3],
  },
  {
    stem: 'botbound-second-ring-15s-vertical-1080x1920',
    cut: '15s',
    times: [1.2, 6.1, 13.0],
  },
  {
    stem: 'botbound-second-ring-30s-landscape-1920x1080',
    cut: '30s',
    times: [1.2, 15.8, 28.0],
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

const available = deliveries.filter(({stem}) => existsSync(join(outputDirectory, `${stem}.mp4`)));
const metadata = [];
const qaFrames = [];

for (const delivery of available) {
  const videoPath = join(outputDirectory, `${delivery.stem}.mp4`);
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
    },
    audio: {
      codec: audio?.codec_name,
      sampleRate: Number(audio?.sample_rate),
      channels: audio?.channels,
    },
  });

  for (const [index, time] of delivery.times.entries()) {
    const position = ['opening', 'mid', 'end'][index];
    const framePath = join(qaDirectory, `${delivery.stem}-${position}.png`);
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

  for (const extension of ['json', 'srt', 'vtt']) {
    const sidecar = `botbound-second-ring-${delivery.cut}.${extension}`;
    const source = join(projectDirectory, 'public', 'captions', sidecar);
    if (existsSync(source)) {
      await copyFile(source, join(outputDirectory, sidecar));
    }
  }
}

if (qaFrames.length > 0) {
  const columns = 3;
  const rows = Math.ceil(qaFrames.length / columns);
  const cellWidth = 400;
  const cellHeight = 700;
  const svgCells = await Promise.all(
    qaFrames.map(async (framePath, index) => {
      const x = (index % columns) * cellWidth;
      const y = Math.floor(index / columns) * cellHeight;
      const label = framePath
        .split(/[\\/]/)
        .at(-1)
        .replace('botbound-second-ring-', '')
        .replace('.png', '')
        .replaceAll('&', '&amp;');
      const image = (await readFile(framePath)).toString('base64');
      return `
        <rect x="${x + 8}" y="${y + 8}" width="384" height="684" rx="18" fill="#11111a" stroke="#2f2940"/>
        <text x="${x + 24}" y="${y + 40}" fill="#d8d6e2" font-family="Arial, sans-serif" font-size="15" font-weight="700">${label}</text>
        <image x="${x + 20}" y="${y + 56}" width="360" height="624" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${image}"/>
      `;
    }),
  );
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellWidth}" height="${rows * cellHeight}">
      <rect width="100%" height="100%" fill="#08080D"/>
      ${svgCells.join('')}
    </svg>
  `;
  const contactSheet = new Resvg(svg).render().asPng();
  await writeFile(
    join(qaDirectory, 'botbound-second-ring-motion-qa-contact-sheet.png'),
    contactSheet,
  );

  metadata.push({qaContactSheet: `qa/botbound-second-ring-motion-qa-contact-sheet.png`, rows});
}

await writeFile(
  join(outputDirectory, 'metadata.json'),
  `${JSON.stringify({generatedAt: new Date().toISOString(), deliveries: metadata}, null, 2)}\n`,
  'utf8',
);
await writeFile(
  join(outputDirectory, 'SHA256SUMS.txt'),
  `${metadata
    .filter((entry) => entry.file)
    .map((entry) => `${entry.sha256}  ${entry.file}`)
    .join('\n')}\n`,
  'utf8',
);

console.log(`Verified ${available.length} motion masters and wrote ${qaFrames.length} QA frames.`);
