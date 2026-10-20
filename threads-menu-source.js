/* Public Threads daily-menu selection: accepts official Graph API and RSSHub feeds. */
var LunchThreadsMenu = (function (root) {
  'use strict';
  const ACCOUNT = 'gangnambab';
  const PAGE = 'https://www.threads.com/@gangnambab';
  const MEDIA_HOSTS = ['fbcdn.net', 'cdninstagram.com', 'cdnthreads.net', 'threads.net', 'threads.com', 'instagram.com'];
  // Apps Script has no browser URL/URLSearchParams global.
  // Parse only the strict HTTPS subset required here, not a general URL polyfill.
  function httpsParts(value, maxLength) {
    if (typeof value !== 'string' || !value || value.length > maxLength ||
        /[\u0000-\u0020\u007f\\<>"'`]/.test(value)) return null;
    const m = /^https:\/\/([a-z0-9.-]+)(?::443)?(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i.exec(value);
    if (!m) return null;
    const hostname = m[1].toLowerCase();
    if (hostname.length > 253 || !hostname.split('.').every(label =>
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
    return { hostname, pathname: m[2] || '/' };
  }
  function validMediaURL(value) {
    const u = httpsParts(value, 6000);
    return !!u && MEDIA_HOSTS.some(domain =>
      u.hostname === domain || u.hostname.endsWith('.' + domain));
  }
  function validImageURL(url) { return validMediaURL(url); }
  function validPostURL(value) {
    const u = httpsParts(value, 1000);
    return !!u && ['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'].includes(u.hostname) &&
      (/^\/@gangnambab\/post\/[A-Za-z0-9_-]+\/?$/.test(u.pathname) || /^\/t\/[A-Za-z0-9_-]+\/?$/.test(u.pathname));
  }
  function seoulDate(value) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return '';
    const adjusted = new Date(time + 9 * 60 * 60 * 1000);
    return Number.isFinite(adjusted.getTime()) ? adjusted.toISOString().slice(0, 10) : '';
  }
  function decodeXml(value) {
    return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/gi, item => {
        const dict = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&#x27;':"'"};
        return dict[item.toLowerCase()] || item;
      });
  }
  function elementContent(xml, name) {
    const found = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>', 'i').exec(xml);
    return found ? decodeXml(found[1]).trim() : '';
  }
  function attr(tag, name) {
    const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(["\\\'])(.*?)\\1','i').exec(tag);
    return m ? decodeXml(m[2]) : '';
  }
  function videoFromDescription(description) {
    const videos = [...String(description).matchAll(/<video\b([^>]*)>([\s\S]*?)<\/video>/gi)];
    const result = [];
    for (const v of videos) {
      const source = /<source\b[^>]*>/i.exec(v[2]);
      const videoUrl = source ? attr(source[0], 'src') : attr(v[0].split('>')[0] + '>', 'src');
      const posterUrl = attr('<video ' + v[1] + '>', 'poster');
      if (validMediaURL(videoUrl)) result.push({ videoUrl, posterUrl: validImageURL(posterUrl) ? posterUrl : '' });
    }
    return result;
  }
  function parseRss(xml) {
    if (typeof xml !== 'string' || xml.length > 650000 || !/<rss\b|<feed\b/i.test(xml)) throw new Error('RSS 문서 형식을 확인할 수 없습니다.');
    const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0, 80);
    return { data: items.map(m => {
      const raw = m[1], desc = elementContent(raw, 'description'), media = videoFromDescription(desc);
      const postUrl = elementContent(raw, 'link').replace(/^https:\/\/www\.threads\.com\/t\/([A-Za-z0-9_-]+)\/?$/, 'https://www.threads.com/@gangnambab/post/$1');
      const image = /<img\b[^>]*>/i.exec(desc);
      const imgUrl = image ? attr(image[0], 'src') : '';
      const title = elementContent(raw, 'title');
      const pub = elementContent(raw, 'pubDate');
      return { username: ACCOUNT, timestamp: pub, permalink: postUrl, text: title, media_type: media.length ? 'VIDEO' : imgUrl ? 'IMAGE' : 'TEXT_POST',
        media_url: media.length ? media[0].videoUrl : imgUrl, thumbnail_url: media.length ? media[0].posterUrl : '', is_quote_post: false };
    }) };
  }
  const MENU_HINT = /메뉴표|식단표|메뉴판|차림표|메뉴\s*공지|오늘의\s*메뉴|오늘\s*메뉴|금일\s*메뉴|점심\s*메뉴|daily\s*menu|menu\s*board/i;
  const FOOD_HINT = /음식\s*사진|food\s*photo|실제\s*음식|메뉴\s*사진\s*아님|먹방/i;
  function publicCandidate(post) {
    const kind = post.media_type === 'VIDEO' ? 'video' : 'image';
    const candidate = { kind, date: seoulDate(post.timestamp), postUrl: post.permalink, publishedAt: post.timestamp,
      videoUrl: kind === 'video' ? post.media_url : '', imageUrl: kind === 'image' ? post.media_url : '',
      posterUrl: validImageURL(post.thumbnail_url) ? post.thumbnail_url : '' };
    const text = String(post.text || '') + ' ' + String(post.alt_text || '');
    candidate.menuHint = MENU_HINT.test(text) && !FOOD_HINT.test(text);
    return candidate;
  }
  // Aggregate diagnostics only: no credentials, raw feed bodies or signed URLs.
  function inspectPosts(json, date) {
    const all = json && Array.isArray(json.data) ? json.data : [];
    const posts = all.filter(p => p && String(p.username || '').toLowerCase() === ACCOUNT &&
      !p.is_quote_post && !p.reposted_post);
    const dated = posts.filter(p => seoulDate(p.timestamp));
    const matching = dated.filter(p => seoulDate(p.timestamp) === date);
    const media = matching.filter(p => ['VIDEO', 'IMAGE'].includes(p.media_type));
    const valid = media.filter(p => validMediaURL(p.media_url) && validPostURL(p.permalink));
    const d = {
      totalPosts: all.length, accountPosts: posts.length, datedPosts: dated.length,
      matchingDatePosts: matching.length, mediaPosts: media.length, validMediaPosts: valid.length,
      invalidMediaURLs: media.filter(p => !validMediaURL(p.media_url)).length,
      invalidPostURLs: media.filter(p => !validPostURL(p.permalink)).length,
      latestPostDate: dated.map(p => seoulDate(p.timestamp)).sort().pop() || '',
      expectedDate: date, failure: ''
    };
    if (!all.length) d.failure = 'empty_feed';
    else if (!posts.length) d.failure = 'source_mismatch';
    else if (!dated.length) d.failure = 'date_unknown';
    else if (!matching.length) d.failure = 'not_found';
    else if (!media.length) d.failure = 'no_supported_media';
    else if (!valid.length) d.failure = d.invalidPostURLs ? 'invalid_post_link' : 'media_unavailable';
    return d;
  }
  function chooseMenu(json, date) {
    if (!json || !Array.isArray(json.data) || !/^\d{4}-\d\d-\d\d$/.test(date)) throw new Error('Threads 게시물 응답 형식이 올바르지 않습니다.');
    if (json.data.length > 100) throw new Error('Threads 게시물이 너무 많습니다.');
    const diagnostics = inspectPosts(json, date);
    const candidates = json.data.filter(post => post && String(post.username || '').toLowerCase() === ACCOUNT && seoulDate(post.timestamp) === date &&
      ['VIDEO', 'IMAGE'].includes(post.media_type) && validMediaURL(post.media_url) && validPostURL(post.permalink) && !post.is_quote_post && !post.reposted_post)
      .map(publicCandidate).sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    const videos = candidates.filter(c => c.kind === 'video');
    // Menu notices are normally video slideshows. Prefer explicit menu text when present.
    const hinted = candidates.filter(c => c.menuHint);
    let selected = null;
    if (hinted.length === 1) selected = hinted[0];
    else if (hinted.length > 1) return { ok: false, reason: 'ambiguous', alternatives: hinted.slice(0, 3), diagnostics };
    else if (videos.length === 1) selected = videos[0];
    else if (candidates.length === 1) selected = candidates[0];
    if (selected) return { ok: true, date, kind: selected.kind, imageUrl: selected.imageUrl, videoUrl: selected.videoUrl,
      posterUrl: selected.posterUrl, postUrl: selected.postUrl, publishedAt: selected.publishedAt, confidence: selected.menuHint ? 'caption' : 'only_media', source: PAGE, diagnostics };
    return { ok: false, reason: candidates.length > 1 ? 'ambiguous' : 'not_found', alternatives: candidates.slice(0, 3), diagnostics };
  }
  const api = { ACCOUNT, PAGE, validImageURL, validMediaURL, validPostURL, seoulDate, parseRss, chooseMenu, inspectPosts, VERSION: '20261020-gas-url-fix' };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LunchThreadsMenu = api;
  return api;
})(typeof window !== 'undefined' ? window : null);
