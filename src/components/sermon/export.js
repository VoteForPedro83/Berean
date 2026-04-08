/* ============================================================
   export.js — Sermon export to PDF, Markdown, and Plain Text

   Provides functions to export the sermon content in multiple
   formats. Uses window.print() for PDF, manual markdown generation
   for .md files, and plain text extraction for .txt files.
   ============================================================ */

// ── Plain Text Export ───────────────────────────────────────
export async function exportSermonText(editor, title) {
  try {
    const text = editor.getText();
    const blob = new Blob([`${title}\n\n${text}`], { type: 'text/plain;charset=utf-8' });
    _downloadFile(blob, `${_sanitizeFilename(title)}.txt`, 'text/plain');
  } catch (err) {
    console.error('[sermon export] Text failed:', err);
    throw new Error('Text export failed: ' + err.message);
  }
}

// ── PDF Export ──────────────────────────────────────────────
export function exportSermonPdf(editor, title) {
  try {
    // Get current content for restoration
    const originalTitle = document.getElementById('se-title')?.value || title;

    // Temporarily set document title for print
    const oldTitle = document.title;
    document.title = originalTitle;

    // Print dialog
    window.print();

    // Restore title after a brief delay
    setTimeout(() => {
      document.title = oldTitle;
    }, 500);
  } catch (err) {
    console.error('[sermon export] PDF failed:', err);
    throw new Error('PDF export failed: ' + err.message);
  }
}

// ── Markdown Export ──────────────────────────────────────────
export async function exportSermonMarkdown(editor, title) {
  try {
    const json = editor.getJSON();
    let md = `# ${title}\n\n`;

    if (json.content) {
      md += _jsonToMarkdown(json.content);
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    _downloadFile(blob, `${_sanitizeFilename(title)}.md`, 'text/markdown');
  } catch (err) {
    console.error('[sermon export] Markdown failed:', err);
    throw new Error('Markdown export failed: ' + err.message);
  }
}

// ── JSON to Markdown converter ───────────────────────────────
function _jsonToMarkdown(nodes, depth = 0) {
  if (!Array.isArray(nodes)) return '';

  return nodes.map(node => {
    if (!node.type) return '';

    let content = '';
    if (node.content) {
      content = _jsonToMarkdown(node.content, depth + 1);
    }

    const text = node.text || '';
    const attrs = node.attrs || {};

    switch (node.type) {
      case 'paragraph':
        return `${content || text}\n\n`;

      case 'heading':
        const level = Math.min(attrs.level || 2, 6);
        return `${'#'.repeat(level)} ${content || text}\n\n`;

      case 'bulletList':
        return content;
      case 'orderedList':
        return content;

      case 'listItem':
        // Format based on parent context — simplified approach
        return `- ${content || text}\n`;

      case 'text':
        let result = text;
        if (node.marks) {
          for (const mark of node.marks) {
            if (mark.type === 'bold') result = `**${result}**`;
            if (mark.type === 'italic') result = `*${result}*`;
            if (mark.type === 'strike') result = `~~${result}~~`;
          }
        }
        return result;

      case 'scriptureBlock':
        return `> **Scripture:** ${content || '[Scripture Block]'}\n\n`;

      case 'pointHeading':
        const isMain = attrs.level === 'main';
        return `${isMain ? '##' : '###'} ${content || 'Point'}\n\n`;

      case 'applicationBlock':
        return `> **Application:** ${content || '[Application Block]'}\n\n`;

      case 'illustrationBlock':
        return `> **Illustration:** ${content || '[Illustration Block]'}\n\n`;

      case 'citationNote':
        return `[^${attrs.id || '1'}] ${content || text}\n`;

      case 'clippingBlock':
        return `> **Clipping:** ${content || '[Clipping Block]'}\n\n`;

      case 'hardBreak':
        return '\n';

      default:
        return content || text || '';
    }
  }).join('');
}

// ── Offline HTML Export ──────────────────────────────────────
/**
 * Export the sermon as a self-contained HTML file.
 * All styles are inlined — no external dependencies, <500KB.
 * Works in any browser without Berean installed.
 */
export async function exportSermonHtml(editor, title) {
  try {
    const bodyHtml = document.querySelector('.se-editor')?.innerHTML || editor.getHTML();
    const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${_esc(title)}</title>
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; }
    html { font-size: 16px; }
    body {
      margin: 0; padding: 2rem 1rem 4rem;
      font-family: 'Georgia', 'Times New Roman', serif;
      background: #FAF9F6; color: #1A1A1A;
      line-height: 1.7;
    }
    /* ── Page layout ── */
    .sermon {
      max-width: 42rem; margin: 0 auto;
    }
    /* ── Header ── */
    .sermon__header {
      border-bottom: 2px solid #D4AF37;
      padding-bottom: 1.5rem; margin-bottom: 2rem;
    }
    .sermon__title {
      font-size: 2rem; font-weight: 700; color: #0A0A0A;
      margin: 0 0 .375rem; line-height: 1.2;
    }
    .sermon__meta {
      font-size: .875rem; color: #6B675F;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    /* ── Body content (mirrors TipTap output) ── */
    p { margin: 0 0 1em; }
    h2 { font-size: 1.375rem; margin: 1.75em 0 .5em; color: #0A0A0A; }
    h3 { font-size: 1.125rem; margin: 1.5em 0 .375em; color: #1A1A1A; }
    ul, ol { padding-left: 1.5rem; margin: 0 0 1em; }
    li { margin-bottom: .25em; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    s  { text-decoration: line-through; }
    blockquote {
      border-left: 3px solid #D4AF37; margin: 1.5em 0;
      padding: .75em 1.25em; background: #F4F2EC; border-radius: 0 .375rem .375rem 0;
    }
    /* ── Custom sermon blocks ── */
    .scripture-block {
      border-left: 3px solid #D4AF37;
      background: #F4F2EC; border-radius: 0 .375rem .375rem 0;
      padding: .875rem 1.25rem; margin: 1.5em 0;
      font-style: italic; color: #2A2A2A;
    }
    .scripture-block::before {
      display: block; font-size: .6875rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: .08em;
      color: #8B6914; margin-bottom: .375rem;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-style: normal;
      content: 'Scripture';
    }
    .point-heading-main {
      font-size: 1.25rem; font-weight: 700; color: #8B6914;
      border-bottom: 1px solid #D5D1C8; padding-bottom: .375rem;
      margin: 2em 0 .75em;
    }
    .point-heading-sub {
      font-size: 1.0625rem; font-weight: 600; color: #1A1A1A;
      margin: 1.5em 0 .5em;
    }
    .application-block {
      border-left: 3px solid #768A78; background: #EEF2EE;
      border-radius: 0 .375rem .375rem 0;
      padding: .875rem 1.25rem; margin: 1.5em 0;
    }
    .application-block::before {
      display: block; font-size: .6875rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: .08em;
      color: #4A6B4C; margin-bottom: .375rem;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      content: 'Application';
    }
    .illustration-block {
      border-left: 3px solid #8C1127; background: #F8F0F2;
      border-radius: 0 .375rem .375rem 0;
      padding: .875rem 1.25rem; margin: 1.5em 0;
    }
    .illustration-block::before {
      display: block; font-size: .6875rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: .08em;
      color: #8C1127; margin-bottom: .375rem;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      content: 'Illustration';
    }
    .clipping-block {
      border-left: 3px solid #D4AF37; background: #F9F6EE;
      border-radius: 0 .375rem .375rem 0;
      padding: .875rem 1.25rem; margin: 1.5em 0;
    }
    /* ── Footer ── */
    .sermon__footer {
      margin-top: 3rem; padding-top: 1.25rem;
      border-top: 1px solid #D5D1C8;
      font-size: .8125rem; color: #6B675F;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    .sermon__footer a { color: #8B6914; }
    /* ── Print ── */
    @media print {
      body { background: white; padding: 0; }
      .sermon__footer a { color: #1A1A1A; }
    }
  </style>
</head>
<body>
  <article class="sermon">
    <header class="sermon__header">
      <h1 class="sermon__title">${_esc(title)}</h1>
      <p class="sermon__meta">Exported ${_esc(date)}</p>
    </header>
    <div class="sermon__body">
      ${_transformEditorHtml(bodyHtml)}
    </div>
    <footer class="sermon__footer">
      Created with <a href="https://berean.app">Berean</a> — free Bible study tools for pastors
    </footer>
  </article>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    _downloadFile(blob, `${_sanitizeFilename(title)}.html`, 'text/html');
  } catch (err) {
    console.error('[sermon export] HTML failed:', err);
    throw new Error('HTML export failed: ' + err.message);
  }
}

/**
 * Convert TipTap editor HTML to clean semantic HTML for export.
 * Maps TipTap's data-type attributes to meaningful CSS classes.
 */
function _transformEditorHtml(html) {
  // Use DOMParser to safely transform the HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.querySelector('div');

  // Map TipTap node wrappers to export classes
  root.querySelectorAll('[data-type="scriptureBlock"]').forEach(el => {
    el.className = 'scripture-block';
    el.removeAttribute('data-type');
  });
  root.querySelectorAll('[data-type="applicationBlock"]').forEach(el => {
    el.className = 'application-block';
    el.removeAttribute('data-type');
  });
  root.querySelectorAll('[data-type="illustrationBlock"]').forEach(el => {
    el.className = 'illustration-block';
    el.removeAttribute('data-type');
  });
  root.querySelectorAll('[data-type="clippingBlock"]').forEach(el => {
    el.className = 'clipping-block';
    el.removeAttribute('data-type');
  });
  root.querySelectorAll('[data-type="pointHeading"]').forEach(el => {
    const isMain = el.dataset.level === 'main';
    el.className = isMain ? 'point-heading-main' : 'point-heading-sub';
    el.removeAttribute('data-type');
    el.removeAttribute('data-level');
  });

  // Strip editor-specific attributes and classes
  root.querySelectorAll('[class^="se-"], [data-node-view-wrapper]').forEach(el => {
    el.removeAttribute('class');
    el.removeAttribute('data-node-view-wrapper');
  });
  root.querySelectorAll('[contenteditable]').forEach(el => {
    el.removeAttribute('contenteditable');
  });

  return root.innerHTML;
}

// ── Helpers ──────────────────────────────────────────────────

function _downloadFile(blob, filename, mimeType) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.type = mimeType;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _sanitizeFilename(name) {
  return (name || 'sermon')
    .replace(/[\/\?\*\:\"\<\>\|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 200);
}

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
