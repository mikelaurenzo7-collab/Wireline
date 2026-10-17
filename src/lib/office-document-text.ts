import { inflateRawSync } from "node:zlib";
import { posix } from "node:path";

import { AppError } from "./api-error";

const MAX_ZIP_ENTRIES = 5_000;
const MAX_ZIP_ENTRY_BYTES = 8_000_000;
const MAX_ZIP_TOTAL_BYTES = 20_000_000;
const MAX_SHEETS = 200;
const MAX_ROWS_PER_SHEET = 1_000;
const MAX_DOCUMENT_TEXT_CHARS = 240_000;
const WORKSHEET_PART_PATH = /^xl\/worksheets\/[^/\\]+\.xml$/;

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

function workbookTooLarge(): never {
  throw AppError.fromHttpStatus(
    413,
    "The Excel workbook has too many rows or sheets. Split it into smaller files and try again.",
  );
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
      name === "xl/_rels/workbook.xml.rels" ||
      name === "xl/sharedStrings.xml" ||
      WORKSHEET_PART_PATH.test(name);
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
    return [...this.entries.keys()].filter((name) => WORKSHEET_PART_PATH.test(name));
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

type XmlStartTag = {
  name: string;
  attrs: string;
  end: number;
  selfClosing: boolean;
};

type XmlElement = { attrs: string; body: string };

function isXmlNameChar(code: number): boolean {
  return (
    (code >= 48 && code <= 58) || // 0-9 and ":"
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95 || // _
    code === 45 || // -
    code === 46 // .
  );
}

function isXmlSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

/** `name` or `prefix:name`, as `<(?:[\w.-]+:)?name\b` matched. */
function localName(name: string): (candidate: string) => boolean {
  return (candidate) => {
    if (candidate === name) return true;
    const prefix = candidate.slice(0, -name.length - 1);
    return candidate.endsWith(`:${name}`) && prefix.length > 0 && !prefix.includes(":");
  };
}

/**
 * Next start tag at or after `from` whose name passes `accepts`. Returns null
 * once no later start tag can be complete. Each call scans forward only.
 */
function nextStartTag(
  xml: string,
  from: number,
  accepts: (name: string) => boolean,
): XmlStartTag | null {
  let cursor = from;
  for (;;) {
    const start = xml.indexOf("<", cursor);
    if (start === -1) return null;
    let nameEnd = start + 1;
    while (nameEnd < xml.length && isXmlNameChar(xml.charCodeAt(nameEnd))) nameEnd += 1;
    const name = xml.slice(start + 1, nameEnd);
    if (!name || !accepts(name)) {
      cursor = Math.max(nameEnd, start + 1);
      continue;
    }
    const close = xml.indexOf(">", nameEnd);
    if (close === -1) return null;
    const attrs = xml.slice(nameEnd, close);
    return { name, attrs, end: close + 1, selfClosing: attrs.trimEnd().endsWith("/") };
  }
}

/** First `</name\s*>` at or after `from`, as `<\/name\s*>` matched. */
function nextEndTag(
  xml: string,
  from: number,
  accepts: (name: string) => boolean,
): { start: number; end: number } | null {
  let cursor = from;
  for (;;) {
    const start = xml.indexOf("</", cursor);
    if (start === -1) return null;
    let nameEnd = start + 2;
    while (nameEnd < xml.length && isXmlNameChar(xml.charCodeAt(nameEnd))) nameEnd += 1;
    let close = nameEnd;
    if (accepts(xml.slice(start + 2, nameEnd))) {
      while (close < xml.length && isXmlSpace(xml.charCodeAt(close))) close += 1;
      if (xml.charCodeAt(close) === 62) return { start, end: close + 1 };
    }
    cursor = Math.max(close, start + 2);
  }
}

/**
 * Elements in document order, in time linear in the input. The lazy
 * `<tag\b[^>]*>([\s\S]*?)<\/tag\s*>` patterns this replaced rescanned the rest
 * of the document from every unclosed start tag, so one small upload repeating
 * an unclosed tag held the request thread for minutes. Each scan here resumes
 * where the last ended, and the first start tag without an end tag ends the
 * scan, because no later start tag can have one either. Self-closing elements
 * are empty rather than swallowing the next element's content.
 */
function xmlElements(
  xml: string,
  accepts: (name: string) => boolean,
  limit = Number.POSITIVE_INFINITY,
): XmlElement[] {
  const elements: XmlElement[] = [];
  let cursor = 0;
  while (elements.length < limit) {
    const start = nextStartTag(xml, cursor, accepts);
    if (!start) break;
    if (start.selfClosing) {
      elements.push({ attrs: start.attrs, body: "" });
      cursor = start.end;
      continue;
    }
    const end = nextEndTag(xml, start.end, accepts);
    if (!end) break;
    elements.push({ attrs: start.attrs, body: xml.slice(start.end, end.start) });
    cursor = end.end;
  }
  return elements;
}

/** Attributes of every matching start tag, self-closing or not. */
function xmlStartTagAttributes(xml: string, accepts: (name: string) => boolean): string[] {
  const attributes: string[] = [];
  let cursor = 0;
  for (
    let tag = nextStartTag(xml, cursor, accepts);
    tag;
    tag = nextStartTag(xml, cursor, accepts)
  ) {
    attributes.push(tag.attrs);
    cursor = tag.end;
  }
  return attributes;
}

function xmlText(xml: string, tag: string): string {
  return xmlElements(xml, localName(tag))
    .map((element) => decodeXml(element.body))
    .join("");
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

const WORD_RUN_CONTENT = new Set(["w:t", "w:tab", "w:br"]);

/** Text, tabs, and line breaks of one paragraph, in document order. */
function wordParagraphText(paragraph: string): string {
  let text = "";
  let cursor = 0;
  // Once no `</w:t>` remains, no later `<w:t>` can close; skip their searches.
  let textCanClose = true;
  for (
    let tag = nextStartTag(paragraph, cursor, (name) => WORD_RUN_CONTENT.has(name));
    tag;
    tag = nextStartTag(paragraph, cursor, (name) => WORD_RUN_CONTENT.has(name))
  ) {
    cursor = tag.end;
    if (tag.name !== "w:t") {
      if (tag.selfClosing) text += tag.name === "w:tab" ? "\t" : " ";
      continue;
    }
    if (tag.selfClosing || !textCanClose) continue;
    const end = nextEndTag(paragraph, tag.end, (name) => name === "w:t");
    if (!end) {
      textCanClose = false;
      continue;
    }
    text += decodeXml(paragraph.slice(tag.end, end.start));
    cursor = end.end;
  }
  return text.trim();
}

function wordText(xml: string): string {
  const lines: string[] = [];
  for (const paragraph of xmlElements(xml, (name) => name === "w:p")) {
    const value = wordParagraphText(paragraph.body);
    if (value) lines.push(value);
  }
  return boundedOutput(lines);
}

function attribute(source: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`).exec(source)?.[1] ?? null;
}

function sheetText(xml: string, sharedStrings: string[], sheetLabel: string): string[] {
  const lines = [`Sheet ${sheetLabel}`];
  const rows = xmlElements(xml, localName("row"), MAX_ROWS_PER_SHEET + 1);
  if (rows.length > MAX_ROWS_PER_SHEET) return workbookTooLarge();
  for (const [rowIndex, row] of rows.entries()) {
    const rowNumber = attribute(row.attrs, "r") || String(rowIndex + 1);
    const values: string[] = [];
    for (const cell of xmlElements(row.body, localName("c"))) {
      const attrs = cell.attrs;
      const reference = attribute(attrs, "r") || "cell";
      const type = attribute(attrs, "t") || "n";
      let value = "";
      if (type === "inlineStr") {
        value = xmlText(cell.body, "t");
      } else {
        value = xmlText(cell.body, "v");
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

function visibleSheets(reader: OfficeZipReader): Array<{ path: string; label: string }> {
  const workbook = reader.read("xl/workbook.xml");
  if (!workbook) return invalidDocument();
  const sheetsXml = xmlElements(workbook, localName("sheets"), 1)[0]?.body;
  // A workbook without sheet metadata is only useful in minimal ZIP fixtures.
  // A real workbook declares each visible sheet and its relationship.
  if (sheetsXml === undefined) {
    const names = reader.sheetNames();
    if (names.length > MAX_SHEETS) return workbookTooLarge();
    return names
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .map((path, index) => ({ path, label: String(index + 1) }));
  }

  const relationships = reader.read("xl/_rels/workbook.xml.rels");
  if (!relationships) return invalidDocument();
  const paths = new Map<string, string>();
  const nonWorksheetIds = new Set<string>();
  for (const attrs of xmlStartTagAttributes(relationships, localName("Relationship"))) {
    const id = attribute(attrs, "Id");
    const target = attribute(attrs, "Target");
    const type = attribute(attrs, "Type");
    if (!id || !type) continue;
    if (attribute(attrs, "TargetMode") === "External") continue;
    if (type.endsWith("/chartsheet") || type.endsWith("/dialogsheet")) {
      nonWorksheetIds.add(id);
      continue;
    }
    if (!target || !type.endsWith("/worksheet")) continue;
    const path = posix.normalize(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    if (WORKSHEET_PART_PATH.test(path)) paths.set(id, path);
  }

  const visible: Array<{ path: string; label: string }> = [];
  for (const attrs of xmlStartTagAttributes(sheetsXml, localName("sheet"))) {
    if (["hidden", "veryHidden"].includes(attribute(attrs, "state") || "")) continue;
    const id = attribute(attrs, "r:id") || "";
    if (nonWorksheetIds.has(id)) continue;
    const path = paths.get(id);
    if (!path || !reader.has(path)) return invalidDocument();
    const label = decodeXml(attribute(attrs, "name") || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    visible.push({ path, label: label || String(visible.length + 1) });
    if (visible.length > MAX_SHEETS) return workbookTooLarge();
  }
  return visible;
}

function excelText(reader: OfficeZipReader): string {
  const sharedXml = reader.read("xl/sharedStrings.xml");
  const sharedStrings = sharedXml
    ? xmlElements(sharedXml, localName("si")).map((item) => xmlText(item.body, "t"))
    : [];
  const lines: string[] = [];
  visibleSheets(reader).forEach(({ path, label }) => {
    const xml = reader.read(path);
    if (xml) lines.push(...sheetText(xml, sharedStrings, label));
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
