import { describe, it, expect } from 'vitest';
import { extractEventsFromHtml, extractEmbeddedEvents } from './webCrawler';

describe('extractEventsFromHtml', () => {
  it('extracts a single schema.org Event', () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"MusicEvent","name":"Jazz Night",
       "startDate":"2099-08-12T20:00","url":"https://x.com/e/1",
       "location":{"@type":"Place","name":"Blue Room","address":{"addressLocality":"Vienna","streetAddress":"Main St 1"},"geo":{"latitude":48.2,"longitude":16.37}},
       "offers":{"@type":"Offer","price":"15","priceCurrency":"EUR"}}
      </script>
      </head></html>`;
    const evs = extractEventsFromHtml(html);
    expect(evs).toHaveLength(1);
    expect(evs[0].name).toBe('Jazz Night');
    expect(evs[0].venue).toBe('Blue Room');
    expect(evs[0].locality).toBe('Vienna');
    expect(evs[0].lat).toBeCloseTo(48.2);
    expect(evs[0].price).toBe('EUR 15');
  });

  it('walks @graph and ItemList containers', () => {
    const html = `
      <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebSite","name":"ignore me"},
        {"@type":"ItemList","itemListElement":[
          {"@type":"ListItem","item":{"@type":"Event","name":"Market Day","startDate":"2099-09-01","location":{"@type":"Place","name":"Square"}}},
          {"@type":"ListItem","item":{"@type":"TheaterEvent","name":"Hamlet","startDate":"2099-09-02"}}
        ]}
      ]}
      </script>`;
    const evs = extractEventsFromHtml(html);
    const names = evs.map(e => e.name).sort();
    expect(names).toEqual(['Hamlet', 'Market Day']);
  });

  it('ignores non-event types and malformed blocks', () => {
    const html = `
      <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
      <script type="application/ld+json">{ broken json ]</script>`;
    expect(extractEventsFromHtml(html)).toHaveLength(0);
  });

  it('skips events with no name or no start date', () => {
    const html = `
      <script type="application/ld+json">{"@type":"Event","name":"No Date"}</script>
      <script type="application/ld+json">{"@type":"Event","startDate":"2099-01-01"}</script>`;
    expect(extractEventsFromHtml(html)).toHaveLength(0);
  });

  it('falls back to embedded JSON (JS-rendered sites) when no ld+json', () => {
    const html = `
      <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"events":[
        {"title":"Beach Party","startDate":"2099-07-15T18:00","venue":"Sunset Beach","url":"https://x.com/e/9","city":"Lagos"},
        {"name":"Marathon 2099","start_date":"2099-09-01","place":"City Park","link":"https://x.com/m"}
      ]}}}
      </script>`;
    const evs = extractEventsFromHtml(html);
    const names = evs.map(e => e.name).sort();
    expect(names).toEqual(['Beach Party', 'Marathon 2099']);
    expect(evs.find(e => e.name === 'Beach Party')?.venue).toBe('Sunset Beach');
  });

  it('embedded extractor ignores objects that are not event-shaped', () => {
    const html = `<script type="application/json">
      {"user":{"name":"Bob","date_joined":"2020-01-01"},"config":{"title":"Settings"}}
    </script>`;
    // "Bob" has a name + date but no venue/url → not trusted; "Settings" has no date.
    expect(extractEmbeddedEvents(html)).toHaveLength(0);
  });
});
