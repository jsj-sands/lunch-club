/* Read-only, public OCR verdict matcher. Never trusts a URL without checking against
 * the team's separately fetched Threads posts, never overrides a manual team pick. */
var LunchOcrChoice = (function (root) {
  'use strict';
  const VERSION = 1;
  function urlOK(value) {
    if (typeof value !== 'string' || value.length > 220) return false;
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && ['www.threads.com', 'threads.com'].includes(u.hostname) &&
        /^\/@gangnambab\/post\/[A-Za-z0-9_-]+\/?$/.test(u.pathname) &&
        !u.search && !u.hash && !u.username && !u.password;
    } catch (_) { return false; }
  }
  function pick(entry, verdict, date, nowMs) {
    if (!entry || entry.ok || !Array.isArray(entry.alternatives) ||
        !verdict || verdict.version !== VERSION || verdict.status !== 'verified' ||
        verdict.date !== date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !urlOK(verdict.selected_post_url)) return null;
    const menuFrames = verdict.evidence?.menu_frames, samples = verdict.evidence?.sampled_frames,
      score = verdict.evidence?.score;
    if (!Number.isInteger(menuFrames) || menuFrames < 2 || !Number.isInteger(samples) ||
        samples < menuFrames || samples > 20 || !Number.isFinite(score) || score < 10) return null;
    const checkedAt = Date.parse(verdict.checked_at);
    if (!Number.isFinite(checkedAt) || !Number.isFinite(nowMs) ||
        checkedAt > nowMs + 10 * 60 * 1000 || nowMs - checkedAt > 18 * 60 * 60 * 1000) return null;
    const candidates = entry.alternatives.filter(c => c && c.postUrl === verdict.selected_post_url && !c.promotion);
    if (candidates.length !== 1) return null;
    const candidate = candidates[0];
    if (candidate.kind !== 'video' || !/^https:\/\//.test(candidate.videoUrl || '')) return null;
    if (typeof candidate.publishedAt !== 'string') return null;
    return {ok: true, date, version: entry.version, confidence: 'ocr',
      kind: 'video', videoUrl: candidate.videoUrl, imageUrl: '',
      posterUrl: candidate.posterUrl || '', postUrl: candidate.postUrl,
      publishedAt: candidate.publishedAt, checkedAt: verdict.checked_at,
      ocrFrames: menuFrames, ocrSamples: samples};
  }
  const api = {pick, VERSION};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LunchOcrChoice = api;
  return api;
})(typeof window !== 'undefined' ? window : null);
