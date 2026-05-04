/**
 * Tiny safe-by-construction Markdown renderer used for `DealUpdate.body`.
 *
 * Supports: headings (#..###), bold (**), italic (*), inline code (`),
 * autolinks ([text](url) http(s) only), unordered lists (- or *), ordered
 * lists (1.), blank-line paragraphs, and hard line breaks within a paragraph.
 *
 * Output is plain HTML strings produced from escaped input — no third-party
 * sanitiser dependency required.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(s: string): string {
  let out = escapeHtml(s);

  // Inline code first (so other patterns don't touch its contents)
  out = out.replace(/`([^`\n]+?)`/g, (_m, code) => `<code>${code}</code>`);

  // Links [label](http(s)://…) — http/https only
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, label: string, href: string) =>
      `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
  );

  // Bold **text**
  out = out.replace(/\*\*([^\n*][^\n]*?)\*\*/g, "<strong>$1</strong>");
  // Italic *text* (after bold so we don't eat **)
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");

  return out;
}

export function renderMarkdown(src: string): string {
  if (!src) return "";
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // blank → close paragraph
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // headings
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // paragraph: greedily collect non-blank, non-block lines
    const para: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${para.map(renderInline).join("<br/>")}</p>`);
  }

  return out.join("\n");
}
