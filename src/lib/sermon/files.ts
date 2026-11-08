export const DOCX_MAX = 5 * 1024 * 1024;
export const COVER_SOURCE_MAX = 15 * 1024 * 1024;
export const COVER_MAX_EDGE = 1920;
export const COVER_MAX_BYTES = 2 * 1024 * 1024;

/** Strip anything that isn't plain document structure. No external fetches, no scripts. */
export function sanitizeImportedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc
    .querySelectorAll(
      "script,style,iframe,object,embed,img,svg,video,audio,link,meta,form,input,button",
    )
    .forEach((n) => n.remove());
  doc.querySelectorAll("a").forEach((a) => a.replaceWith(...Array.from(a.childNodes)));
  const allowed = new Set([
    "P",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "STRONG",
    "B",
    "EM",
    "I",
    "U",
    "S",
    "STRIKE",
    "DEL",
    "UL",
    "OL",
    "LI",
    "BLOCKQUOTE",
    "BR",
    "SPAN",
    "BODY",
    "TABLE",
    "TBODY",
    "TR",
    "TD",
    "TH",
    "THEAD",
  ]);
  doc.body.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
    if (!allowed.has(el.tagName)) el.replaceWith(...Array.from(el.childNodes));
  });
  // Headings beyond level 3 become level 3.
  doc.body.querySelectorAll("h4,h5,h6").forEach((h) => {
    const h3 = doc.createElement("h3");
    h3.append(...Array.from(h.childNodes));
    h.replaceWith(h3);
  });
  return doc.body.innerHTML;
}

export async function docxToHtml(file: File): Promise<string> {
  if (!/\.docx$/i.test(file.name)) throw new Error("Choose a Word .docx file.");
  if (file.size > DOCX_MAX) throw new Error("That file is larger than 5 MB.");
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      // Mammoth drops underline by default; underlined words are the answers.
      styleMap: ["u => u", "strike => s"],
      convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
    },
  );
  return sanitizeImportedHtml(result.value);
}

/** Mirrors production: longest edge ≤ 1920, JPEG ≤ 2 MB. */
export async function resizeCover(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Use a JPG, PNG or WebP image.");
  }
  if (file.size > COVER_SOURCE_MAX) throw new Error("That image is larger than 15 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, COVER_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can’t process images.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.86, 0.78, 0.68, 0.58]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= COVER_MAX_BYTES) return blob;
  }
  throw new Error("Couldn’t shrink that image under 2 MB. Try a smaller one.");
}
