import {
  KNOWLEDGE_ASSET_MAX_BYTES,
  knowledgeAssetTooLargeMessage,
  knowledgeDocumentMimeType,
} from "./knowledge-asset-limits";

/**
 * Shared document reading for Knowledge ingestion: the Knowledge page and
 * the Studio composer upload through the same reader so file rules,
 * limits, and error text can never drift between surfaces.
 */

export type AssetBody = {
  fileName: string;
  mimeType: string;
  text?: string;
  dataUrl?: string;
  fileBase64?: string;
};

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

export async function readAsset(file: File, imageUploadsAvailable: boolean): Promise<AssetBody> {
  // Checked before the file is read, because nothing downstream reports this
  // honestly: the API body limit answers a bare "request entity too large", and
  // the drop zone used to advertise a ceiling more than ten times what the
  // request could actually carry.
  if (file.size > KNOWLEDGE_ASSET_MAX_BYTES) {
    throw new Error(knowledgeAssetTooLargeMessage(file.name, file.size));
  }
  const mimeType = (file.type || "text/plain").toLowerCase();
  if (
    !imageUploadsAvailable &&
    (mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name))
  ) {
    throw new Error(
      "Image uploads are unavailable. Upload TXT, MD, CSV, PDF, DOCX, or XLSX files.",
    );
  }
  if (/^image\/(png|jpe?g|webp|gif)$/.test(mimeType)) {
    return { fileName: file.name, mimeType, dataUrl: await readAsDataUrl(file) };
  }
  const documentMimeType = knowledgeDocumentMimeType(file.name, file.type);
  if (documentMimeType) {
    const dataUrl = await readAsDataUrl(file);
    const comma = dataUrl.indexOf(",");
    if (comma < 0 || !dataUrl.slice(0, comma).startsWith("data:")) {
      throw new Error(`${file.name} could not be read as a supported document.`);
    }
    return {
      fileName: file.name,
      mimeType: documentMimeType,
      fileBase64: dataUrl.slice(comma + 1),
    };
  }
  const name = file.name.toLowerCase();
  const supportedTypes = imageUploadsAvailable
    ? "TXT, MD, CSV, PDF, Word (DOCX), Excel (XLSX), PNG, JPG, WEBP or GIF"
    : "TXT, MD, CSV, PDF, Word (DOCX) or Excel (XLSX)";
  if (/\.(doc|xls)$/i.test(name)) {
    throw new Error(`${file.name} must be saved as DOCX or XLSX before uploading.`);
  }
  if (
    name.endsWith(".pdf") ||
    name.endsWith(".docx") ||
    name.endsWith(".xlsx") ||
    mimeType.includes("pdf") ||
    mimeType.includes("msword") ||
    mimeType.includes("wordprocessingml") ||
    mimeType.includes("vnd.ms-excel") ||
    mimeType.includes("spreadsheetml")
  ) {
    throw new Error(`${file.name} has a document type that does not match its extension.`);
  }
  if (
    !mimeType.startsWith("text/") &&
    !name.endsWith(".txt") &&
    !name.endsWith(".md") &&
    !name.endsWith(".csv") &&
    !name.endsWith(".markdown")
  ) {
    throw new Error(`${file.name} is not supported. Upload ${supportedTypes}.`);
  }
  return { fileName: file.name, mimeType: mimeType || "text/plain", text: await file.text() };
}
