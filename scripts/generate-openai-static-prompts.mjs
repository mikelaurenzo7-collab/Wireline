import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "gpt-4o-mini-tts";
const VOICE = "marin";
const FORMAT = "mp3";
const ENDPOINT = "https://api.openai.com/v1/audio/speech";
const PROVENANCE_FILE = "OPENAI_STATIC_TTS_PROVENANCE.md";

// This is a future reproducibility source only. No registered voice route may reference
// these filenames until every generated asset and provenance record is committed.
const assets = [
  {
    file: "openai-continuity-outage.mp3",
    input:
      "Hello. You have reached a BotBound Bot line. We are temporarily unable to connect the live voice service.",
  },
  {
    file: "openai-continuity-transfer.mp3",
    input:
      "Please hold while we transfer you to an available team member.",
  },
  {
    file: "openai-continuity-no-recording.mp3",
    input:
      "We are unable to take a message on this line right now. Please call back shortly and a member of the team will assist you. Thank you.",
  },
  {
    file: "openai-continuity-voicemail.mp3",
    input:
      "This call may be recorded. Please leave your name, number, and a brief message, and a human team member will return your call as soon as possible. Thank you.",
  },
  {
    file: "openai-demo-unavailable.mp3",
    input:
      "This BotBound demo line is taking a short break while we finish its connection. Please try again soon. Goodbye.",
  },
  {
    file: "openai-outbound-voicemail.mp3",
    input:
      "Hello. This is an AI assistant calling on behalf of the team at this phone number. Please return the call using the number shown on your caller ID. Thank you.",
  },
];

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "..");
const outputDirectory = resolve(repositoryRoot, "public", "sounds");
const force = process.argv.includes("--force");

function fail(message) {
  throw new Error(message);
}

function assertSafeOutputPath(path) {
  const pathFromRoot = relative(repositoryRoot, path);
  if (
    pathFromRoot === "" ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    resolve(path) !== path
  ) {
    fail(`Refusing to write outside the repository: ${path}`);
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function inspectMp3(buffer) {
  if (buffer.length < 1_024) {
    fail(`OpenAI returned an implausibly small MP3 (${buffer.length} bytes).`);
  }

  let searchStart = 0;
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") {
    if (buffer.length < 10) {
      fail("OpenAI returned a truncated ID3 header.");
    }

    const id3SizeBytes = buffer.subarray(6, 10);
    if ([...id3SizeBytes].some((byte) => (byte & 0x80) !== 0)) {
      fail("OpenAI returned an invalid ID3 size.");
    }

    const id3Size =
      (id3SizeBytes[0] << 21) |
      (id3SizeBytes[1] << 14) |
      (id3SizeBytes[2] << 7) |
      id3SizeBytes[3];
    const hasFooter = (buffer[5] & 0x10) !== 0;
    searchStart = 10 + id3Size + (hasFooter ? 10 : 0);
  }

  const searchEnd = Math.min(buffer.length - 4, searchStart + 65_536);
  for (let offset = searchStart; offset <= searchEnd; offset += 1) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const third = buffer[offset + 2];
    const fourth = buffer[offset + 3];

    if (first !== 0xff || (second & 0xe0) !== 0xe0) continue;

    const versionBits = (second >> 3) & 0x03;
    const layerBits = (second >> 1) & 0x03;
    const bitrateIndex = (third >> 4) & 0x0f;
    const sampleRateIndex = (third >> 2) & 0x03;

    if (
      versionBits === 0x01 ||
      layerBits !== 0x01 ||
      bitrateIndex === 0 ||
      bitrateIndex === 0x0f ||
      sampleRateIndex === 0x03
    ) {
      continue;
    }

    const sampleRates = {
      0: [11_025, 12_000, 8_000],
      2: [22_050, 24_000, 16_000],
      3: [44_100, 48_000, 32_000],
    };
    const mpeg1Bitrates = [
      0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
    ];
    const mpeg2Bitrates = [
      0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
    ];

    return {
      bitrateKbps:
        (versionBits === 3 ? mpeg1Bitrates : mpeg2Bitrates)[bitrateIndex],
      channels: (fourth >> 6) === 3 ? 1 : 2,
      sampleRateHz: sampleRates[versionBits][sampleRateIndex],
    };
  }

  fail("OpenAI response did not contain a valid MPEG Layer III frame.");
}

async function generateAsset(apiKey, asset) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      voice: VOICE,
      input: asset.input,
      response_format: FORMAT,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    fail(
      `OpenAI speech generation failed for ${asset.file}: HTTP ${response.status}${
        requestId ? ` (request ${requestId})` : ""
      }.`,
    );
  }

  const contentType = (response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const allowedContentTypes = new Set([
    "audio/mpeg",
    "audio/mp3",
    "application/octet-stream",
  ]);
  if (!allowedContentTypes.has(contentType)) {
    fail(
      `OpenAI returned unexpected content type ${contentType || "(missing)"} for ${asset.file}.`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const audio = inspectMp3(buffer);

  return {
    ...asset,
    ...audio,
    buffer,
    bytes: buffer.length,
    contentType,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function buildProvenance(records, generatedAt) {
  const rows = records
    .map(
      (record) =>
        `| \`${record.file}\` | ${record.bytes} | \`${record.sha256}\` | ${record.sampleRateHz} Hz / ${record.channels} channel${record.channels === 1 ? "" : "s"} / ${record.bitrateKbps} kbps | ${record.input} |`,
    )
    .join("\n");

  return `# OpenAI static TTS provenance

Generated: ${generatedAt}

Generator: \`scripts/generate-openai-static-prompts.mjs\`

Provider endpoint: OpenAI \`/v1/audio/speech\`

Model: \`${MODEL}\`

Voice: \`${VOICE}\`

Requested format: \`${FORMAT}\`

These files are static AI-generated continuity prompts. The credential used to
generate them was injected into the generator process and is not stored in the
files or this record. End-user surfaces that play these assets must retain an
appropriate disclosure that the voice is AI-generated.

| File | Bytes | SHA-256 | Validated MP3 stream | Exact input copy |
| --- | ---: | --- | --- | --- |
${rows}

## Regeneration

Use an authenticated, linked Vercel CLI and inject only the Development-scoped
environment without writing it to a file:

\`\`\`powershell
vercel env run -e development -- node scripts/generate-openai-static-prompts.mjs --development --force
\`\`\`

The generator validates every response and builds the complete batch in memory
before replacing any repository file. Regeneration can produce different audio
bytes; review the files and commit the newly generated checksums together.
`;
}

async function installBatch(records, provenance) {
  assertSafeOutputPath(outputDirectory);
  await mkdir(outputDirectory, { recursive: true });

  const transactionId = randomUUID();
  const stageDirectory = join(
    outputDirectory,
    `.openai-static-stage-${transactionId}`,
  );
  const backupDirectory = join(
    outputDirectory,
    `.openai-static-backup-${transactionId}`,
  );
  assertSafeOutputPath(stageDirectory);
  assertSafeOutputPath(backupDirectory);

  const outputs = [
    ...records.map((record) => ({
      file: record.file,
      data: record.buffer,
    })),
    { file: PROVENANCE_FILE, data: provenance },
  ];

  const backedUp = [];
  const installed = [];
  let removeBackupDirectory = false;
  try {
    await mkdir(stageDirectory);
    await mkdir(backupDirectory);

    for (const output of outputs) {
      await writeFile(join(stageDirectory, output.file), output.data, {
        flag: "wx",
      });
    }

    for (const output of outputs) {
      const destination = join(outputDirectory, output.file);
      assertSafeOutputPath(destination);
      if (await pathExists(destination)) {
        await rename(destination, join(backupDirectory, output.file));
        backedUp.push(output.file);
      }
    }

    for (const output of outputs) {
      await rename(
        join(stageDirectory, output.file),
        join(outputDirectory, output.file),
      );
      installed.push(output.file);
    }
    removeBackupDirectory = true;
  } catch (error) {
    const rollbackErrors = [];
    for (const file of installed.reverse()) {
      try {
        await rm(join(outputDirectory, file), { force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const file of backedUp.reverse()) {
      try {
        await rename(join(backupDirectory, file), join(outputDirectory, file));
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }

    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Static TTS installation failed and rollback was incomplete. Recovery files remain in ${backupDirectory}.`,
      );
    }
    removeBackupDirectory = true;
    throw error;
  } finally {
    await rm(stageDirectory, { force: true, recursive: true });
    if (removeBackupDirectory) {
      await rm(backupDirectory, { force: true, recursive: true });
    }
  }
}

async function main() {
  if (!process.argv.includes("--development")) {
    fail(
      "Refusing to generate without --development. Inject the Development-scoped Vercel environment with `vercel env run -e development -- ...`.",
    );
  }
  const declaredVercelEnvironment =
    process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV;
  if (
    declaredVercelEnvironment &&
    declaredVercelEnvironment !== "development"
  ) {
    fail(
      `Refusing to generate with Vercel environment ${declaredVercelEnvironment}.`,
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    fail(
      "OPENAI_API_KEY is unavailable. Supply it through the Development-scoped environment; do not paste it into the command.",
    );
  }

  const targetFiles = [...assets.map((asset) => asset.file), PROVENANCE_FILE];
  const existingFiles = [];
  for (const file of targetFiles) {
    if (await pathExists(join(outputDirectory, file))) existingFiles.push(file);
  }
  if (existingFiles.length > 0 && !force) {
    fail(
      `Refusing to replace existing outputs without --force: ${existingFiles.join(", ")}`,
    );
  }

  const records = [];
  for (const asset of assets) {
    records.push(await generateAsset(apiKey.trim(), asset));
  }

  const generatedAt = new Date().toISOString();
  const provenance = buildProvenance(records, generatedAt);
  await installBatch(records, provenance);

  console.log(
    `Generated ${records.length} OpenAI static TTS assets with ${MODEL}/${VOICE}.`,
  );
  for (const record of records) {
    console.log(
      `${record.sha256}  ${record.file}  ${record.bytes} bytes  ${record.sampleRateHz} Hz`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
