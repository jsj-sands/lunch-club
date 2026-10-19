/* Public channel metadata only. No login, friend relationship, or menu date is inferred.
 * Fetch HOME_ENDPOINT on the server: browser Origin requests omit the public OG data.
 * This module is dependency-free and also runs in Apps Script V8.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LunchKakaoSource = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SOURCE_URL = 'https://pf.kakao.com/_xbbMPn';
  const HOME_ENDPOINT = 'https://pf.kakao.com/rocket-web/web/profiles/_xbbMPn/home';
  const PROFILE_ID = '_xbbMPn';
  const MAX_RESPONSE_BYTES = 256 * 1024;
  const REQUEST_HEADERS = Object.freeze({ Accept: 'application/json' });

  function failure(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function invalid() {
    return failure('INVALID_RESPONSE', '런치타임 공개 프로필의 응답 형식을 확인하지 못했어요.');
  }

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function boundedText(text) {
    if (typeof text !== 'string' || !text.trim()) throw invalid();
    // UTF-8 byte count without browser-only TextEncoder or Apps Script Utilities.
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x80) bytes++;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length &&
          text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
      if (bytes > MAX_RESPONSE_BYTES) {
        throw failure('RESPONSE_TOO_LARGE', '런치타임 공개 프로필 응답이 너무 커서 표시하지 않았어요.');
      }
    }
    return text;
  }

  function validSourceURL(value) {
    return typeof value === 'string' && /^https?:\/\/pf\.kakao\.com\/_xbbMPn\/?$/.test(value);
  }

  function validImageURL(value) {
    if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\\<>"']/.test(value)) return false;
    const match = /^https:\/\/([^/?#]+)(\/[^?#]*)(?:\?([^#]*))?$/i.exec(value);
    if (!match || match[1].toLowerCase() !== 'k.kakaocdn.net') return false;
    // Exact CDN authority, generated /dn/ paths and raster image files only.
    // Credentials, ports, fragments, traversal and arbitrary redirect URLs fail.
    if (!/^\/dn\/(?:[a-z0-9_-]+\/)+[a-z0-9_-]+\.(?:jpe?g|png|webp|gif)$/i.test(match[2])) return false;
    return match[3] === undefined || /^[a-z0-9._~!$&()*+,;=:@%/?-]*$/i.test(match[3]);
  }

  function result(imageUrl) {
    if (!validImageURL(imageUrl)) {
      throw failure('INVALID_IMAGE_URL', '런치타임의 공개 이미지 주소를 확인하지 못했어요.');
    }
    return { ok: true, sourceUrl: SOURCE_URL, imageUrl: imageUrl };
  }

  function normalizeProfile(raw) {
    let payload;
    if (typeof raw === 'string') {
      boundedText(raw);
      try { payload = JSON.parse(raw); } catch (_) { throw invalid(); }
    } else {
      let serialized;
      try { serialized = JSON.stringify(raw); } catch (_) { throw invalid(); }
      boundedText(serialized);
      payload = raw;
    }
    if (!object(payload) || typeof payload.profile_id !== 'string' || !object(payload.profile) ||
        typeof payload.profile.profile_id !== 'string') throw invalid();
    const profile = payload.profile;
    if (payload.profile_id !== PROFILE_ID || profile.profile_id !== PROFILE_ID) {
      throw failure('CHANNEL_MISMATCH', '다른 채널의 응답이어서 이미지를 표시하지 않았어요.');
    }
    if (profile.permalink !== undefined && !validSourceURL(profile.permalink)) {
      throw failure('CHANNEL_MISMATCH', '런치타임 채널의 원문 주소가 일치하지 않아요.');
    }
    const image = profile.profile_image;
    if (!object(image) || image.type !== 'image') throw invalid();
    if (image.mimetype !== undefined && !/^image\/(?:jpeg|png|webp|gif)$/.test(image.mimetype)) throw invalid();
    const fields = ['xlarge_url', 'url', 'large_url', 'medium_url'];
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (image[field] !== undefined) return result(image[field]);
    }
    throw invalid();
  }

  function decodeAttribute(value) {
    return value.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|(amp|quot|apos|lt|gt));/gi,
      function (_all, decimal, hex, named) {
        if (named) return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[named.toLowerCase()];
        const code = parseInt(decimal || hex, decimal ? 10 : 16);
        if (code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) throw invalid();
        return String.fromCodePoint(code);
      });
  }

  function attributes(text) {
    const values = Object.create(null);
    const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match;
    let end = 0;
    while ((match = pattern.exec(text))) {
      if (text.slice(end, match.index).trim()) throw invalid();
      const name = match[1].toLowerCase();
      if (Object.prototype.hasOwnProperty.call(values, name)) throw invalid();
      values[name] = decodeAttribute(match[2] !== undefined ? match[2] :
        match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : '');
      end = pattern.lastIndex;
    }
    if (text.slice(end).trim()) throw invalid();
    return values;
  }

  function parseHTML(raw) {
    const html = boundedText(raw);
    if (html.indexOf('Invalid CORS request') !== -1) {
      throw failure('CORS_BLOCKED', '채널이 브라우저의 직접 프로필 조회를 허용하지 않았어요.');
    }
    // Tokenize detached text; never create DOM nodes or run page scripts.
    const tags = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?[a-z][a-z0-9:-]*(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
    const meta = Object.create(null);
    let inHead = false;
    let closedHead = false;
    let ignore = '';
    let templateDepth = 0;
    let token;
    while ((token = tags.exec(html))) {
      const tag = /^<(\/?)([a-z][a-z0-9:-]*)([\s\S]*?)>$/i.exec(token[0]);
      if (!tag) continue;
      const closing = tag[1] === '/';
      const name = tag[2].toLowerCase();
      if (ignore) {
        if (ignore === 'template' && name === 'template' && !closing) templateDepth++;
        if (name === ignore && closing && (ignore !== 'template' || --templateDepth === 0)) ignore = '';
        continue;
      }
      if (!closing && /^(?:script|style|title|textarea|noscript|template)$/.test(name)) {
        ignore = name;
        templateDepth = 1;
        continue;
      }
      if (name === 'head') {
        if (closing) { closedHead = inHead; break; }
        if (inHead) throw invalid();
        inHead = true;
        continue;
      }
      if (name === 'body') break;
      if (!inHead || closing || name !== 'meta') continue;
      const attrs = attributes(tag[3].replace(/\/\s*$/, ''));
      const property = (attrs.property || '').toLowerCase();
      if (property !== 'og:url' && property !== 'og:image') continue;
      if (Object.prototype.hasOwnProperty.call(meta, property) || typeof attrs.content !== 'string') throw invalid();
      meta[property] = attrs.content;
    }
    if (!closedHead || !meta['og:url'] || !meta['og:image']) throw invalid();
    if (!validSourceURL(meta['og:url'])) {
      throw failure('CHANNEL_MISMATCH', '다른 채널의 원문이어서 이미지를 표시하지 않았어요.');
    }
    return result(meta['og:image']);
  }

  return Object.freeze({
    SOURCE_URL: SOURCE_URL,
    HOME_ENDPOINT: HOME_ENDPOINT,
    PROFILE_ID: PROFILE_ID,
    MAX_RESPONSE_BYTES: MAX_RESPONSE_BYTES,
    REQUEST_HEADERS: REQUEST_HEADERS,
    normalizeProfile: normalizeProfile,
    validImageURL: validImageURL,
    parseHTML: parseHTML
  });
});
