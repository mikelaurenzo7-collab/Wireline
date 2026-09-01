import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {parseSrt} from '@remotion/captions';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const captionsDirectory = join(scriptDirectory, '..', 'public', 'captions');
const cuts = ['30s', '15s', '10s', '6s'];

const pad = (value, length = 2) => String(value).padStart(length, '0');

const formatSrtTime = (milliseconds) => {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
};

const formatVttTime = (milliseconds) => formatSrtTime(milliseconds).replace(',', '.');

const assertCaptionAsset = (captions, cut) => {
  let previousEnd = 0;

  for (const [index, caption] of captions.entries()) {
    if (
      typeof caption.text !== 'string' ||
      typeof caption.startMs !== 'number' ||
      typeof caption.endMs !== 'number' ||
      caption.timestampMs !== null ||
      caption.confidence !== null
    ) {
      throw new Error(`${cut} caption ${index + 1} is not a complete Caption object.`);
    }

    if (caption.startMs < previousEnd || caption.endMs <= caption.startMs) {
      throw new Error(`${cut} caption ${index + 1} overlaps or has an invalid duration.`);
    }

    previousEnd = caption.endMs;
  }
};

for (const cut of cuts) {
  const stem = `botbound-second-ring-${cut}`;
  const source = join(captionsDirectory, `${stem}.json`);
  const captions = JSON.parse(await readFile(source, 'utf8'));
  assertCaptionAsset(captions, cut);

  const srt = captions
    .map(
      (caption, index) =>
        `${index + 1}\n${formatSrtTime(caption.startMs)} --> ${formatSrtTime(caption.endMs)}\n${caption.text}`,
    )
    .join('\n\n');

  const vtt = `WEBVTT\n\n${captions
    .map(
      (caption) =>
        `${formatVttTime(caption.startMs)} --> ${formatVttTime(caption.endMs)}\n${caption.text}`,
    )
    .join('\n\n')}`;

  const parsedSrt = parseSrt({input: srt}).captions.map(({text, startMs, endMs}) => ({
    text,
    startMs,
    endMs,
  }));
  const comparableSource = captions.map(({text, startMs, endMs}) => ({text, startMs, endMs}));

  if (JSON.stringify(parsedSrt) !== JSON.stringify(comparableSource)) {
    throw new Error(`${cut} SRT export does not match the source JSON timing and copy.`);
  }

  await Promise.all([
    writeFile(join(captionsDirectory, `${stem}.srt`), `${srt}\n`, 'utf8'),
    writeFile(join(captionsDirectory, `${stem}.vtt`), `${vtt}\n`, 'utf8'),
  ]);
}

console.log(`Exported SRT and WebVTT sidecars for ${cuts.length} BotBound cuts.`);
