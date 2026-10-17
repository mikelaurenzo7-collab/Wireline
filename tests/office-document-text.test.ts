import { describe, expect, it } from "vitest";
import { extractOfficeDocumentText } from "../src/lib/office-document-text";
import { storedZip } from "./helpers/stored-zip";

describe("Office document text extraction", () => {
  it("extracts DOCX paragraphs, tabs, line breaks, and XML entities", () => {
    const bytes = storedZip([
      {
        name: "word/document.xml",
        method: 8,
        contents:
          "<w:document><w:body><w:p><w:r><w:t>Call &amp; book</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>with care</w:t></w:r></w:p><w:p><w:r><w:t>Second &#x1F4AC; paragraph</w:t></w:r></w:p></w:body></w:document>",
      },
    ]);

    expect(extractOfficeDocumentText(bytes, "docx")).toBe(
      "Call & book\twith care\nSecond 💬 paragraph",
    );
  });

  it("extracts shared strings, inline strings, numbers, booleans, and sheet rows from XLSX", () => {
    const bytes = storedZip([
      { name: "xl/workbook.xml", contents: "<workbook/>" },
      {
        name: "xl/sharedStrings.xml",
        contents:
          "<sst><si><t>Open Monday</t></si><si><r><t>through</t></r><r><t> Friday</t></r></si></sst>",
      },
      {
        name: "xl/worksheets/sheet2.xml",
        contents:
          '<worksheet><sheetData><row r="3"><c r="A3" t="s"><v>0</v></c><c r="B3" t="s"><v>1</v></c><c r="C3"><v>9:30</v></c><c r="D3" t="b"><v>1</v></c><c r="E3" t="inlineStr"><is><t>Appointment</t></is></c></row></sheetData></worksheet>',
      },
    ]);

    expect(extractOfficeDocumentText(bytes, "xlsx")).toBe(
      "Sheet 1\nRow 3: A3: Open Monday | B3: through Friday | C3: 9:30 | D3: TRUE | E3: Appointment",
    );
  });

  it("accepts 1,000 rows but rejects a workbook that would lose later rows", () => {
    const workbook = (count: number) => {
      const rows = Array.from(
        { length: count },
        (_, index) =>
          `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t>${index + 1}</t></is></c></row>`,
      ).join("");
      return storedZip([
        { name: "xl/workbook.xml", contents: "<workbook/>" },
        {
          name: "xl/worksheets/sheet1.xml",
          contents: `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
        },
      ]);
    };

    expect(extractOfficeDocumentText(workbook(1_000), "xlsx")).toContain("Row 1000: A1000: 1000");
    expect(() => extractOfficeDocumentText(workbook(1_001), "xlsx")).toThrow(
      expect.objectContaining({
        status: 413,
        code: "PAYLOAD_TOO_LARGE",
        message:
          "The Excel workbook has too many rows or sheets. Split it into smaller files and try again.",
      }),
    );
  });

  it.each(["worksheets/sheet.xml", "/xl/worksheets/sheet.xml"])(
    "reads a prefixed SDK-style worksheet using target %s",
    (target) => {
      const bytes = storedZip([
        {
          name: "xl/workbook.xml",
          contents: '<workbook><sheets><sheet name="Hours" r:id="rId1"/></sheets></workbook>',
        },
        {
          name: "xl/_rels/workbook.xml.rels",
          contents: `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${target}"/></Relationships>`,
        },
        {
          name: "xl/sharedStrings.xml",
          contents: "<x:sst><x:si><x:t>Open daily</x:t></x:si></x:sst>",
        },
        {
          name: "xl/worksheets/sheet.xml",
          contents:
            '<x:worksheet><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" t="n"><x:v>100</x:v></x:c></x:row></x:sheetData></x:worksheet>',
        },
      ]);

      expect(extractOfficeDocumentText(bytes, "xlsx")).toBe(
        "Sheet Hours\nRow 1: A1: Open daily | B1: 100",
      );
    },
  );

  it("rejects a worksheet relationship that escapes the worksheets folder", () => {
    const bytes = storedZip([
      {
        name: "xl/workbook.xml",
        contents: '<workbook><sheets><sheet name="Unsafe" r:id="rId1"/></sheets></workbook>',
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        contents:
          '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/../workbook.xml"/></Relationships>',
      },
    ]);

    expect(() => extractOfficeDocumentText(bytes, "xlsx")).toThrow(
      "The Office document is damaged or uses an unsupported format.",
    );
  });

  it("rejects an external worksheet relationship even when its target looks local", () => {
    const bytes = storedZip([
      {
        name: "xl/workbook.xml",
        contents: '<workbook><sheets><sheet name="Unsafe" r:id="rId1"/></sheets></workbook>',
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        contents:
          '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml" TargetMode="External"/></Relationships>',
      },
      {
        name: "xl/worksheets/sheet1.xml",
        contents:
          '<worksheet><sheetData><row r="1"><c r="A1"><v>123</v></c></row></sheetData></worksheet>',
      },
    ]);

    expect(() => extractOfficeDocumentText(bytes, "xlsx")).toThrow(
      "The Office document is damaged or uses an unsupported format.",
    );
  });

  it("accepts 200 visible worksheets and rejects a 201st", () => {
    const workbook = (hideLast: boolean) => {
      const indexes = Array.from({ length: 201 }, (_, index) => index + 1);
      return storedZip([
        {
          name: "xl/workbook.xml",
          contents: `<workbook><sheets>${indexes
            .map(
              (index) =>
                `<sheet name="${index}" r:id="rId${index}"${hideLast && index === 201 ? ' state="hidden"' : ""}/>`,
            )
            .join("")}</sheets></workbook>`,
        },
        {
          name: "xl/_rels/workbook.xml.rels",
          contents: `<Relationships>${indexes
            .map(
              (index) =>
                `<Relationship Id="rId${index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index}.xml"/>`,
            )
            .join("")}</Relationships>`,
        },
        ...indexes.map((index) => ({
          name: `xl/worksheets/sheet${index}.xml`,
          contents: `<worksheet><sheetData><row r="1"><c r="A1"><v>${index}</v></c></row></sheetData></worksheet>`,
        })),
      ]);
    };

    expect(extractOfficeDocumentText(workbook(true), "xlsx")).toContain(
      "Sheet 200\nRow 1: A1: 200",
    );
    expect(() => extractOfficeDocumentText(workbook(false), "xlsx")).toThrow(
      expect.objectContaining({ status: 413, code: "PAYLOAD_TOO_LARGE" }),
    );
  });

  it("rejects 201 worksheet parts when workbook metadata is absent", () => {
    const bytes = storedZip([
      { name: "xl/workbook.xml", contents: "<workbook/>" },
      ...Array.from({ length: 201 }, (_, index) => ({
        name: `xl/worksheets/sheet${index + 1}.xml`,
        contents: "<worksheet><sheetData/></worksheet>",
      })),
    ]);

    expect(() => extractOfficeDocumentText(bytes, "xlsx")).toThrow(
      expect.objectContaining({ status: 413, code: "PAYLOAD_TOO_LARGE" }),
    );
  });

  it("skips chart sheets while importing visible worksheets", () => {
    const bytes = storedZip([
      {
        name: "xl/workbook.xml",
        contents:
          '<workbook><sheets><sheet name="Chart" r:id="rId1"/><sheet name="Hours" r:id="rId2"/></sheets></workbook>',
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        contents:
          '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartsheet" Target="chartsheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      },
      {
        name: "xl/worksheets/sheet1.xml",
        contents:
          '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Open Monday</t></is></c></row></sheetData></worksheet>',
      },
    ]);

    expect(extractOfficeDocumentText(bytes, "xlsx")).toBe("Sheet Hours\nRow 1: A1: Open Monday");
  });

  it("uses visible workbook sheet names and order, excluding hidden worksheets", () => {
    const bytes = storedZip([
      {
        name: "xl/workbook.xml",
        contents:
          '<workbook><sheets><sheet name="Policies &amp; Hours" sheetId="2" r:id="rId2"/><sheet name="Internal secrets" sheetId="1" state="veryHidden" r:id="rId1"/></sheets></workbook>',
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        contents:
          '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
      },
      {
        name: "xl/worksheets/sheet1.xml",
        contents:
          '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Private token</t></is></c></row></sheetData></worksheet>',
      },
      {
        name: "xl/worksheets/sheet2.xml",
        contents:
          '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Open Monday</t></is></c></row></sheetData></worksheet>',
      },
    ]);

    expect(extractOfficeDocumentText(bytes, "xlsx")).toBe(
      "Sheet Policies & Hours\nRow 1: A1: Open Monday",
    );
  });

  it("rejects a workbook that declares sheets without readable relationships", () => {
    const bytes = storedZip([
      {
        name: "xl/workbook.xml",
        contents: '<workbook><sheets><sheet name="Visible" r:id="rId1"/></sheets></workbook>',
      },
      {
        name: "xl/worksheets/sheet1.xml",
        contents:
          '<worksheet><sheetData><row r="1"><c r="A1"><v>123</v></c></row></sheetData></worksheet>',
      },
    ]);

    expect(() => extractOfficeDocumentText(bytes, "xlsx")).toThrow(
      "The Office document is damaged or uses an unsupported format.",
    );
  });

  it("keeps a styled empty cell from taking the next cell's value", () => {
    const bytes = storedZip([
      { name: "xl/workbook.xml", contents: "<workbook/>" },
      {
        name: "xl/sharedStrings.xml",
        contents: "<sst><si><t>First</t></si><si/><si><t>Third</t></si></sst>",
      },
      {
        name: "xl/worksheets/sheet1.xml",
        contents:
          '<worksheet><sheetData><row r="1"><c r="A1" s="2"/><c r="B1" t="s"><v>2</v></c></row><row r="2"/><row r="3"><c r="A3" t="s"><v>0</v></c></row></sheetData></worksheet>',
      },
    ]);

    expect(extractOfficeDocumentText(bytes, "xlsx")).toBe(
      "Sheet 1\nRow 1: B1: Third\nRow 3: A3: First",
    );
  });

  const UNCLOSED = 200_000;
  const workbook = { name: "xl/workbook.xml", contents: "<workbook/>" };
  it.each([
    [
      "DOCX paragraphs",
      "docx",
      [{ name: "word/document.xml", contents: "<w:p>x".repeat(UNCLOSED) }],
    ],
    [
      "DOCX text runs",
      "docx",
      [{ name: "word/document.xml", contents: `<w:p>${"<w:t>x".repeat(UNCLOSED)}</w:p>` }],
    ],
    [
      "XLSX rows",
      "xlsx",
      [workbook, { name: "xl/worksheets/sheet1.xml", contents: "<row>x".repeat(UNCLOSED) }],
    ],
    [
      "XLSX cells",
      "xlsx",
      [
        workbook,
        { name: "xl/worksheets/sheet1.xml", contents: `<row>${"<c>x".repeat(UNCLOSED)}</row>` },
      ],
    ],
    [
      "XLSX shared strings",
      "xlsx",
      [
        workbook,
        { name: "xl/sharedStrings.xml", contents: "<si>x".repeat(UNCLOSED) },
        { name: "xl/worksheets/sheet1.xml", contents: "<worksheet/>" },
      ],
    ],
  ] as const)("reads %s with many unclosed tags in linear time", (_label, extension, files) => {
    const bytes = storedZip(files.map((file) => ({ ...file, method: 8 as const })));
    const started = performance.now();

    expect(() => extractOfficeDocumentText(bytes, extension)).toThrow(
      "The Office document contains no readable text.",
    );
    // The lazy patterns this replaced needed minutes for these 1 MB entries.
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("rejects malformed archives, mismatched Office formats, and empty workbooks", () => {
    expect(() => extractOfficeDocumentText(Buffer.from("not a zip"), "docx")).toThrow();
    expect(() =>
      extractOfficeDocumentText(
        storedZip([{ name: "xl/workbook.xml", contents: "<workbook/>" }]),
        "docx",
      ),
    ).toThrow();
    expect(() =>
      extractOfficeDocumentText(
        storedZip([
          { name: "xl/workbook.xml", contents: "<workbook/>" },
          { name: "xl/worksheets/sheet1.xml", contents: "<worksheet><sheetData/></worksheet>" },
        ]),
        "xlsx",
      ),
    ).toThrow("The Office document contains no readable text.");
  });
});
