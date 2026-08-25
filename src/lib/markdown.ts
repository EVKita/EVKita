function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(text: string): string {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return t;
}

export function markdownToHtml(md: string): string {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  let out = "";
  let inCode = false;
  let codeBuf: string[] = [];
  let listBuf: string[] = [];
  let inList = false;

  const flushList = () => {
    if (inList) {
      out += "<ul>" + listBuf.map((li) => `<li>${li}</li>`).join("") + "</ul>";
      listBuf = [];
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim().startsWith("```")) {
      if (inCode) {
        out += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
        codeBuf = [];
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    const h = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList();
      const level = h[1].length;
      out += `<h${level}>${inline(h[2])}</h${level}>`;
      continue;
    }

    const li = trimmed.match(/^[-*+]\s+(.*)$/);
    if (li) {
      inList = true;
      listBuf.push(inline(li[1]));
      continue;
    }

    flushList();
    out += `<p>${inline(trimmed)}</p>`;
  }

  flushList();
  if (inCode) {
    out += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
  }

  return out;
}
