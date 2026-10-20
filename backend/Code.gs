// SANDS Lunch Club, Google Apps Script single file. Generated from core.js + lunchtime-source.js + backend/server.js.

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
  const MEMBER_IDS = new Set(MEMBERS.map(m => m.id));
  const PAIR_ID = /^pair_[a-f0-9]{24}$/;
  const OVERRIDE_VALUES = ['in', 'out', 'ceo', 'pending', 'separate'];
  const GUIDE_ID = /^guide_(\d{5,20})$/;
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
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
  function emptyDay() { return { ceoCancelled: false, overrides: {}, absenceReasons: {}, votes: {}, extras: [], decision: null, ceoDecision: null, separateVenues: {}, notes: {}, pairs: [], revision: 0, updatedAt: null }; }
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
      if (OVERRIDE_VALUES.includes(v.overrides && v.overrides[m.id])) d.overrides[m.id] = v.overrides[m.id];
      if (d.overrides[m.id] === 'out' && typeof (v.absenceReasons && v.absenceReasons[m.id]) === 'string') d.absenceReasons[m.id] = v.absenceReasons[m.id].trim().slice(0, 60);
      // Older extra-place selections are kept for backwards compatibility, but never tallied as regular lunch.
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
    // A CEO venue belongs to one date, not to each person's cafeteria choice.
    const ceo = v.ceoDecision, guideMatch = typeof ceo?.placeId === 'string' && ceo.placeId.match(GUIDE_ID);
    if (guideMatch && ceo.url === `https://m.place.naver.com/place/${guideMatch[1]}/home`
        && typeof ceo.name === 'string' && ceo.name.trim()
        && typeof ceo.actor === 'string' && MEMBER_IDS.has(ceo.actor) && TIME.test(ceo.time || '')) {
      d.ceoDecision = { placeId: ceo.placeId, name: ceo.name.trim().slice(0, 60), url: ceo.url,
        category: typeof ceo.category === 'string' ? ceo.category.slice(0, 20) : '',
        time: ceo.time, actor: ceo.actor, at: typeof ceo.at === 'string' ? ceo.at.slice(0, 40) : '' };
    }
    const pairs = (Array.isArray(v.pairs) ? v.pairs : []).slice(0, MEMBERS.length * MEMBERS.length), pairIds = new Set(), occupied = new Set(), leaders = new Set();
    // Accepted teammates and pending invitees may each belong to only one group.
    // Several links with the same inviter form one group; legacy one-to-one links still work.
    ['accepted', 'pending'].forEach(status => pairs.forEach(pair => {
      if (!pair || typeof pair !== 'object' || Array.isArray(pair) || pair.status !== status || typeof pair.id !== 'string' || !PAIR_ID.test(pair.id) || !MEMBER_IDS.has(pair.from) || !MEMBER_IDS.has(pair.to) || pair.from === pair.to) return;
      if (d.overrides[pair.from] !== 'separate' || status === 'accepted' && d.overrides[pair.to] !== 'separate') return;
      if (pairIds.has(pair.id) || occupied.has(pair.to) || occupied.has(pair.from) && !leaders.has(pair.from)) return;
      pairIds.add(pair.id); leaders.add(pair.from); occupied.add(pair.from); occupied.add(pair.to);
      d.pairs.push({ id: pair.id, from: pair.from, to: pair.to, status });
    }));
    MEMBERS.forEach(m => {
      const venue = v.separateVenues && v.separateVenues[m.id];
      if (d.overrides[m.id] !== 'separate' || !venue || typeof venue !== 'object' || Array.isArray(venue)) return;
      const match = typeof venue.placeId === 'string' && venue.placeId.match(GUIDE_ID);
      if (!match || venue.url !== `https://m.place.naver.com/place/${match[1]}/home` || typeof venue.name !== 'string' || !venue.name.trim() || !MEMBER_IDS.has(venue.actor)) return;
      d.separateVenues[m.id] = { placeId: venue.placeId, name: venue.name.trim().slice(0, 60), url: venue.url,
        category: typeof venue.category === 'string' ? venue.category.slice(0, 20) : '',
        actor: venue.actor, at: typeof venue.at === 'string' ? venue.at.slice(0, 40) : '' };
    });
    d.revision = Number.isInteger(v.revision) ? Math.max(0, v.revision) : 0; d.updatedAt = v.updatedAt || null;
    return d;
  }
  function memberStatus(id, date, day, config) {
    const m = MEMBERS.find(x => x.id === id); if (!m) throw new Error('멤버를 확인해 주세요.');
    const d = day || emptyDay(), s = settings(config), over = (d.overrides || {})[id], dow = weekday(date);
    if (over === 'in') return { kind: 'in', in: true, reason: '함께 점심', manual: true };
    if (over === 'out') return { kind: 'out', in: false, reason: '오늘 안 먹음', detail: (d.absenceReasons || {})[id] || '', manual: true };
    if (over === 'ceo') return { kind: 'ceo', in: false, reason: '대표님과 점심', manual: true };
    if (over === 'pending') return { kind: 'pending', in: false, reason: '미선택', manual: true };
    if (over === 'separate') return { kind: 'separate', in: false, reason: '따로 먹어요', manual: true };
    if (!d.ceoCancelled && date <= s.scheduleEnd && s.ceoDays[id].includes(dow)) return { kind: 'ceo', in: false, reason: '대표님과 점심', manual: false };
    return { kind: 'pending', in: false, reason: '미선택', manual: false };
  }
  function pairFor(id, day) { return cleanDay(day).pairs.find(pair => pair.from === id || pair.to === id) || null; }
  function incomingPairs(id, day) { return cleanDay(day).pairs.filter(pair => pair.to === id && pair.status === 'pending'); }
  function separateGroup(id, day) {
    const d = cleanDay(day);
    const joined = d.pairs.find(pair => pair.to === id && pair.status === 'accepted');
    const root = joined ? joined.from : id;
    const links = d.pairs.filter(pair => pair.from === root);
    return { root, members: [root, ...links.filter(pair => pair.status === 'accepted').map(pair => pair.to)],
      pending: links.filter(pair => pair.status === 'pending'), pairs: links, venue: d.separateVenues[root] || null };
  }
  function participants(date, day, config) { return MEMBERS.filter(m => memberStatus(m.id, date, day, config).in); }
  function places(day) { return PLACES.concat((day || emptyDay()).extras || []); }
  function tally(date, day, config) {
    const result = Object.fromEntries(PLACES.map(p => [p.id, []]));
    participants(date, day, config).forEach(m => { const p = day.votes[m.id]; if (result[p]) result[p].push(m.id); });
    return result;
  }
  function applyOperation(value, date, config, op, now) {
    if (!validDate(date)) throw new Error('날짜 형식이 잘못되었습니다.');
    if (!op || !MEMBERS.some(m => m.id === op.actor)) throw new Error('먼저 내 이름을 선택해 주세요.');
    const d = cleanDay(value), p = op.payload || {}; const hasPlace = id => places(d).some(x => x.id === id);
    switch (op.type) {
      case 'availability':
        if (!['auto'].concat(OVERRIDE_VALUES).includes(p.value)) throw new Error('참석 상태를 확인해 주세요.');
        d.pairs = d.pairs.filter(pair => pair.from !== op.actor && pair.to !== op.actor);
        delete d.separateVenues[op.actor];
        if (p.value === 'auto') delete d.overrides[op.actor]; else d.overrides[op.actor] = p.value;
        if (p.value === 'out') d.absenceReasons[op.actor] = String(p.reason || '').trim().slice(0, 60);
        else delete d.absenceReasons[op.actor];
        break;
      case 'ceo': if (typeof p.cancelled !== 'boolean') throw new Error('일정을 확인해 주세요.'); d.ceoCancelled = p.cancelled; break;
      case 'pairInvite': {
        if (typeof p.id !== 'string' || !PAIR_ID.test(p.id)) throw new Error('초대 번호를 확인해 주세요.');
        if (!MEMBER_IDS.has(p.to) || p.to === op.actor) throw new Error('함께 따로 먹을 다른 멤버를 선택해 주세요.');
        if (d.pairs.some(pair => pair.id === p.id)) throw new Error('이미 사용 중인 초대 번호예요. 새로고침 후 다시 초대해 주세요.');
        if (pairFor(op.actor, d)) throw new Error('진행 중인 초대나 함께 먹을 짝이 있어요. 먼저 취소하거나 나가 주세요.');
        if (pairFor(p.to, d)) throw new Error('상대에게 진행 중인 초대나 함께 먹을 짝이 있어요. 다른 멤버를 선택해 주세요.');
        d.overrides[op.actor] = 'separate'; delete d.absenceReasons[op.actor];
        d.pairs.push({ id: p.id, from: op.actor, to: p.to, status: 'pending' });
        break;
      }
      case 'groupInvite': {
        if (!Array.isArray(p.invites) || !p.invites.length || p.invites.length >= MEMBERS.length) throw new Error('초대할 동료를 한 명 이상 선택해 주세요.');
        const current = pairFor(op.actor, d);
        if (current && current.from !== op.actor) throw new Error('다른 모임에 초대받거나 참여 중이에요. 먼저 초대를 처리하거나 나가 주세요.');
        const invited = new Set(), ids = new Set(d.pairs.map(pair => pair.id));
        p.invites.forEach(item => {
          if (!item || typeof item.id !== 'string' || !PAIR_ID.test(item.id)) throw new Error('초대 번호를 확인해 주세요.');
          if (!MEMBER_IDS.has(item.to) || item.to === op.actor || invited.has(item.to)) throw new Error('서로 다른 동료를 선택해 주세요.');
          if (ids.has(item.id) || pairFor(item.to, d)) throw new Error('이미 다른 모임에 있거나 초대받은 동료가 포함되어 있어요.');
          invited.add(item.to); ids.add(item.id);
        });
        d.overrides[op.actor] = 'separate'; delete d.absenceReasons[op.actor];
        p.invites.forEach(item => d.pairs.push({ id: item.id, from: op.actor, to: item.to, status: 'pending' }));
        break;
      }
      case 'pairAccept':
      case 'pairDecline':
      case 'pairCancel':
      case 'pairLeave': {
        if (typeof p.pairId !== 'string' || !PAIR_ID.test(p.pairId)) throw new Error('초대 번호를 확인해 주세요.');
        const pair = d.pairs.find(item => item.id === p.pairId);
        if (!pair) throw new Error('초대나 짝이 이미 변경됐어요. 새로고침 후 확인해 주세요.');
        if (op.type === 'pairLeave') {
          if (pair.status !== 'accepted') throw new Error('수락한 짝에서만 나갈 수 있어요.');
          if (pair.from !== op.actor && pair.to !== op.actor) throw new Error('본인이 속한 짝에서만 나갈 수 있어요.');
          d.pairs = d.pairs.filter(item => item.id !== pair.id && (pair.from !== op.actor || item.from !== op.actor));
          delete d.separateVenues[op.actor];
          d.overrides[op.actor] = 'pending'; delete d.absenceReasons[op.actor];
        } else {
          if (pair.status !== 'pending') throw new Error('초대가 이미 처리됐어요. 새로고침 후 확인해 주세요.');
          if (op.type === 'pairCancel' ? pair.from !== op.actor : pair.to !== op.actor) throw new Error(op.type === 'pairCancel' ? '초대한 본인만 초대를 취소할 수 있어요.' : '초대받은 본인만 수락하거나 거절할 수 있어요.');
          if (op.type === 'pairAccept') {
            pair.status = 'accepted';
            d.overrides[pair.from] = 'separate'; d.overrides[pair.to] = 'separate';
            delete d.separateVenues[pair.to];
            delete d.absenceReasons[pair.from]; delete d.absenceReasons[pair.to];
          } else d.pairs = d.pairs.filter(item => item.id !== pair.id);
        }
        break;
      }
      case 'vote':
        if (!memberStatus(op.actor, date, d, config).in) throw new Error('오늘 함께 먹는 상태로 바꾼 뒤 선택해 주세요.');
        if (!PLACES.some(place => place.id === p.placeId)) throw new Error('일반 점심은 메가존 또는 런치타임만 선택할 수 있어요.');
        d.votes[op.actor] = p.placeId; break;
      case 'ceoDecision': {
        if (memberStatus(op.actor, date, d, config).kind !== 'ceo') throw new Error('해당 날짜의 대표님 점심 참석자만 장소를 확정할 수 있어요.');
        const match = typeof p.placeId === 'string' && p.placeId.match(GUIDE_ID);
        if (!match || p.url !== `https://m.place.naver.com/place/${match[1]}/home` || typeof p.name !== 'string' || !p.name.trim()) throw new Error('과천 맛집 목록에서 식당을 다시 선택해 주세요.');
        if (!TIME.test(p.time || '')) throw new Error('대표님 점심 시간을 확인해 주세요.');
        d.ceoDecision = { placeId: p.placeId, name: p.name.trim().slice(0, 60), url: p.url,
          category: typeof p.category === 'string' ? p.category.slice(0, 20) : '', time: p.time,
          actor: op.actor, at: now || new Date().toISOString() };
        break;
      }
      case 'ceoUnconfirm':
        if (memberStatus(op.actor, date, d, config).kind !== 'ceo') throw new Error('해당 날짜의 대표님 점심 참석자만 장소 확정을 취소할 수 있어요.');
        d.ceoDecision = null; break;
      case 'separateVenue': {
        if (memberStatus(op.actor, date, d, config).kind !== 'separate') throw new Error('먼저 따로 먹기를 선택해 주세요.');
        const match = typeof p.placeId === 'string' && p.placeId.match(GUIDE_ID);
        if (!match || p.url !== `https://m.place.naver.com/place/${match[1]}/home` || typeof p.name !== 'string' || !p.name.trim()) throw new Error('과천 맛집 목록에서 식당을 다시 선택해 주세요.');
        const root = separateGroup(op.actor, d).root;
        d.separateVenues[root] = { placeId: p.placeId, name: p.name.trim().slice(0, 60), url: p.url,
          category: typeof p.category === 'string' ? p.category.slice(0, 20) : '', actor: op.actor, at: now || new Date().toISOString() };
        break;
      }
      case 'separateUnconfirm': {
        if (memberStatus(op.actor, date, d, config).kind !== 'separate') throw new Error('따로 먹는 모임의 참석자만 장소를 변경할 수 있어요.');
        delete d.separateVenues[separateGroup(op.actor, d).root]; break;
      }
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
        if (!memberStatus(op.actor, date, d, config).in) throw new Error('함께 먹는 상태로 바꾼 뒤 점심을 확정해 주세요.');
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
  return { MEMBERS, PLACES, DEFAULT_SETTINGS, WELPLAN, clone, validDate, today, weekday, shiftDate, weekDates, settings, emptyDay, cleanDay, safeUrl, memberStatus, pairFor, incomingPairs, separateGroup, participants, places, tally, applyOperation, parseMenuMarkdown, menuUrl };
});

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

/* Append this file after core.js and lunchtime-source.js to create the copy/paste Code.gs. */
const TEAM_KEY = '__TEAM_KEY__';
const DATA_PREFIX = 'LUNCH_DAY_';
const KEEP_DAYS = 90;
const MENU_IMAGE_PREFIX = 'LUNCH_MENU_IMAGE_';
const MENU_IMAGE_FOLDER_KEY = 'LUNCH_MENU_IMAGE_FOLDER';
const MENU_IMAGE_FOLDER_MARKER = 'SANDS_LUNCH_MENU_IMAGES_V1';
const MENU_IMAGE_FILE_MARKER = 'SANDS_LUNCH_MENU_IMAGE_V1:';
const MENU_IMAGE_MAX_BYTES = 1024 * 1024;
const MENU_IMAGE_MAX_REQUEST = 1572864;
const MENU_IMAGE_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const KAKAO_PROFILE_KEY = 'LUNCH_KAKAO_PROFILE';
const KAKAO_PROFILE_CACHE_KEY = 'lunch_kakao_profile_v1';
const KAKAO_PROFILE_TTL = 5 * 60000;
const KAKAO_PROFILE_MIN_INTERVAL = 60000;
const KAKAO_PROFILE_ERROR = '카카오 채널의 최신 프로필 사진을 가져오지 못했어요. 잠시 후 다시 확인하거나 카카오 원문을 열어 주세요.';

function initializeLunchClub() {
  if (!/^[a-f0-9]{48,64}$/.test(TEAM_KEY)) throw new Error('setup.html의 코드 복사 버튼으로 만든 코드를 붙여넣어 주세요.');
  const properties = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Run again after upgrading: Apps Script must authorize Drive before deployment.
    menuImageFolder_(properties, properties.getProperties(), true);
    properties.setProperty('LUNCH_INSTALLED', new Date().toISOString());
  } finally { lock.releaseLock(); }
  UrlFetchApp.fetch('https://welplan.pmh.codes/api/health', { muteHttpExceptions: true });
  console.log('점심판 준비 완료. 배포 > 새 배포 > 웹 앱에서 실행 사용자: 나 / 액세스: 모든 사용자로 배포하세요.');
}

function output_(body, callback) {
  const text = JSON.stringify(body).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  if (callback && /^lunchReply_[a-f0-9]{24}$/.test(callback)) return ContentService.createTextOutput(callback + '(' + text + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function authorized_(key) { return /^[a-f0-9]{48,64}$/.test(TEAM_KEY) && typeof key === 'string' && key === TEAM_KEY; }
function kakaoProfileRecord_(text) {
  let value = {}; try { value = JSON.parse(text || '{}') || {}; } catch (_) {}
  let profile = null;
  const p = value.profile, checked = p && typeof p.checkedAt === 'string' ? Date.parse(p.checkedAt) : NaN;
  if (typeof LunchKakaoSource !== 'undefined' && p && p.sourceUrl === LunchKakaoSource.SOURCE_URL && LunchKakaoSource.validImageURL(p.imageUrl) && Number.isFinite(checked) && checked <= Date.now() + 60000) {
    profile = { ok: true, sourceUrl: LunchKakaoSource.SOURCE_URL, imageUrl: p.imageUrl, checkedAt: new Date(checked).toISOString() };
  }
  const attempted = typeof value.attemptedAt === 'string' ? Date.parse(value.attemptedAt) : NaN;
  return { profile: profile, attemptedAt: Number.isFinite(attempted) && attempted <= Date.now() + 60000 ? new Date(attempted).toISOString() : null, requestId: typeof value.requestId === 'string' && MENU_IMAGE_UUID.test(value.requestId) ? value.requestId : '', pending: value.pending === true, error: typeof value.error === 'string' ? value.error.slice(0, 160) : '' };
}
function kakaoProfileReusable_(record, force) {
  const now = Date.now(), attempted = Date.parse(record.attemptedAt), checked = record.profile && Date.parse(record.profile.checkedAt);
  if (Number.isFinite(attempted) && now - attempted < KAKAO_PROFILE_MIN_INTERVAL) return true;
  return !force && !record.pending && !record.error && record.profile && now - checked < KAKAO_PROFILE_TTL;
}
function kakaoProfileResult_(record) {
  if (!record.profile && record.pending) return { ok: false, pending: true, retryAfter: 2, error: '카카오 프로필 사진을 확인하고 있어요. 잠시 후 다시 불러와 주세요.' };
  if (!record.profile) return { ok: false, error: record.error || KAKAO_PROFILE_ERROR };
  const profile = { ok: true, sourceUrl: record.profile.sourceUrl, imageUrl: record.profile.imageUrl, checkedAt: record.profile.checkedAt };
  if (record.error) profile.error = true;
  return { ok: true, profile: profile };
}
function cacheKakaoProfile_(record) {
  try { CacheService.getScriptCache().put(KAKAO_PROFILE_CACHE_KEY, JSON.stringify(record), record.error || record.pending ? 60 : 300); } catch (_) {}
}
function kakaoProfileResponse_(force) {
  if (typeof LunchKakaoSource === 'undefined') return { ok: false, error: '카카오 자동 식단 기능을 사용하려면 공유 서버 코드를 최신 버전으로 업데이트해 주세요.' };
  if (!force) {
    try {
      const cached = kakaoProfileRecord_(CacheService.getScriptCache().get(KAKAO_PROFILE_CACHE_KEY));
      if (kakaoProfileReusable_(cached, false)) return kakaoProfileResult_(cached);
    } catch (_) {}
  }
  const properties = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock();
  let record = kakaoProfileRecord_(properties.getProperties()[KAKAO_PROFILE_KEY]), requestId;
  if (kakaoProfileReusable_(record, force)) return kakaoProfileResult_(record);
  try {
    // Reserve a request briefly; external network I/O must not hold up attendance writes.
    lock.waitLock(1000);
    try {
      record = kakaoProfileRecord_(properties.getProperties()[KAKAO_PROFILE_KEY]);
      if (kakaoProfileReusable_(record, force)) return kakaoProfileResult_(record);
      requestId = Utilities.getUuid();
      record.attemptedAt = new Date().toISOString(); record.requestId = requestId; record.pending = true;
      properties.setProperty(KAKAO_PROFILE_KEY, JSON.stringify(record));
    } finally { lock.releaseLock(); }
    let profile = null, error = '';
    try {
      const response = UrlFetchApp.fetch(LunchKakaoSource.HOME_ENDPOINT, { headers: LunchKakaoSource.REQUEST_HEADERS, muteHttpExceptions: true, followRedirects: false, timeoutSeconds: 12 });
      if (response.getResponseCode() !== 200) throw new Error('source status');
      const headers = response.getAllHeaders(), header = name => {
        const key = Object.keys(headers).find(k => k.toLowerCase() === name);
        const value = key ? headers[key] : ''; return String(Array.isArray(value) ? value[0] : value);
      };
      if (header('content-type').split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('source content type');
      const maxBytes = Math.min(LunchKakaoSource.MAX_RESPONSE_BYTES, 512 * 1024), length = Number(header('content-length'));
      if (Number.isFinite(length) && length > maxBytes) throw new Error('source size');
      const raw = response.getContentText();
      if (typeof raw !== 'string' || raw.length > maxBytes || Utilities.newBlob(raw).getBytes().length > maxBytes) throw new Error('source size');
      const normalized = LunchKakaoSource.normalizeProfile(raw);
      profile = { ok: true, sourceUrl: normalized.sourceUrl, imageUrl: normalized.imageUrl, checkedAt: new Date().toISOString() };
    } catch (_) { error = KAKAO_PROFILE_ERROR; }
    lock.waitLock(1000);
    try {
      const latest = kakaoProfileRecord_(properties.getProperties()[KAKAO_PROFILE_KEY]);
      // If an execution outlives the minimum interval, its late result cannot replace a newer request.
      if (latest.requestId !== requestId) return kakaoProfileResult_(latest);
      record = latest;
      if (profile) record.profile = profile;
      record.pending = false; record.error = error;
      properties.setProperty(KAKAO_PROFILE_KEY, JSON.stringify(record));
      cacheKakaoProfile_(record);
      return kakaoProfileResult_(record);
    } finally { lock.releaseLock(); }
  } catch (_) {
    return kakaoProfileResult_({ profile: record.profile, pending: false, error: KAKAO_PROFILE_ERROR });
  }
}
function menuImageSlot_(date, scope) {
  if (!LunchCore.validDate(date) || !['day', 'week'].includes(scope)) throw new Error('식단 이미지 날짜와 적용 범위를 확인해 주세요.');
  const start = scope === 'week' ? LunchCore.weekDates(date)[0] : date;
  return { key: scope + ':' + start, property: MENU_IMAGE_PREFIX + scope + '_' + start, scope: scope, date: start, startDate: start, endDate: scope === 'week' ? LunchCore.shiftDate(start, 6) : start };
}
function menuImageEntry_(all, slot) {
  if (!all[slot.property]) return null;
  let entry; try { entry = JSON.parse(all[slot.property]); } catch (_) { throw new Error('저장된 식단 이미지 정보를 확인하지 못했어요. 운영자에게 문의해 주세요.'); }
  if (!entry || !MENU_IMAGE_UUID.test(entry.id || '') || entry.scope !== slot.scope || entry.date !== slot.date || entry.startDate !== slot.startDate || entry.endDate !== slot.endDate || typeof entry.fileId !== 'string' || !entry.fileId || typeof entry.folderId !== 'string' || !entry.folderId || !['image/jpeg', 'image/png', 'image/webp'].includes(entry.mimeType) || !Number.isInteger(entry.size) || entry.size < 1 || entry.size > MENU_IMAGE_MAX_BYTES) throw new Error('저장된 식단 이미지 정보를 확인하지 못했어요. 운영자에게 문의해 주세요.');
  return entry;
}
function publicMenuImage_(entry) {
  if (!entry) return null;
  const value = {};
  ['id', 'scope', 'date', 'startDate', 'endDate', 'name', 'mimeType', 'size', 'uploadedBy', 'uploadedAt'].forEach(k => { value[k] = entry[k]; });
  return value;
}
function menuImageState_(all, date, dates) {
  const slots = [menuImageSlot_(date, 'week')].concat(dates.map(d => menuImageSlot_(d, 'day'))), images = {};
  slots.forEach(slot => { const entry = menuImageEntry_(all, slot); if (entry) images[slot.key] = publicMenuImage_(entry); });
  return images;
}
function imageStorageError_() {
  return new Error('식단 이미지 저장소에 접근하지 못했어요. 운영자가 Apps Script에서 initializeLunchClub을 다시 실행해 Drive 권한을 허용한 뒤 새 버전으로 배포해 주세요.');
}
function menuImageFolder_(properties, all, create) {
  try {
    let folder;
    if (all[MENU_IMAGE_FOLDER_KEY]) {
      folder = DriveApp.getFolderById(all[MENU_IMAGE_FOLDER_KEY]);
      if (folder.isTrashed() || folder.getDescription() !== MENU_IMAGE_FOLDER_MARKER || folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('unavailable dedicated folder');
      return folder;
    }
    if (!create) throw new Error('folder not initialized');
    folder = DriveApp.createFolder('SANDS Lunch Club · 런치타임 식단');
    folder.setDescription(MENU_IMAGE_FOLDER_MARKER);
    // PRIVATE + VIEW is valid; PRIVATE + NONE is not supported by DriveApp.
    folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    properties.setProperty(MENU_IMAGE_FOLDER_KEY, folder.getId());
    all[MENU_IMAGE_FOLDER_KEY] = folder.getId();
    return folder;
  } catch (_) { throw imageStorageError_(); }
}
function menuImageSignature_(bytes, mime) {
  const b = i => (bytes[i] + 256) % 256;
  const is = (at, values) => values.every((n, i) => b(at + i) === n);
  if (mime === 'image/png') return bytes.length >= 24 && is(0, [137, 80, 78, 71, 13, 10, 26, 10]) && is(8, [0, 0, 0, 13, 73, 72, 68, 82]);
  if (mime === 'image/jpeg') return bytes.length >= 12 && is(0, [255, 216, 255]) && is(bytes.length - 2, [255, 217]);
  if (mime === 'image/webp') {
    const size = b(4) + b(5) * 256 + b(6) * 65536 + b(7) * 16777216;
    return bytes.length >= 20 && is(0, [82, 73, 70, 70]) && is(8, [87, 69, 66, 80]) && size === bytes.length - 8 && (is(12, [86, 80, 56, 32]) || is(12, [86, 80, 56, 76]) || is(12, [86, 80, 56, 88]));
  }
  return false;
}
function decodeMenuImage_(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > 4 * Math.ceil(MENU_IMAGE_MAX_BYTES / 3) + 32) throw new Error('식단 이미지는 압축 후 1MB 이하로 올려 주세요.');
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0) throw new Error('JPG·PNG·WEBP 형식의 식단 사진을 선택해 주세요.');
  const base64 = match[2], padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  if (base64.length / 4 * 3 - padding > MENU_IMAGE_MAX_BYTES) throw new Error('식단 이미지는 압축 후 1MB 이하로 올려 주세요.');
  let bytes;
  try { bytes = Utilities.base64Decode(base64); } catch (_) { throw new Error('이미지 파일을 읽지 못했어요. 사진을 다시 선택해 주세요.'); }
  if (!bytes.length || Utilities.base64Encode(bytes) !== base64 || !menuImageSignature_(bytes, match[1])) throw new Error('이미지 형식과 파일 내용이 맞지 않아요. JPG·PNG·WEBP 사진을 다시 선택해 주세요.');
  return { bytes: bytes, mimeType: match[1] };
}
function menuImageTag_(entry) {
  return MENU_IMAGE_FILE_MARKER + JSON.stringify({ id: entry.id, slot: entry.scope + ':' + entry.date, endDate: entry.endDate, folderId: entry.folderId });
}
function ownsMenuImageFile_(file, entry, folderId) {
  if (entry.folderId !== folderId || file.getDescription() !== menuImageTag_(entry)) return false;
  const parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return true;
  return false;
}
function retireMenuImage_(entry, all) {
  try {
    const file = DriveApp.getFileById(entry.fileId);
    if (ownsMenuImageFile_(file, entry, all[MENU_IMAGE_FOLDER_KEY]) && !file.isTrashed()) file.setTrashed(true);
    return true;
  } catch (_) { return false; } // Leave inaccessible files for a later retention sweep.
}
function uploadMenuImage_(properties, all, date, op) {
  const p = op.payload || {}, slot = menuImageSlot_(date, p.scope), previous = menuImageEntry_(all, slot);
  // This also recovers a request whose metadata was saved before its receipt write failed.
  if (previous && previous.operationId === op.id && previous.operationDate === date && previous.uploadedBy === op.actor) return;
  if (typeof p.expectedImageId !== 'string' || (p.expectedImageId !== '' && !MENU_IMAGE_UUID.test(p.expectedImageId))) throw new Error('식단 이미지를 새로고침한 뒤 다시 올려 주세요.');
  if (p.expectedImageId !== (previous ? previous.id : '')) throw new Error('다른 멤버가 식단 이미지를 먼저 바꿨어요. 새로고침 후 새 이미지를 확인하고 다시 올려 주세요.');
  const decoded = decodeMenuImage_(p.dataUrl), folder = menuImageFolder_(properties, all, true);
  const name = typeof p.name === 'string' ? p.name.replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 100) : '';
  const entry = { id: Utilities.getUuid(), scope: slot.scope, date: slot.date, startDate: slot.startDate, endDate: slot.endDate, name: name || '런치타임 식단', mimeType: decoded.mimeType, size: decoded.bytes.length, uploadedBy: op.actor, uploadedAt: new Date().toISOString(), operationId: op.id, operationDate: date, folderId: folder.getId() };
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[entry.mimeType];
  let file;
  try {
    file = folder.createFile(Utilities.newBlob(decoded.bytes, entry.mimeType, 'LunchMenu_' + entry.scope + '_' + entry.date + '_' + entry.id + '.' + extension));
    file.setDescription(menuImageTag_(entry));
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    entry.fileId = file.getId();
    properties.setProperty(slot.property, JSON.stringify(entry));
    all[slot.property] = JSON.stringify(entry);
  } catch (_) {
    if (file) { try { file.setTrashed(true); } catch (_) {} }
    throw imageStorageError_();
  }
  // Old binary data is retired only after the new slot has been published successfully.
  if (previous) retireMenuImage_(previous, all);
}
function deleteMenuImage_(properties, all, date, op) {
  const p = op.payload || {}, slot = menuImageSlot_(date, p.scope);
  if (typeof p.expectedImageId !== 'string' || !MENU_IMAGE_UUID.test(p.expectedImageId)) throw new Error('삭제할 식단 이미지를 새로고침한 뒤 다시 확인해 주세요.');
  const entry = menuImageEntry_(all, slot);
  // An empty slot is already in the requested state, including a retry after receipt saving failed.
  if (!entry) return;
  if (entry.id !== p.expectedImageId) throw new Error('다른 멤버가 식단 이미지를 먼저 바꿨어요. 새로고침 후 현재 이미지를 확인하고 다시 삭제해 주세요.');
  let file, wasTrashed;
  try {
    const folder = menuImageFolder_(properties, all, false);
    file = DriveApp.getFileById(entry.fileId);
    if (!ownsMenuImageFile_(file, entry, folder.getId())) throw new Error('not an owned menu image');
    wasTrashed = file.isTrashed();
    if (!wasTrashed) file.setTrashed(true);
  } catch (_) { throw imageStorageError_(); }
  try {
    properties.deleteProperty(slot.property);
    delete all[slot.property];
  } catch (_) {
    // Keep the original visible image when metadata removal fails. If restoration also
    // fails, a new delete request can finish removing this same, already-trashed image.
    if (!wasTrashed) { try { file.setTrashed(false); } catch (_) {} }
    throw new Error('식단 이미지 삭제를 완료하지 못했어요. 새로고침한 뒤 다시 삭제해 주세요. 계속 실패하면 운영자에게 문의해 주세요.');
  }
}
function menuImageResponse_(date, scope, imageId) {
  if (!MENU_IMAGE_UUID.test(imageId || '')) throw new Error('식단 이미지를 새로고침한 뒤 다시 열어 주세요.');
  const slot = menuImageSlot_(date, scope), lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const properties = PropertiesService.getScriptProperties(), all = properties.getProperties(), entry = menuImageEntry_(all, slot);
    if (!entry || entry.id !== imageId) throw new Error('식단 이미지가 바뀌었어요. 새로고침한 후 다시 열어 주세요.');
    let bytes;
    try {
      const folder = menuImageFolder_(properties, all, false), file = DriveApp.getFileById(entry.fileId);
      if (file.isTrashed() || !ownsMenuImageFile_(file, entry, folder.getId()) || file.getSize() !== entry.size || file.getMimeType() !== entry.mimeType || file.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('unavailable image');
      bytes = file.getBlob().getBytes();
      if (bytes.length !== entry.size || !menuImageSignature_(bytes, entry.mimeType)) throw new Error('invalid image');
    } catch (_) { throw imageStorageError_(); }
    return { ok: true, image: Object.assign(publicMenuImage_(entry), { dataUrl: 'data:' + entry.mimeType + ';base64,' + Utilities.base64Encode(bytes) }) };
  } finally { lock.releaseLock(); }
}
function pruneMenuImages_(properties, all, keepDate) {
  const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'), cutoff = LunchCore.shiftDate(today, -KEEP_DAYS);
  const keep = [menuImageSlot_(keepDate, 'day').key, menuImageSlot_(keepDate, 'week').key];
  Object.keys(all).forEach(key => {
    const match = /^LUNCH_MENU_IMAGE_(day|week)_(20\d{2}-\d{2}-\d{2})$/.exec(key);
    if (!match || !LunchCore.validDate(match[2])) return;
    const slot = menuImageSlot_(match[2], match[1]);
    if (key !== slot.property || keep.includes(slot.key) || slot.endDate >= cutoff) return;
    let entry; try { entry = menuImageEntry_(all, slot); } catch (_) { return; }
    if (!entry || retireMenuImage_(entry, all)) { properties.deleteProperty(key); delete all[key]; }
  });
  // At most once per day, retire old owned leftovers from interrupted requests.
  if (!all[MENU_IMAGE_FOLDER_KEY] || all.LUNCH_MENU_IMAGE_LAST_PRUNE === today) return;
  try {
    const folder = menuImageFolder_(properties, all, false), files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next(), description = file.getDescription();
      if (!description.startsWith(MENU_IMAGE_FILE_MARKER)) continue;
      let tag; try { tag = JSON.parse(description.slice(MENU_IMAGE_FILE_MARKER.length)); } catch (_) { continue; }
      const match = /^(day|week):(20\d{2}-\d{2}-\d{2})$/.exec(tag.slot || '');
      if (!match || !MENU_IMAGE_UUID.test(tag.id || '') || !LunchCore.validDate(match[2]) || tag.folderId !== folder.getId()) continue;
      const slot = menuImageSlot_(match[2], match[1]);
      if (slot.key !== tag.slot || tag.endDate !== slot.endDate || slot.endDate >= cutoff || keep.includes(slot.key)) continue;
      // Only files created by this feature in this dedicated folder have this exact tag.
      if (file.getDateCreated().getTime() < Date.parse(cutoff + 'T00:00:00+09:00')) file.setTrashed(true);
    }
    properties.setProperty('LUNCH_MENU_IMAGE_LAST_PRUNE', today);
  } catch (_) { /* Image housekeeping must not block votes when Drive is unavailable. */ }
}
function getConfig_(all) {
  let value = {}; try { value = JSON.parse(all.LUNCH_CONFIG || '{}'); } catch (_) {}
  return { settings: LunchCore.settings(value.settings), revision: Number.isInteger(value.revision) ? value.revision : 0 };
}
function getRecord_(all, date) {
  const prefix = DATA_PREFIX + date;
  if (!all[prefix]) return { data: LunchCore.emptyDay(), receipts: {} };
  const meta = JSON.parse(all[prefix]);
  let json = ''; for (let i = 0; i < meta.parts; i++) {
    const part = all[prefix + '_' + meta.generation + '_' + i];
    if (typeof part !== 'string') throw new Error('저장 기록을 읽는 중입니다. 잠시 후 다시 시도해 주세요.');
    json += part;
  }
  const result = JSON.parse(json); result.data = LunchCore.cleanDay(result.data); result.receipts = result.receipts || {}; return result;
}
function saveRecord_(properties, all, date, record) {
  const json = JSON.stringify(record);
  if (Utilities.newBlob(json).getBytes().length > 42000) throw new Error('하루 기록이 너무 큽니다. 긴 지도 링크나 메뉴 메모를 줄여 주세요.');
  const chars = Array.from(json), prefix = DATA_PREFIX + date, generation = Utilities.getUuid().replace(/-/g, '').slice(0, 12), values = {};
  const parts = Math.ceil(chars.length / 1500);
  values[prefix] = JSON.stringify({ parts: parts, generation: generation });
  for (let i = 0; i < parts; i++) values[prefix + '_' + generation + '_' + i] = chars.slice(i * 1500, (i + 1) * 1500).join('');
  properties.setProperties(values, false);
  // Readers use one getProperties snapshot; old generations are removed after publishing metadata.
  Object.keys(all).filter(k => k.startsWith(prefix + '_')).forEach(k => properties.deleteProperty(k));
}
function prune_(properties, all, keepDate) {
  const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  const cutoff = LunchCore.shiftDate(today, -KEEP_DAYS);
  const dates = Object.keys(all).filter(k => /^LUNCH_DAY_20\d{2}-\d{2}-\d{2}$/.test(k)).map(k => k.slice(DATA_PREFIX.length)).sort();
  dates.filter((date, i) => date !== keepDate && (date < cutoff || i < dates.length - 89)).forEach(date => {
    const prefix = DATA_PREFIX + date;
    Object.keys(all).filter(k => k === prefix || k.startsWith(prefix + '_')).forEach(k => properties.deleteProperty(k));
  });
  pruneMenuImages_(properties, all, keepDate);
}
function stateResponse_(date, receiptId) {
  const all = PropertiesService.getScriptProperties().getProperties(), cfg = getConfig_(all), dates = LunchCore.weekDates(date);
  if (!dates.includes(date)) dates.push(date);
  const days = {}; dates.forEach(d => { days[d] = getRecord_(all, d).data; });
  const receipt = receiptId ? getRecord_(all, date).receipts[receiptId] || null : null;
  return { ok: true, serverVersion: 5, features: { menuImages: true, menuImageDelete: true, explicitAttendance: true, lunchPairs: true, kakaoProfile: true, ceoVenue: true, separateGroups: true, separateVenues: true }, days: days, menuImages: menuImageState_(all, date, dates), settings: cfg.settings, configRevision: cfg.revision, receipt: receipt, serverTime: new Date().toISOString() };
}
function menuResponse_(date) {
  const cache = CacheService.getScriptCache(), cacheKey = 'menu_' + date;
  const previous = cache.get(cacheKey); if (previous) return { ok: true, menu: JSON.parse(previous) };
  const url = LunchCore.menuUrl(date);
  const response = UrlFetchApp.fetch(url, { headers: { Accept: 'text/markdown' }, muteHttpExceptions: true, followRedirects: true });
  if (response.getResponseCode() !== 200) throw new Error('식단 원본에 연결하지 못했어요. 원문 식단에서 확인해 주세요.');
  const text = response.getContentText();
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)), d = Number(date.slice(8, 10));
  if (!text.includes(y + '년 ' + m + '월 ' + d + '일') || !text.includes('메가존산학연센터') || !text.includes('- Vendor:')) throw new Error('선택한 날짜의 식단 원문을 확인하지 못했어요.');
  const menu = { date: date, dishes: LunchCore.parseMenuMarkdown(text), fetchedAt: new Date().toISOString(), source: url };
  cache.put(cacheKey, JSON.stringify(menu), 600);
  return { ok: true, menu: menu };
}
function doGet(e) {
  const p = (e || {}).parameter || {}, callback = p.callback || '';
  try {
    if (callback && !/^lunchReply_[a-f0-9]{24}$/.test(callback)) return output_({ ok: false, error: '콜백 형식이 올바르지 않습니다.' });
    if (!authorized_(p.key)) return output_({ ok: false, error: '팀 키가 맞지 않아요. 초대 링크 또는 연결 설정을 확인해 주세요.' }, callback);
    if (p.action === 'kakaoProfile') return output_(kakaoProfileResponse_(p.force === '1'), callback);
    if (!LunchCore.validDate(p.date)) return output_({ ok: false, error: '날짜 형식이 올바르지 않습니다.' }, callback);
    if (p.action === 'menu') return output_(menuResponse_(p.date), callback);
    if (p.action === 'menuImage') return output_(menuImageResponse_(p.date, p.scope, p.imageId), callback);
    if (p.action === 'state') return output_(stateResponse_(p.date, p.receipt), callback);
    return output_({ ok: false, error: '지원하지 않는 조회입니다.' }, callback);
  } catch (error) { return output_({ ok: false, error: error.message || '조회에 실패했어요. 다시 시도해 주세요.' }, callback); }
}
function doPost(e) {
  let lock;
  try {
    const raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || !raw || raw.length > MENU_IMAGE_MAX_REQUEST) throw new Error('요청 크기가 올바르지 않습니다.');
    const body = JSON.parse(raw);
    if ((!body.op || body.op.type !== 'menuImageUpload') && raw.length > 10000) throw new Error('요청 크기가 올바르지 않습니다.');
    if (body.op && body.op.type === 'menuImageUpload' && Utilities.newBlob(raw).getBytes().length > MENU_IMAGE_MAX_REQUEST) throw new Error('요청 크기가 올바르지 않습니다.');
    if (!authorized_(body.key)) throw new Error('팀 키가 맞지 않습니다.');
    if (!LunchCore.validDate(body.date) || !body.op || !/^[a-f0-9]{24}$/.test(body.op.id || '')) throw new Error('요청 형식이 올바르지 않습니다.');
    if (!LunchCore.MEMBERS.some(m => m.id === body.op.actor)) throw new Error('멤버가 올바르지 않습니다.');
    lock = LockService.getScriptLock(); lock.waitLock(20000);
    const properties = PropertiesService.getScriptProperties(), all = properties.getProperties(), cfg = getConfig_(all), record = getRecord_(all, body.date);
    if (record.receipts[body.op.id]) return output_({ ok: true, duplicate: true });
    let receipt;
    try {
      if (body.op.type === 'menuImageUpload') uploadMenuImage_(properties, all, body.date, body.op);
      else if (body.op.type === 'menuImageDelete') deleteMenuImage_(properties, all, body.date, body.op);
      else if (body.op.type === 'settings') {
        const p = body.op.payload || {};
        if (body.configRevision !== cfg.revision) throw new Error('다른 멤버가 기본 일정을 먼저 바꿨어요. 설정을 다시 열어 저장해 주세요.');
        if (!LunchCore.validDate(p.scheduleEnd) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.meetingTime || '') || !p.ceoDays) throw new Error('기본 일정 정보를 확인해 주세요.');
        const newConfig = { settings: LunchCore.settings(p), revision: cfg.revision + 1 };
        properties.setProperty('LUNCH_CONFIG', JSON.stringify(newConfig));
      } else record.data = LunchCore.applyOperation(record.data, body.date, cfg.settings, body.op, new Date().toISOString());
      receipt = { ok: true, at: new Date().toISOString() };
    } catch (error) { receipt = { ok: false, error: String(error.message).slice(0, 160), at: new Date().toISOString() }; }
    const ids = Object.keys(record.receipts); while (ids.length >= 16) delete record.receipts[ids.shift()];
    record.receipts[body.op.id] = receipt;
    // A confirmed image deletion must affect only that image, even if other slots are old.
    if (body.op.type !== 'menuImageDelete') prune_(properties, all, body.date);
    saveRecord_(properties, all, body.date, record);
    return output_({ ok: true, accepted: true });
  } catch (error) { return output_({ ok: false, error: error.message || '저장하지 못했어요. 다시 시도해 주세요.' }); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
