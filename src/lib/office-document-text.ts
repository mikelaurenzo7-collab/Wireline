import { inflateRawSync } from "node:zlib";

import { AppError } from "./api-error";

const MAX_ZIP_ENTRIES = 5_000;
const MAX_ZIP_ENTRY_BYTES = 8_000_000;
const MAX_ZIP_TOTAL_BYTES = 20_000_000;
const MAX_SHEETS = 200;
const MAX_ROWS_PER_SHEET = 1_000;
const MAX_DOCUMENT_TEXT_CHARS = 240_000;

type ZipEntry = {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

function invalidDocument(): never {
  throw AppError.badRequest("The Office document is damaged or uses an unsupported format.");
}

function zipDirectory(bytes: Buffer): Map<string, ZipEntry> {
  if (bytes.length < 22) return invalidDocument();
  const minEocd = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= minEocd; offset -= 1) {
    if (
      bytes.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length
    ) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) return invalidDocument();

  const disk = bytes.readUInt16LE(eocd + 4);
  const directoryDisk = bytes.readUInt16LE(eocd + 6);
  const diskEntries = bytes.readUInt16LE(eocd + 8);
  const totalEntries = bytes.readUInt16LE(eocd + 10);
  const directorySize = bytes.readUInt32LE(eocd + 12);
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  if (
    disk !== 0 ||
    directoryDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0xffff ||
    totalEntries > MAX_ZIP_ENTRIES ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff ||
    directoryOffset + directorySize > eocd
  ) {
    return invalidDocument();
  }

  const entries = new Map<string, ZipEntry>();
  let offset = directoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > eocd || bytes.readUInt32LE(offset) !== 0x02014b50) {
      return invalidDocument();
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (
      nextOffset > eocd ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      return invalidDocument();
    }

    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const relevant =
      name === "word/document.xml" ||
      name === "xl/workbook.xml" ||
      name === "xl/sharedStrings.xml" ||
      /^xl\/worksheets\/sheet\d+\.xml$/.test(name);
    if (relevant) {
      if (entries.has(name) || (flags & 1) !== 0 || ![0, 8].includes(method)) {
        return invalidDocument();
      }
      entries.set(name, {
        name,
        method,
        flags,
        compressedSize,
        uncompressedSize,
        localOffset,
      });
    }
    offset = nextOffset;
  }
  if (offset !== directoryOffset + directorySize) return invalidDocument();
  return entries;
}

class OfficeZipReader {
  private inflatedBytes = 0;
  private readonly entries: Map<string, ZipEntry>;

  constructor(private readonly bytes: Buffer) {
    this.entries = zipDirectory(bytes);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  sheetNames(): string[] {
    return [...this.entries.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  }

  read(name: string): string | null {
    const entry = this.entries.get(name);
    if (!entry) return null;
    if (
      entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES ||
      this.inflatedBytes + entry.uncompressedSize > MAX_ZIP_TOTAL_BYTES ||
      entry.localOffset + 30 > this.bytes.length ||
      this.bytes.readUInt32LE(entry.localOffset) !== 0x04034b50
    ) {
      return invalidDocument();
    }
    const localFlags = this.bytes.readUInt16LE(entry.localOffset + 6);
    const localMethod = this.bytes.readUInt16LE(entry.localOffset + 8);
    const localNameLength = this.bytes.readUInt16LE(entry.localOffset + 26);
    const localExtraLength = this.bytes.readUInt16LE(entry.localOffset + 28);
    const dataOffset = entry.localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + entry.compressedSize;
    const localName = this.bytes
      .subarray(entry.localOffset + 30, entry.localOffset + 30 + localNameLength)
      .toString("utf8");
    if (
      dataEnd > this.bytes.length ||
      localName !== entry.name ||
      localMethod !== entry.method ||
      ((localFlags | entry.flags) & 1) !== 0
    ) {
      return invalidDocument();
    }

    const compressed = this.bytes.subarray(dataOffset, dataEnd);
    let output: Buffer;
    try {
      output =
        entry.method === 0
          ? compressed
          : inflateRawSync(compressed, { maxOutputLength: MAX_ZIP_ENTRY_BYTES });
    } catch {
      return invalidDocument();
    }
    if (output.length !== entry.uncompressedSize) return invalidDocument();
    this.inflatedBytes += output.length;
    return output.toString("utf8");
  }
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
    if (code === "amp") return "&";
    if (code === "lt") return "<";
    if (code === "gt") return ">";
    if (code === "quot") return '"';
    if (code === "apos") return "'";
    const numeric =
      code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(numeric);
    } catch {
      return entity;
    }
  });
}

function xmlText(xml: string, tag: string): string {
  const matcher = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "g");
  return [...xml.matchAll(matcher)].map((match) => decodeXml(match[1] || "")).join("");
}

function boundedOutput(lines: string[]): string {
  const text = lines.join("\n").trim();
  if (!text) throw AppError.badRequest("The Office document contains no readable text.");
  if (text.length > MAX_DOCUMENT_TEXT_CHARS) {
    throw AppError.fromHttpStatus(
      413,
      "The Office document contains too much text. Split it into smaller files and try again.",
    );
  }
  return text;
}

function wordText(xml: string): string {
  const lines: string[] = [];
  const paragraphs = /<w:p\b[^>]*>([\s\S]*?)<\/w:p\s*>/g;
  for (const paragraph of xml.matchAll(paragraphs)) {
    const contents = /<w:t\b[^>]*>([\s\S]*?)<\/w:t\s*>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
    const value = [...(paragraph[1] || "").matchAll(contents)]
      .map((part) =>
        part[1] !== undefined ? decodeXml(part[1]) : part[0].startsWith("<w:tab") ? "\t" : " ",
      )
      .join("")
      .trim();
    if (value) lines.push(value);
  }
  return boundedOutput(lines);
}

function attribute(source: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`).exec(source)?.[1] ?? null;
}

function sheetText(xml: string, sharedStrings: string[], sheetNumber: number): string[] {
  const lines = [`Sheet ${sheetNumber}`];
  const rows = /<row\b([^>]*)>([\s\S]*?)<\/row\s*>/g;
  let rowIndex = 0;
  for (const row of xml.matchAll(rows)) {
    rowIndex += 1;
    if (rowIndex > MAX_ROWS_PER_SHEET) break;
    const rowNumber = attribute(row[1] || "", "r") || String(rowIndex);
    const values: string[] = [];
    const cells = /<c\b([^>]*)>([\s\S]*?)<\/c\s*>/g;
    for (const cell of (row[2] || "").matchAll(cells)) {
      const attrs = cell[1] || "";
      const reference = attribute(attrs, "r") || "cell";
      const type = attribute(attrs, "t") || "n";
      let value = "";
      if (type === "inlineStr") {
        value = xmlText(cell[2] || "", "t");
      } else {
        value = xmlText(cell[2] || "", "v");
        if (type === "s") {
          const sharedIndex = Number(value);
          value = Number.isInteger(sharedIndex) ? (sharedStrings[sharedIndex] ?? "") : "";
        } else if (type === "b") {
          value = value === "1" ? "TRUE" : value === "0" ? "FALSE" : value;
        }
      }
      if (value.trim()) values.push(`${reference}: ${value.trim()}`);
    }
    if (values.length) lines.push(`Row ${rowNumber}: ${values.join(" | ")}`);
  }
  return lines.length > 1 ? lines : [];
}

function excelText(reader: OfficeZipReader): string {
  const sharedXml = reader.read("xl/sharedStrings.xml");
  const sharedStrings = sharedXml
    ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si\s*>/g)].map((item) =>
        xmlText(item[1] || "", "t"),
      )
    : [];
  const sheetNames = reader
    .sheetNames()
    .sort(
      (left, right) => Number(/sheet(\d+)/.exec(left)?.[1]) - Number(/sheet(\d+)/.exec(right)?.[1]),
    )
    .slice(0, MAX_SHEETS);
  const lines: string[] = [];
  sheetNames.forEach((name, index) => {
    const xml = reader.read(name);
    if (xml) lines.push(...sheetText(xml, sharedStrings, index + 1));
  });
  return boundedOutput(lines);
}

export function extractOfficeDocumentText(bytes: Buffer, extension: "docx" | "xlsx"): string {
  const reader = new OfficeZipReader(bytes);
  if (extension === "docx") {
    const document = reader.read("word/document.xml");
    if (!document) return invalidDocument();
    return wordText(document);
  }
  if (!reader.has("xl/workbook.xml")) return invalidDocument();
  return excelText(reader);
}
