/** Server-rendered mail: model output is text, never trusted HTML. */
export type EmailIdentity = {
  businessName?: string | null;
  botName?: string | null;
  signature?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  mailboxEmail?: string | null;
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

function webUrl(value?: string | null): string | null {
  if (!value || /[\s<>"']/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Linkify only explicit web URLs, preserving text and escaping every fragment. */
export function emailTextHtml(value: string): string {
  const expression = /https?:\/\/[^\s<>"']+/gi;
  let rendered = "";
  let offset = 0;
  for (const match of value.matchAll(expression)) {
    const start = match.index!;
    let url = match[0].replace(/[.,;:!?]+$/, "");
    // Keep balanced parentheses inside paths, but not surrounding prose punctuation.
    while (url.endsWith(")") && (url.match(/\)/g)?.length ?? 0) > (url.match(/\(/g)?.length ?? 0)) {
      url = url.slice(0, -1);
    }
    rendered += escapeHtml(value.slice(offset, start));
    rendered += webUrl(url)
      ? `<a href="${escapeHtml(url)}" style="color:#5b37a8;text-decoration:underline;overflow-wrap:anywhere">${escapeHtml(url)}</a>`
      : escapeHtml(url);
    offset = start + url.length;
  }
  return (rendered + escapeHtml(value.slice(offset))).replace(/\r?\n/g, "<br />");
}

export function renderBusinessEmail(input: {
  body: string;
  subject: string;
  identity: EmailIdentity;
}): { textBody: string; htmlBody: string } {
  const identity = input.identity;
  const businessName = identity.businessName?.trim();
  const botName = identity.botName?.trim();
  const website = webUrl(identity.website?.trim());
  const logo = webUrl(identity.logoUrl?.trim());
  const signature = identity.signature?.trim() || botName || businessName || "";
  const lines = [signature];
  if (businessName && !signature.toLowerCase().includes(businessName.toLowerCase())) {
    lines.push(businessName);
  }
  const mailbox = identity.mailboxEmail?.trim();
  if (mailbox && !signature.toLowerCase().includes(mailbox.toLowerCase())) lines.push(mailbox);
  if (website && !signature.includes(website)) lines.push(website);
  const signatureText = lines.filter(Boolean).join("\n");
  const body = input.body.trim();
  const alreadySigned = Boolean(signatureText && body.endsWith(signatureText));
  const title = businessName || botName;
  const textBody = signatureText && !alreadySigned ? `${body}\n\n${signatureText}` : body;
  const htmlBody = `<!doctype html>
<html lang="und" dir="auto"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;background:#f5f4f8;color:#22212b;font-family:Arial,Helvetica,sans-serif">
<div lang="und" dir="auto" style="padding:24px 12px">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e7e5ed;border-radius:12px;padding:28px;line-height:1.65;font-size:16px;overflow-wrap:anywhere">
${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(title || "")}" width="144" style="display:block;max-width:144px;max-height:72px;object-fit:contain;margin:0 0 16px" />` : ""}
${title ? `<div style="font-size:20px;font-weight:700;color:#252231;padding-bottom:20px;margin-bottom:24px;border-bottom:1px solid #e7e5ed">${escapeHtml(title)}</div>` : ""}
<div>${emailTextHtml(body)}</div>
${signatureText && !alreadySigned ? `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e7e5ed;font-size:14px;color:#504a5e">${emailTextHtml(signatureText)}</div>` : ""}
</div></div></body></html>`;
  return { textBody, htmlBody };
}
