import { describe, it, expect, beforeEach } from 'vitest';
import { harvestPayloads, balancedSpan } from './harvest';
import { readSchemaOrg, readMicrodata, readMetaTags, readBuiltIns } from './dialects';
import { inferFields, applyFields, flattenRow } from './infer';
import { learnSkill, applySkill } from './learn';
import { readPage } from './engine';
import { resetSkillMemory, loadSkills } from './skillStore';
import { isUsableRecord, recordRichness } from './validate';

const page = (body: string) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

describe('harvest', () => {
  it('pulls ld+json, __NEXT_DATA__ and inline state out of one page', () => {
    const html = page(`
      <script type="application/ld+json">{"@type":"Museum","name":"A"}</script>
      <script id="__NEXT_DATA__" type="application/json">{"props":{"x":1}}</script>
      <script>window.__NUXT__ = {"data":[{"n":"y"}]};</script>
    `);
    const sources = harvestPayloads(html).map(p => p.source).sort();
    expect(sources).toEqual(['inline-state', 'ld+json', 'next-data']);
  });

  it('reads a balanced span past braces inside strings', () => {
    const src = 'x = {"a":"} not the end {","b":2};';
    expect(balancedSpan(src, src.indexOf('{'))).toBe('{"a":"} not the end {","b":2}');
  });

  it('salvages concatenated JSON-LD objects that are invalid as a whole', () => {
    const html = page(`<script type="application/ld+json">{"@type":"Museum","name":"A"},{"@type":"Museum","name":"B"}</script>`);
    expect(harvestPayloads(html).length).toBeGreaterThanOrEqual(2);
  });

  it('ignores a payload that is not JSON', () => {
    expect(harvestPayloads(page('<script type="application/json">not json</script>'))).toEqual([]);
  });
});

describe('built-in dialects', () => {
  it('reads a schema.org attraction with offers and geo', () => {
    const html = page(`<script type="application/ld+json">${JSON.stringify({
      '@type': 'Museum',
      name: 'Kunsthistorisches Museum',
      description: 'One of the great art museums of the world, with a Bruegel room.',
      url: 'https://example.org/khm',
      image: 'https://example.org/khm.jpg',
      address: { streetAddress: 'Maria-Theresien-Platz', addressLocality: 'Vienna', addressCountry: 'AT' },
      geo: { latitude: 48.2038, longitude: 16.3616 },
      offers: { '@type': 'Offer', price: '21', priceCurrency: 'EUR', url: 'https://shop.example.org/tickets' },
    })}</script>`);
    const [rec] = readSchemaOrg(harvestPayloads(html), 'https://example.org/');
    expect(rec.kind).toBe('attraction');
    expect(rec.name).toBe('Kunsthistorisches Museum');
    expect(rec.lat).toBeCloseTo(48.2038);
    expect(rec.price).toBe('EUR 21');
    expect(rec.ticketUrl).toBe('https://shop.example.org/tickets');
  });

  it('treats a dated schema.org node as an event whatever its @type says', () => {
    const html = page(`<script type="application/ld+json">${JSON.stringify({
      '@type': 'TouristAttraction', name: 'Night at the Museum',
      startDate: '2026-09-01T19:00', url: 'https://example.org/night',
    })}</script>`);
    expect(readSchemaOrg(harvestPayloads(html))[0].kind).toBe('event');
  });

  it('walks @graph and ItemList nesting', () => {
    const html = page(`<script type="application/ld+json">${JSON.stringify({
      '@graph': [{
        '@type': 'ItemList',
        itemListElement: [
          { item: { '@type': 'Museum', name: 'Museum One', url: 'https://e.org/1' } },
          { item: { '@type': 'Museum', name: 'Museum Two', url: 'https://e.org/2' } },
        ],
      }],
    })}</script>`);
    expect(readSchemaOrg(harvestPayloads(html))).toHaveLength(2);
  });

  it('reads microdata', () => {
    const html = page(`
      <div itemscope itemtype="https://schema.org/Museum">
        <h1 itemprop="name">Stadtmuseum</h1>
        <meta itemprop="description" content="A local history museum covering nine centuries of the town.">
        <a itemprop="url" href="https://example.org/stadtmuseum">more</a>
      </div>`);
    const [rec] = readMicrodata(html, 'https://example.org/');
    expect(rec.name).toBe('Stadtmuseum');
    expect(rec.url).toBe('https://example.org/stadtmuseum');
  });

  it('falls back to og: tags only when nothing structured exists', () => {
    const html = page(`
      <meta property="og:title" content="Schönbrunn Palace">
      <meta property="og:description" content="The former imperial summer residence, with its gardens and the Gloriette.">
      <meta property="og:image" content="https://example.org/s.jpg">`);
    expect(readMetaTags(html, 'https://example.org/s')[0].name).toBe('Schönbrunn Palace');
    // …and NOT when JSON-LD already answered.
    const withLd = html + `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Museum', name: 'Real One', url: 'https://example.org/real',
      description: 'A description long enough to count as real prose about the place.',
    })}</script>`;
    const built = readBuiltIns(withLd, harvestPayloads(withLd), 'https://example.org/');
    expect(built.bySkill.meta).toBeUndefined();
  });

  it('decodes HTML entities in names', () => {
    const html = page(`<script type="application/ld+json">${JSON.stringify({
      '@type': 'Museum', name: 'Haus der Musik &amp; mehr', url: 'https://example.org/x',
    })}</script>`);
    expect(readSchemaOrg(harvestPayloads(html))[0].name).toBe('Haus der Musik & mehr');
  });
});

describe('field inference', () => {
  it('flattens one level so nested location names are visible', () => {
    expect(flattenRow({ a: 1, loc: { name: 'X' }, imgs: ['u'] })).toEqual({ a: 1, 'loc.name': 'X', imgs: 'u' });
  });

  it('infers fields from VALUE SHAPE when the keys are in an unknown language', () => {
    // Spanish keys the hint table does list, plus two it does not.
    const rows = Array.from({ length: 8 }, (_, i) => ({
      titulo: `Visita guiada número ${i + 1}`,
      arranque: `2026-09-0${(i % 8) + 1}T10:00:00`,
      enlace: `https://ejemplo.es/visita/${i}`,
      coste: `${10 + i} EUR`,
      x1: 40.4168, x2: -3.7038,
    }));
    const fields = inferFields(rows);
    expect(fields.titulo).toBe('name');
    expect(fields.arranque).toBe('startDate');
    expect(fields.enlace).toBe('url');
    expect(fields.coste).toBe('price');
    // Coordinates found purely by numeric range, from keys that mean nothing.
    expect(fields.x1).toBe('lat');
    expect(fields.x2).toBe('lng');
  });

  it('infers fields from opaque keys with no words at all', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      f_0: `Guided rooftop walk ${i + 1}`,
      f_1: `2026-10-1${i}T18:30:00`,
      f_2: `https://opaque.example/${i}`,
    }));
    const fields = inferFields(rows);
    expect(fields.f_0).toBe('name');
    expect(fields.f_1).toBe('startDate');
    expect(fields.f_2).toBe('url');
  });

  it('does not promote a key on its name alone when the values are wrong', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      title: '5f8a9c2e-0000-4a1b-9d3e-1122334455aa',
      realName: `Colosseum underground tour ${i + 1}`,
      link: `https://e.org/${i}`,
    }));
    const fields = inferFields(rows);
    // The UUID column is a slug-shaped id, so `title` must not win `name`.
    expect(fields.title).not.toBe('name');
    expect(fields.realName).toBe('name');
  });

  it('drops a lone latitude when there is no longitude to pair with', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      name: `Place ${i + 1}`, url: `https://e.org/${i}`, someNumber: 41.9,
    }));
    expect(Object.values(inferFields(rows))).not.toContain('lat');
  });

  it('applies an inferred map to a row', () => {
    const fields = { titulo: 'name' as const, enlace: 'url' as const };
    expect(applyFields({ titulo: 'Museo', enlace: 'https://e.es' }, fields))
      .toEqual({ name: 'Museo', url: 'https://e.es' });
  });
});

describe('learning a new format', () => {
  const nuxtPage = (rows: unknown[]) => page(
    `<script>window.__NUXT__ = ${JSON.stringify({ state: { page: { listings: rows } } })};</script>`,
  );

  const rows = Array.from({ length: 9 }, (_, i) => ({
    bezeichnung: `Führung durch das Rathaus ${i + 1}`,
    beginn: `2026-09-${String(i + 10)}T14:00:00`,
    webseite: `https://beispiel.at/fuehrung/${i}`,
    eintritt: `${8 + i} EUR`,
    breite: 48.2100 + i / 1000,
    laenge: 16.3570 + i / 1000,
  }));

  it('learns a reader for a format no built-in skill can read', () => {
    const html = nuxtPage(rows);
    // Precondition: the built-ins genuinely cannot read this page.
    expect(readBuiltIns(html, harvestPayloads(html), 'https://beispiel.at/').records).toHaveLength(0);

    const learned = learnSkill(harvestPayloads(html), { host: 'beispiel.at', baseUrl: 'https://beispiel.at/' });
    expect(learned).not.toBeNull();
    expect(learned!.skill.path).toEqual(['state', 'page', 'listings']);
    expect(learned!.records.length).toBeGreaterThanOrEqual(9);
    expect(learned!.records[0].name).toContain('Führung');
    expect(learned!.records[0].lat).toBeCloseTo(48.21, 1);
    // Dated rows are events, whatever we guessed going in.
    expect(learned!.skill.kind).toBe('event');
  });

  it('re-applies a learned skill without searching again', () => {
    const html = nuxtPage(rows);
    const learned = learnSkill(harvestPayloads(html), { host: 'beispiel.at' })!;
    // A LATER page of the same site, different content, same shape.
    const later = nuxtPage(rows.map((r, i) => ({ ...r, bezeichnung: `Neue Führung ${i}` })));
    const records = applySkill(learned.skill, harvestPayloads(later), 'https://beispiel.at/');
    expect(records.length).toBeGreaterThanOrEqual(9);
    expect(records[0].name).toContain('Neue Führung');
  });

  it('survives a JSON round trip — a skill has to be storable', () => {
    const html = nuxtPage(rows);
    const learned = learnSkill(harvestPayloads(html), { host: 'beispiel.at' })!;
    const revived = JSON.parse(JSON.stringify(learned.skill));
    expect(applySkill(revived, harvestPayloads(html), 'https://beispiel.at/').length).toBeGreaterThanOrEqual(9);
  });

  it('refuses to learn from navigation chrome', () => {
    const junk = page(`<script>window.__NUXT__ = ${JSON.stringify({
      nav: [{ label: 'Home', href: '/' }, { label: 'About', href: '/about' },
             { label: 'Contact', href: '/contact' }, { label: 'Privacy', href: '/privacy' }],
    })};</script>`);
    expect(learnSkill(harvestPayloads(junk), { host: 'junk.example' })).toBeNull();
  });

  it('refuses to learn from rows with a name and nothing else', () => {
    const thin = page(`<script>window.__NUXT__ = ${JSON.stringify({
      tags: Array.from({ length: 12 }, (_, i) => ({ label: `Category number ${i}` })),
    })};</script>`);
    expect(learnSkill(harvestPayloads(thin), { host: 'thin.example' })).toBeNull();
  });

  it('picks the richest listing when a page has several arrays', () => {
    const html = page(`<script>window.__NUXT__ = ${JSON.stringify({
      breadcrumbs: [{ name: 'Wien tourism guide', url: 'https://b.at/1' },
                    { name: 'Sehenswuerdigkeiten list', url: 'https://b.at/2' },
                    { name: 'Museen overview page', url: 'https://b.at/3' }],
      results: rows,
    })};</script>`);
    const learned = learnSkill(harvestPayloads(html), { host: 'beispiel.at' })!;
    expect(learned.skill.path).toEqual(['results']);
  });
});

describe('validation gate', () => {
  it('needs more than a name to keep a record', () => {
    expect(isUsableRecord({ kind: 'attraction', name: 'Some Place' })).toBe(false);
    expect(isUsableRecord({ kind: 'attraction', name: 'Some Place', url: 'https://e.org/p' })).toBe(true);
  });

  it('rejects chrome and slugs as names', () => {
    expect(isUsableRecord({ kind: 'attraction', name: 'Read more', url: 'https://e.org' })).toBe(false);
    expect(isUsableRecord({ kind: 'attraction', name: 'summer-jazz-festival-2026', url: 'https://e.org' })).toBe(false);
  });

  it('scores a rich record above a thin one', () => {
    const thin = { kind: 'attraction' as const, name: 'Museum', url: 'https://e.org' };
    const rich = {
      kind: 'attraction' as const, name: 'Museum', url: 'https://e.org',
      ticketUrl: 'https://e.org/tickets', image: 'https://e.org/a.jpg', price: '€12',
      lat: 48.2, lng: 16.3, venue: 'Ringstrasse',
      description: 'A long enough description of the museum to read as real prose about it.',
    };
    expect(recordRichness(rich)).toBeGreaterThan(recordRichness(thin));
  });
});

describe('engine', () => {
  beforeEach(() => { resetSkillMemory(); });

  it('reads built-ins and reports which skill produced what', async () => {
    const html = page(`<script type="application/ld+json">${JSON.stringify({
      '@type': 'Museum', name: 'Belvedere', url: 'https://belvedere.at/',
      description: 'Baroque palace complex housing the Klimt collection and much else.',
    })}</script>`);
    const { records, report } = await readPage(html, { url: 'https://belvedere.at/' });
    expect(records).toHaveLength(1);
    expect(report.bySkill['ld+json']).toBe(1);
    expect(report.learned).toBeUndefined();
  });

  it('learns on a page the built-ins cannot read, and remembers it', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      naam: `Rondleiding door de grachten ${i + 1}`,
      startTijd: `2026-07-${String(i + 10)}T11:00:00`,
      pagina: `https://voorbeeld.nl/tour/${i}`,
    }));
    const html = page(`<script id="__NEXT_DATA__" type="application/json">${
      JSON.stringify({ props: { pageProps: { tours: rows } } })}</script>`);

    const first = await readPage(html, { url: 'https://voorbeeld.nl/tours' });
    expect(first.records.length).toBeGreaterThanOrEqual(8);
    expect(first.report.learned?.path).toEqual(['props', 'pageProps', 'tours']);

    // The skill is now held for that host, so the next page uses it directly.
    const stored = await loadSkills('voorbeeld.nl');
    expect(stored).toHaveLength(1);

    const second = await readPage(html, { url: 'https://voorbeeld.nl/tours?page=2' });
    expect(second.records.length).toBeGreaterThanOrEqual(8);
    expect(second.report.learned).toBeUndefined();
    expect(second.report.bySkill[stored[0].id]).toBeGreaterThanOrEqual(8);
  });

  it('does not learn when the built-ins already did the job', async () => {
    const html = page(
      Array.from({ length: 4 }, (_, i) => `<script type="application/ld+json">${JSON.stringify({
        '@type': 'TouristAttraction', name: `Landmark ${i + 1}`, url: `https://e.org/${i}`,
        description: 'A real description of a real landmark, long enough to count as prose.',
      })}</script>`).join('') +
      `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: { list: Array.from({ length: 9 }, (_, i) => ({ n: `Other thing ${i}`, u: `https://e.org/o${i}` })) },
      })}</script>`,
    );
    const { report } = await readPage(html, { url: 'https://e.org/' });
    expect(report.learned).toBeUndefined();
  });

  it('returns nothing rather than throwing on junk input', async () => {
    for (const junk of ['', '<html>', 'not html at all', '<script type="application/json">{</script>']) {
      await expect(readPage(junk, { url: 'https://x.example' })).resolves.toMatchObject({ records: [] });
    }
  });

  it('is safe against a self-referencing payload', async () => {
    // A cyclic object can't come from JSON.parse, but the walkers must still be
    // depth-bounded — a 60-deep nest is a real thing on state-heavy sites.
    let deep: Record<string, unknown> = { name: 'Deep One', url: 'https://e.org/d' };
    for (let i = 0; i < 60; i++) deep = { child: deep };
    const html = page(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(deep)}</script>`);
    await expect(readPage(html, { url: 'https://deep.example' })).resolves.toBeTruthy();
  });
});
