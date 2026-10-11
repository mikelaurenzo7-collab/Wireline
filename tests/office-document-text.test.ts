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

  it("limits extraction to the first 1,000 rows per worksheet", () => {
    const rows = Array.from(
      { length: 1_001 },
      (_, index) =>
        `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t>${index + 1}</t></is></c></row>`,
    ).join("");
    const bytes = storedZip([
      { name: "xl/workbook.xml", contents: "<workbook/>" },
      {
        name: "xl/worksheets/sheet1.xml",
        contents: `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
      },
    ]);
    const text = extractOfficeDocumentText(bytes, "xlsx");

    expect(text).toContain("Row 1000: A1000: 1000");
    expect(text).not.toContain("Row 1001:");
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
