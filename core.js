/* Shared, dependency-free rules used by the page and the Apps Script server. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LunchCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MEMBERS = [
    { id: 'seongjun', name: '조성준', team: '커뮤니케이션팀', days: [2, 5], color: 'coral' },
    { id: 'juri', name: '손주리', team: '전략사업팀', days: [1, 2, 5], color: 'purple' },
    { id: 'hyunsu', name: '윤현수', team: '전략사업팀', days: [1, 2, 5], color: 'blue' },
    { id: 'yunchul', name: '김윤철', team: '경영지원팀', days: [3], color: 'green' },
    { id: 'jingi', name: '천진기', team: '디자인팀', days: [2], color: 'amber' },
    { id: 'minjun', name: '최민준', team: '연구기획팀', days: [1, 4], color: 'blue' },
    { id: 'seongeun', name: '오성은', team: '경영지원팀', days: [3], color: 'green' },
    { id: 'yunseok', name: '장윤석', team: '경영지원팀', days: [3], color: 'green' },
    { id: 'jiwoo', name: '서지우', team: '디자인팀', days: [2], color: 'amber' },
    { id: 'hyunju', name: '조현주', team: '영업팀', days: [1, 5], color: 'coral' }
  ];
  const DEFAULT_SETTINGS = {
    scheduleEnd: '2026-12-31',
    ceoDays: Object.fromEntries(MEMBERS.map(m => [m.id, m.days])),
    meetingTime: '12:00'
  };
  const WELPLAN = 'https://welplan.pmh.codes/restaurants/welstory/REST007327/' + encodeURIComponent('메가존산학연센터');
  const PLACES = [
    { id: 'megazone', name: '메가존', subtitle: '메가존산학연센터 · 삼성웰스토리', url: WELPLAN, type: 'cafeteria' },
    { id: 'lunchtime', name: '런치타임', subtitle: '과천 어반허브 구내식당', url: 'https://naver.me/Fr054Jzy', menuUrl: 'https://pf.kakao.com/_xbbMPn', type: 'buffet' }
  ];
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function validDate(date) {
    if (typeof date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) return false;
    const d = new Date(date + 'T12:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === date;
  }
  function today(now) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now || new Date());
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function weekday(date) { if (!validDate(date)) throw new Error('날짜를 확인해 주세요.'); return new Date(date + 'T12:00:00Z').getUTCDay(); }
  function shiftDate(date, n) {
    if (!validDate(date)) throw new Error('날짜를 확인해 주세요.');
    const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
  }
  function weekDates(date) { const w = weekday(date); const mon = shiftDate(date, -(w === 0 ? 6 : w - 1)); return [0, 1, 2, 3, 4].map(n => shiftDate(mon, n)); }
  function settings(value) {
    const v = value || {}; const out = clone(DEFAULT_SETTINGS);
    if (validDate(v.scheduleEnd)) out.scheduleEnd = v.scheduleEnd;
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v.meetingTime || '')) out.meetingTime = v.meetingTime;
    MEMBERS.forEach(m => { if (v.ceoDays && Array.isArray(v.ceoDays[m.id])) out.ceoDays[m.id] = [...new Set(v.ceoDays[m.id].filter(n => Number.isInteger(n) && n >= 1 && n <= 5))]; });
    return out;
  }
  function emptyDay() { return { ceoCancelled: false, overrides: {}, absenceReasons: {}, votes: {}, extras: [], decision: null, notes: {}, revision: 0, updatedAt: null }; }
  function safeUrl(url) {
    if (!url) return '';
    const value = String(url).trim();
    if (!/^https?:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/i.test(value) || /[\u0000-\u0020<>"'\\]/.test(value)) return '';
    if (typeof URL === 'undefined') return value;
    try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (_) { return ''; }
  }
  function cleanDay(value) {
    const v = value || {}, d = emptyDay(); d.ceoCancelled = v.ceoCancelled === true;
    MEMBERS.forEach(m => {
      if (['in', 'out', 'ceo'].includes(v.overrides && v.overrides[m.id])) d.overrides[m.id] = v.overrides[m.id];
      if (d.overrides[m.id] === 'out' && typeof (v.absenceReasons && v.absenceReasons[m.id]) === 'string') d.absenceReasons[m.id] = v.absenceReasons[m.id].trim().slice(0, 60);
      if (typeof (v.votes && v.votes[m.id]) === 'string') d.votes[m.id] = v.votes[m.id].slice(0, 70);
    });
    const seen = new Set();
    (Array.isArray(v.extras) ? v.extras : []).slice(0, 8).forEach(p => {
      if (!p || !/^extra_[a-zA-Z0-9_-]{1,50}$/.test(p.id) || seen.has(p.id) || !String(p.name || '').trim()) return;
      seen.add(p.id); d.extras.push({ id: p.id, name: String(p.name).trim().slice(0, 30), subtitle: String(p.subtitle || '').slice(0, 60), url: safeUrl(p.url) });
    });
    PLACES.concat(d.extras).forEach(p => { if (v.notes && typeof v.notes[p.id] === 'string') d.notes[p.id] = v.notes[p.id].slice(0, 300); });
    if (v.decision && PLACES.concat(d.extras).some(p => p.id === v.decision.placeId)) {
      d.decision = { placeId: v.decision.placeId, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(v.decision.time || '') ? v.decision.time : '12:00', actor: MEMBERS.some(m => m.id === v.decision.actor) ? v.decision.actor : '', at: String(v.decision.at || '') };
    }
    d.revision = Number.isInteger(v.revision) ? Math.max(0, v.revision) : 0; d.updatedAt = v.updatedAt || null;
    return d;
  }
  function memberStatus(id, date, day, config) {
    const m = MEMBERS.find(x => x.id === id); if (!m) throw new Error('멤버를 확인해 주세요.');
    const d = day || emptyDay(), s = settings(config), over = d.overrides[id];
    if (over === 'in') return { in: true, reason: '오늘 함께해요', manual: true };
    if (over === 'out') return { in: false, reason: '오늘 안 먹음', detail: (d.absenceReasons || {})[id] || '', manual: true };
    if (over === 'ceo') return { in: false, reason: '대표님과 점심', manual: true };
    const dow = weekday(date);
    if (dow === 0 || dow === 6) return { in: false, reason: '주말', manual: false };
    if (!d.ceoCancelled && date <= s.scheduleEnd && s.ceoDays[id].includes(dow)) return { in: false, reason: '대표님과 점심', manual: false };
    return { in: true, reason: '함께 먹어요', manual: false };
  }
  function participants(date, day, config) { return MEMBERS.filter(m => memberStatus(m.id, date, day, config).in); }
  function places(day) { return PLACES.concat((day || emptyDay()).extras || []); }
  function tally(date, day, config) {
    const result = Object.fromEntries(places(day).map(p => [p.id, []]));
    participants(date, day, config).forEach(m => { const p = day.votes[m.id]; if (result[p]) result[p].push(m.id); });
    return result;
  }
  function applyOperation(value, date, config, op, now) {
    if (!validDate(date)) throw new Error('날짜 형식이 잘못되었습니다.');
    if (!op || !MEMBERS.some(m => m.id === op.actor)) throw new Error('먼저 내 이름을 선택해 주세요.');
    const d = cleanDay(value), p = op.payload || {}; const hasPlace = id => places(d).some(x => x.id === id);
    switch (op.type) {
      case 'availability':
        if (!['auto', 'in', 'out', 'ceo'].includes(p.value)) throw new Error('참석 상태를 확인해 주세요.');
        if (p.value === 'auto') delete d.overrides[op.actor]; else d.overrides[op.actor] = p.value;
        if (p.value === 'out') d.absenceReasons[op.actor] = String(p.reason || '').trim().slice(0, 60);
        else delete d.absenceReasons[op.actor];
        break;
      case 'ceo': if (typeof p.cancelled !== 'boolean') throw new Error('일정을 확인해 주세요.'); d.ceoCancelled = p.cancelled; break;
      case 'vote':
        if (p.placeId === null) { delete d.votes[op.actor]; break; }
        if (!memberStatus(op.actor, date, d, config).in) throw new Error('오늘 함께 먹는 상태로 바꾼 뒤 선택해 주세요.');
        if (!hasPlace(p.placeId)) throw new Error('식당을 다시 선택해 주세요.');
        d.votes[op.actor] = p.placeId; break;
      case 'addPlace':
        if (d.extras.length >= 8) throw new Error('다른 식당은 하루 8곳까지 추가할 수 있어요.');
        if (!/^extra_[a-zA-Z0-9_-]{1,50}$/.test(p.id || '') || hasPlace(p.id)) throw new Error('식당 번호가 중복되었습니다.');
        if (!String(p.name || '').trim()) throw new Error('식당 이름을 입력해 주세요.');
        if (p.url && !safeUrl(p.url)) throw new Error('지도 링크는 http 또는 https로 시작해야 합니다.');
        d.extras.push({ id: p.id, name: String(p.name).trim().slice(0, 30), subtitle: String(p.subtitle || '').trim().slice(0, 60), url: safeUrl(p.url) }); break;
      case 'removePlace':
        if (!d.extras.some(x => x.id === p.placeId)) throw new Error('추가한 식당만 삭제할 수 있어요.');
        d.extras = d.extras.filter(x => x.id !== p.placeId);
        MEMBERS.forEach(m => { if (d.votes[m.id] === p.placeId) delete d.votes[m.id]; });
        if (d.decision && d.decision.placeId === p.placeId) d.decision = null;
        delete d.notes[p.placeId]; break;
      case 'note':
        if (!hasPlace(p.placeId)) throw new Error('식당을 확인해 주세요.');
        d.notes[p.placeId] = String(p.text || '').trim().slice(0, 300); break;
      case 'decision':
        if (!hasPlace(p.placeId)) throw new Error('확정할 식당을 선택해 주세요.');
        if (!participants(date, d, config).length) throw new Error('오늘 함께 먹는 사람이 없습니다.');
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time || '')) throw new Error('만날 시간을 입력해 주세요.');
        d.decision = { placeId: p.placeId, time: p.time, actor: op.actor, at: now || new Date().toISOString() }; break;
      case 'unconfirm': d.decision = null; break;
      default: throw new Error('지원하지 않는 요청입니다.');
    }
    d.revision += 1; d.updatedAt = now || new Date().toISOString(); return d;
  }
  function parseMenuMarkdown(text) {
    const block = String(text || '').split(/^## 점심\s*$/m)[1];
    if (!block) return [];
    return block.split(/^## /m)[0].split('\n').filter(x => /^- /.test(x)).map(x => x.slice(2).trim()).filter(Boolean).slice(0, 12);
  }
  function menuUrl(date) { return WELPLAN + '/' + date.replaceAll('-', ''); }
  return { MEMBERS, PLACES, DEFAULT_SETTINGS, WELPLAN, clone, validDate, today, weekday, shiftDate, weekDates, settings, emptyDay, cleanDay, safeUrl, memberStatus, participants, places, tally, applyOperation, parseMenuMarkdown, menuUrl };
});
