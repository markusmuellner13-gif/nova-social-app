// HTML entity decoding for text pulled out of pages and feeds.
//
// Lived in webCrawler.ts until the extraction engine needed it too — importing
// it from there would have made webCrawler ↔ extractor a cycle. Same code, same
// behaviour; webCrawler re-exports it so existing callers are unaffected.

// Publishers routinely HTML-escape the text inside their JSON-LD, so titles
// arrive as "Hans Zimmer, John Williams &amp; mehr" and get shown to the user
// with the entity intact. There is no DOM on the server to decode with, and the
// set of entities that actually appears in event titles is small.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', eacute: 'é', egrave: 'è', auml: 'ä', ouml: 'ö',
  uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', deg: '°', euro: '€',
};

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  // Two passes: some feeds double-escape ("&amp;#39;"), and one pass would leave
  // a bare "&#39;" behind.
  let out = s;
  for (let pass = 0; pass < 2 && out.includes('&'); pass++) {
    out = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
      if (body[0] === '#') {
        const code = body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
      return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? m;
    });
  }
  return out;
}
