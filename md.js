/* md.js: the blog's Markdown to HTML converter. Zero dependencies, on purpose.

   It deliberately supports a small language: exactly the modules the blog design
   system defines in css/post.css, and nothing else. Anything it does not
   recognise comes out as an ordinary paragraph, so a post can never render as
   half-parsed markup.

   Block syntax
     ## / ###            h2 / h3
     paragraph           blank-line separated
     - or *              bullet list          1.  numbered list
     ```                 code block           ```prompt  copy-paste prompt block
     ```tree             file tree            ```lang    any label renders plain
     | a | b |           table (--- separator; ---: right-aligns and uses mono)
     > quote             pull quote
     > [!note]           blue callout         > [!warn]   amber callout
     > [!series]         series banner        > [!foot]   method / sources footer
     ![alt](/img/x.webp "caption")   image on its own line, caption optional.
                         Site Studio names uploads name-1200x800.webp; those
                         numbers become the img width and height attributes.
     ---                 horizontal rule is ignored (the design system has no hr)

   Inline: **bold**, *italic*, `code`, [text](href).

   Everything is escaped first, so authored text can never inject markup.
   Exported as mdToHtml(src). Run `node md.js --selftest` to check it. */
'use strict';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const NUL = '\u0000';   // cannot occur in authored text

function inline(src) {
  const code = [];
  // Code spans are literal: pull them out before any other inline rule runs.
  let s = String(src).replace(/`([^`]+)`/g, (_, c) => {
    code.push('<code>' + esc(c) + '</code>');
    return NUL + (code.length - 1) + NUL;
  });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) =>
    /^(https?:|\/|#|mailto:)/.test(h) ? '<a href="' + h + '">' + t + '</a>' : t);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return s.replace(new RegExp(NUL + '(\\d+)' + NUL, 'g'), (_, i) => code[+i]);
}

const CALLOUT = { note: 'note', warn: 'warn', series: 'series', foot: 'foot' };

function mdToHtml(src) {
  const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isTableSep = l => /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes('-');
  const cells = l => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // fenced code
    const fence = line.match(/^```\s*([A-Za-z0-9_-]*)\s*$/);
    if (fence) {
      const kind = (fence[1] || '').toLowerCase();
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;                                    // closing fence
      const text = esc(buf.join('\n'));
      if (kind === 'prompt') out.push('<pre class="prompt">' + text + '</pre>');
      else if (kind === 'tree') out.push('<pre class="tree"><code>' + text + '</code></pre>');
      else out.push('<pre><code>' + text + '</code></pre>');
      continue;
    }

    // image, alone on its line. Site paths or https only, like links.
    const im = line.match(/^!\[([^\]]*)\]\(([^)\s"<>]+)(?:\s+"([^"]*)")?\)\s*$/);
    if (im && /^(https:\/\/|\/)/.test(im[2])) {
      const dims = im[2].match(/-(\d{2,5})x(\d{2,5})\.[a-z]+$/i);
      out.push('<figure><img src="' + esc(im[2]) + '" alt="' + esc(im[1]).replace(/"/g, '&quot;') + '"' +
        (dims ? ' width="' + dims[1] + '" height="' + dims[2] + '"' : '') + ' loading="lazy">' +
        (im[3] ? '<figcaption>' + inline(im[3]) + '</figcaption>' : '') + '</figure>');
      i++; continue;
    }

    // headings
    const h =line.match(/^(#{2,3})\s+(.*)$/);
    if (h) { const n = h[1].length; out.push('<h' + n + '>' + inline(h[2].trim()) + '</h' + n + '>'); i++; continue; }

    // the design system has no rule element; a lone --- is a nudge, not markup
    if (/^-{3,}\s*$/.test(line)) { i++; continue; }

    // table
    if (line.trim().startsWith('|') && isTableSep(lines[i + 1] || '')) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map(c => /-:$/.test(c) ? 'r' : 'l');
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      out.push('<table><thead><tr>' +
        head.map((c, n) => '<th' + (align[n] === 'r' ? ' style="text-align:right"' : '') + '>' + inline(c) + '</th>').join('') +
        '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map((c, n) =>
          '<td' + (align[n] === 'r' ? ' class="n"' : '') + '>' + inline(c) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table>');
      continue;
    }

    // blockquote, which is either a callout or a pull quote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      let kind = null;
      const tag = (buf[0] || '').match(/^\[!([a-z]+)\]\s*(.*)$/i);
      if (tag && CALLOUT[tag[1].toLowerCase()]) {
        kind = CALLOUT[tag[1].toLowerCase()];
        buf[0] = tag[2];
        if (!buf[0].trim()) buf.shift();
      }
      const text = buf.join('\n').trim();
      const paras = text.split(/\n{2,}/).map(p => inline(p.replace(/\n/g, ' ')));
      if (kind) out.push('<div class="' + kind + '">' + paras.map(p => '<p>' + p + '</p>').join('') + '</div>');
      else out.push('<div class="pull">' + paras.join(' ') + '</div>');
      continue;
    }

    // lists
    const bullet = /^[-*]\s+/, numbered = /^\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = !bullet.test(line);
      const re = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        let text = lines[i++].replace(re, '');
        // continuation lines belong to the item they follow
        while (i < lines.length && lines[i].trim() && !re.test(lines[i]) &&
               !/^(#{2,3}\s|```|>|\||[-*]\s|\d+[.)]\s)/.test(lines[i])) text += ' ' + lines[i++].trim();
        items.push('<li>' + inline(text.trim()) + '</li>');
      }
      const t = ordered ? 'ol' : 'ul';
      out.push('<' + t + '>' + items.join('') + '</' + t + '>');
      continue;
    }

    // paragraph
    const buf = [];
    while (i < lines.length && lines[i].trim() &&
           !/^(#{2,3}\s|```|>|[-*]\s|\d+[.)]\s|-{3,}\s*$)/.test(lines[i]) &&
           // an image line ends a paragraph, but a rejected one is still read as text
           !(buf.length && /^!\[[^\]]*\]\([^)]*\)\s*$/.test(lines[i])) &&
           !(lines[i].trim().startsWith('|') && isTableSep(lines[i + 1] || ''))) buf.push(lines[i++].trim());
    out.push('<p>' + inline(buf.join(' ')) + '</p>');
  }
  return out.join('\n');
}

module.exports = { mdToHtml };

/* ---- self test ------------------------------------------------------- */
if (require.main === module && process.argv.includes('--selftest')) {
  const cases = [
    ['## Head', '<h2>Head</h2>'],
    ['### Sub', '<h3>Sub</h3>'],
    ['plain text', '<p>plain text</p>'],
    ['wrapped\nover lines', '<p>wrapped over lines</p>'],
    ['**b** and *i* and `c`', '<p><b>b</b> and <em>i</em> and <code>c</code></p>'],
    ['[t](/a)', '<p><a href="/a">t</a></p>'],
    ['[t](javascript:x)', '<p>t</p>'],
    ['<script>bad</script>', '<p>&lt;script&gt;bad&lt;/script&gt;</p>'],
    ['`a<b>c`', '<p><code>a&lt;b&gt;c</code></p>'],
    // a bare number in prose must never be read as a code-span placeholder
    ['I ran 3 tests and 0 failed', '<p>I ran 3 tests and 0 failed</p>'],
    ['`a` and 0 and `b`', '<p><code>a</code> and 0 and <code>b</code></p>'],
    ['- one\n- two', '<ul><li>one</li><li>two</li></ul>'],
    ['1. one\n2. two', '<ol><li>one</li><li>two</li></ol>'],
    ['> quoted', '<div class="pull">quoted</div>'],
    ['> [!note]\n> careful', '<div class="note"><p>careful</p></div>'],
    ['> [!warn] watch out', '<div class="warn"><p>watch out</p></div>'],
    ['> [!foot]\n> Method: measured.', '<div class="foot"><p>Method: measured.</p></div>'],
    ['```\nls -la\n```', '<pre><code>ls -la</code></pre>'],
    ['```prompt\nDo the thing\n```', '<pre class="prompt">Do the thing</pre>'],
    ['```tree\nsrc/\n```', '<pre class="tree"><code>src/</code></pre>'],
    ['| a | b |\n|---|---:|\n| 1 | 2 |',
     '<table><thead><tr><th>a</th><th style="text-align:right">b</th></tr></thead>' +
     '<tbody><tr><td>1</td><td class="n">2</td></tr></tbody></table>'],
    ['![A chart](/img/uploads/chart-1200x800.webp)',
     '<figure><img src="/img/uploads/chart-1200x800.webp" alt="A chart" width="1200" height="800" loading="lazy"></figure>'],
    ['![x](/img/a.png "Fig 1: **cost**")',
     '<figure><img src="/img/a.png" alt="x" loading="lazy"><figcaption>Fig 1: <b>cost</b></figcaption></figure>'],
    ['![x](javascript:alert)', '<p>!x</p>'],
    ['Text\n![a](/img/b-10x20.png)', '<p>Text</p>\n<figure><img src="/img/b-10x20.png" alt="a" width="10" height="20" loading="lazy"></figure>'],
    ['---', ''],
    ['', ''],
  ];
  let bad = 0;
  for (const [src, want] of cases) {
    const got = mdToHtml(src);
    if (got !== want) { bad++; console.log('FAIL  in: ' + JSON.stringify(src) + '\n  want: ' + want + '\n  got:  ' + got); }
  }
  console.log(bad ? bad + ' md selftest failure(s)' : 'md selftest: all ' + cases.length + ' cases pass');
  process.exit(bad ? 1 : 0);
}
