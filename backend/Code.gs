// SANDS Lunch Club backend. Generated from core.js + lunchtime-source.js + threads-menu-source.js + menu-source.js + backend/welstory.js + backend/server.js.
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
  const JOIN_ID = /^join_[a-f0-9]{24}$/;
  const OVERRIDE_VALUES = ['in', 'out', 'ceo', 'pending', 'separate'];
  const GUIDE_ID = /^guide_(\d{5,20})$/;
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  const DEFAULT_SETTINGS = {
    scheduleEnd: '2026-12-31',
    ceoDays: Object.fromEntries(MEMBERS.map(m => [m.id, m.days])),
    meetingTime: '12:00'
  };
  // 메가존 식단은 공유 서버가 웰스토리플러스에서 가져옵니다(menu-source.js, backend/welstory.js).
  const MEGAZONE_MAP = 'https://map.naver.com/p/search/' + encodeURIComponent('메가존산학연센터');
  const PLACES = [
    { id: 'megazone', name: '메가존', subtitle: '메가존산학연센터 · 삼성웰스토리', url: MEGAZONE_MAP, type: 'cafeteria' },
    { id: 'lunchtime', name: '런치타임', subtitle: '과천 어반허브 구내식당', url: 'https://naver.me/Fr054Jzy', menuUrl: 'https://pf.kakao.com/_xbbMPn', type: 'buffet' },
    { id: 'gangnambab', name: '강남밥상', subtitle: 'Threads 최신 게시물 · 메뉴 공지 화면 자동 보기', url: 'https://www.threads.com/@gangnambab', menuUrl: 'https://www.threads.com/@gangnambab', type: 'cafeteria' }
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
  function emptyDay() { return { ceoCancelled: false, overrides: {}, absenceReasons: {}, votes: {}, extras: [], decision: null, ceoDecision: null, separateVenues: {}, notes: {}, pairs: [], joinRequests: [], revision: 0, updatedAt: null }; }
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
    const requestIds = new Set(), requesters = new Set();
    (Array.isArray(v.joinRequests) ? v.joinRequests : []).slice(0, MEMBERS.length * MEMBERS.length).forEach(item => {
      if (!item || item.status !== 'pending' || typeof item.id !== 'string' || !JOIN_ID.test(item.id)
          || !MEMBER_IDS.has(item.from) || !MEMBER_IDS.has(item.to) || item.from === item.to
          || d.overrides[item.to] !== 'separate' || d.pairs.some(pair => pair.to === item.to && pair.status === 'accepted') || pairIds.has('pair_' + item.id.slice(5))
          || d.pairs.some(pair => pair.to === item.from && pair.status === 'accepted')
          || d.pairs.some(pair => pair.from === item.from) || requestIds.has(item.id) || requesters.has(item.from)) return;
      requestIds.add(item.id); requesters.add(item.from);
      d.joinRequests.push({ id: item.id, from: item.from, to: item.to, status: 'pending',
        at: typeof item.at === 'string' ? item.at.slice(0, 40) : '' });
    });
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
  function incomingJoinRequests(id, day) { return cleanDay(day).joinRequests.filter(request => request.to === id); }
  function myJoinRequest(id, day) { return cleanDay(day).joinRequests.find(request => request.from === id) || null; }
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
        d.joinRequests = d.joinRequests.filter(request => request.from !== op.actor && request.to !== op.actor);
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
            d.joinRequests = d.joinRequests.filter(request => request.from !== pair.to);
          } else d.pairs = d.pairs.filter(item => item.id !== pair.id);
        }
        break;
      }
      case 'joinRequest': {
        if (typeof p.id !== 'string' || !JOIN_ID.test(p.id) || !MEMBER_IDS.has(p.to) || p.to === op.actor) throw new Error('참여 요청 정보를 확인해 주세요.');
        if (d.joinRequests.some(req => req.id === p.id)) throw new Error('중복된 요청입니다. 화면을 새로고침해 주세요.');
        if (memberStatus(p.to, date, d, config).kind !== 'separate' || d.pairs.some(pair => pair.to === p.to && pair.status === 'accepted')) throw new Error('모임을 만든 분에게 참여 요청해 주세요.');
        if (pairFor(op.actor, d)) throw new Error('이미 다른 모임에 참여했거나 초대받았어요. 먼저 처리해 주세요.');
        if (d.joinRequests.some(req => req.from === op.actor)) throw new Error('이미 참여 요청 대기 중인 모임이 있어요. 먼저 취소해 주세요.');
        d.joinRequests.push({ id: p.id, from: op.actor, to: p.to, status: 'pending', at: now || new Date().toISOString() });
        break;
      }
      case 'joinApprove':
      case 'joinReject':
      case 'joinWithdraw': {
        if (typeof p.requestId !== 'string' || !JOIN_ID.test(p.requestId)) throw new Error('참여 요청 번호를 확인해 주세요.');
        const req = d.joinRequests.find(item => item.id === p.requestId);
        if (!req) throw new Error('요청이 이미 처리됐어요. 새로고침해 주세요.');
        if (op.type === 'joinWithdraw' ? req.from !== op.actor : req.to !== op.actor)
          throw new Error(op.type === 'joinWithdraw' ? '내가 보낸 요청만 취소할 수 있어요.' : '모임 생성자만 요청을 처리할 수 있어요.');
        if (op.type === 'joinApprove') {
          if (memberStatus(req.to, date, d, config).kind !== 'separate') throw new Error('모임 생성자가 현재 따로 먹기 상태가 아니에요.');
          if (pairFor(req.from, d)) throw new Error('요청자가 이미 다른 모임에 들어가 있거나 초대받았어요.');
          const pairId = 'pair_' + req.id.slice(5);
          if (d.pairs.some(pair => pair.id === pairId)) throw new Error('중복된 요청 번호입니다. 새로고침해 주세요.');
          d.pairs.push({ id: pairId, from: req.to, to: req.from, status: 'accepted' });
          d.overrides[req.from] = 'separate'; delete d.absenceReasons[req.from]; delete d.separateVenues[req.from];
        }
        d.joinRequests = d.joinRequests.filter(item => item.id !== req.id && (op.type !== 'joinApprove' || item.to !== req.from));
        break;
      }
      case 'vote':
        if (!memberStatus(op.actor, date, d, config).in) throw new Error('오늘 함께 먹는 상태로 바꾼 뒤 선택해 주세요.');
        if (!PLACES.some(place => place.id === p.placeId)) throw new Error('일반 점심은 메가존·런치타임·강남밥상 중 선택해 주세요.');
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
  return { MEMBERS, PLACES, DEFAULT_SETTINGS, MEGAZONE_MAP, clone, validDate, today, weekday, shiftDate, weekDates, settings, emptyDay, cleanDay, safeUrl, memberStatus, pairFor, incomingPairs, incomingJoinRequests, myJoinRequest, separateGroup, participants, places, tally, applyOperation };
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

/* 메가존산학연센터(삼성웰스토리) 점심 식단.
 * Welstory+ API는 회원 로그인이 필요하므로 팀 공유 서버(Apps Script, backend/welstory.js)만 호출합니다.
 * 이 파일은 브라우저와 Apps Script V8이 함께 사용합니다.
 * - Apps Script: parseMealList / lunchMealType으로 웰스토리 응답을 점심판 형식으로 정리합니다.
 * - 브라우저: fetchDay가 팀 키로 공유 서버에 요청하고, 돌아온 식단을 다시 검증합니다.
 * 사진은 공개 HTTPS 웰스토리 레시피 이미지 주소만 사용합니다.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LunchMenuSource = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RESTAURANT_ID = 'REST007327';
  const RESTAURANT_NAME = '메가존산학연센터';
  // Welstory+ 식사 시간 코드: 1 아침, 2 점심, 3 저녁 (getMealTimeList로 다시 확인합니다).
  const LUNCH_MEAL_TYPE = '2';
  const IMAGE_HOST = 'img-welmenu.welstory.com';
  const MAX_DISHES = 120;
  const MAX_COURSES = 20;
  const MAX_COMPONENTS = 30;

  function failure(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function invalid() {
    return failure('INVALID_RESPONSE', '식단 응답 형식이 바뀌어 확인하지 못했어요. 웰스토리플러스 앱에서 확인해 주세요.');
  }

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function text(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function dateKey(value) {
    if (typeof value !== 'string' || !/^(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(value)) {
      throw failure('INVALID_DATE', '식단 날짜를 확인해 주세요.');
    }
    const compact = value.replace(/-/g, '');
    const iso = compact.slice(0, 4) + '-' + compact.slice(4, 6) + '-' + compact.slice(6, 8);
    const parsed = new Date(iso + 'T00:00:00.000Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
      throw failure('INVALID_DATE', '식단 날짜를 확인해 주세요.');
    }
    return iso;
  }

  function validImageURL(value) {
    if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\\<>"']/.test(value)) return false;
    const match = /^https:\/\/([^/?#]+)(\/[^?#]*)(?:\?([^#]*))?$/i.exec(value);
    if (!match || match[1].toLowerCase() !== IMAGE_HOST) return false;
    // Verified Welstory recipe-photo host and path; no credentials, ports or traversal.
    if (!/^\/data\/manager\/recipe\/(?:[a-z0-9_-]+\/)+[a-z0-9_-]+\.(?:jpe?g|png|webp|gif)$/i.test(match[2])) return false;
    return match[3] === undefined || /^[a-z0-9._~!$&()*+,;=:@%/?-]*$/i.test(match[3]);
  }

  // Welstory gives a folder (photoUrl) and a file name (photoCd). Older responses use
  // http://samsungwelstory.com/...; the same recipe path is served over HTTPS by IMAGE_HOST.
  function imageURL(folder, file) {
    const base = text(folder), name = text(file);
    if (!base || !name) return '';
    const match = /^(?:https?:)?\/\/(?:www\.)?(?:samsungwelstory\.com|img-welmenu\.welstory\.com)(\/data\/manager\/recipe\/[^?#]*)$/i.exec(base);
    if (!match) return '';
    const url = 'https://' + IMAGE_HOST + match[1].replace(/\/?$/, '/') + name;
    return validImageURL(url) ? url : '';
  }

  // GET /api/menu/getMealTimeList -> { data: [{ code: '2', codeNm: '점심' }, ...] }
  function lunchMealType(raw) {
    const list = object(raw) && Array.isArray(raw.data) ? raw.data : raw;
    if (!Array.isArray(list)) return LUNCH_MEAL_TYPE;
    const lunch = list.find(function (item) {
      return object(item) && /^\d{1,2}$/.test(String(item.code)) && /점심|중식|lunch/i.test(text(item.codeNm));
    });
    return lunch ? String(lunch.code) : LUNCH_MEAL_TYPE;
  }

  function mealList(raw) {
    let payload = raw;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_) { throw invalid(); }
    }
    if (!object(payload)) throw invalid();
    // Welstory wraps responses as { code, message, data: { mealList: [...] } }.
    const data = Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
    if (!object(data) || !Array.isArray(data.mealList) || data.mealList.length > MAX_DISHES) throw invalid();
    return data.mealList;
  }

  function unique(values) {
    const seen = Object.create(null);
    return values.filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  // GET /api/meal?menuDt=YYYYMMDD&menuMealType=2&restaurantCode=REST007327
  // Each row is one dish; rows sharing hallNo + menuCourseType form one course.
  // An empty mealList for the requested date means no lunch is published yet.
  function parseMealList(raw, requestedDate, mealType) {
    const date = dateKey(requestedDate), compact = date.replace(/-/g, '');
    const wantedType = String(mealType || LUNCH_MEAL_TYPE);
    const groups = [], byKey = Object.create(null);
    mealList(raw).forEach(function (dish) {
      if (!object(dish) || !text(dish.menuName)) throw invalid();
      if (dish.restaurantCode !== undefined && dish.restaurantCode !== null &&
          String(dish.restaurantCode).toUpperCase() !== RESTAURANT_ID) {
        throw failure('LOCATION_MISMATCH', '다른 식당의 응답이어서 식단을 표시하지 않았어요.');
      }
      if (dish.menuDt !== undefined && dish.menuDt !== null && String(dish.menuDt).replace(/-/g, '') !== compact) {
        throw failure('DATE_MISMATCH', '요청한 날짜와 응답 날짜가 달라 식단을 표시하지 않았어요.');
      }
      if (dish.menuMealType !== undefined && dish.menuMealType !== null && String(dish.menuMealType) !== wantedType) return;
      const key = String(dish.hallNo || '') + '|' + String(dish.menuCourseType || '');
      if (!byKey[key]) { byKey[key] = []; groups.push(byKey[key]); }
      byKey[key].push(dish);
    });
    const courses = groups.slice(0, MAX_COURSES).map(function (dishes) {
      const main = dishes.find(function (dish) { return dish.typicalMenu === 'Y'; }) || dishes[0];
      const photo = [main].concat(dishes).map(function (dish) { return imageURL(dish.photoUrl, dish.photoCd); })
        .find(Boolean);
      const course = {
        name: text(main.menuName),
        components: unique([main].concat(dishes).map(function (dish) { return text(dish.menuName); })).slice(0, MAX_COMPONENTS)
      };
      if (photo) course.imageUrl = photo;
      if (dishes.some(function (dish) { return /^T/i.test(text(dish.salesType)); })) course.takeout = true;
      return course;
    });
    return {
      ok: true,
      date: date,
      dishes: unique(courses.map(function (course) { return course.name; })),
      courses: courses,
      fetchedAt: new Date().toISOString()
    };
  }

  // Re-validates a menu that came back from the team server before the page renders it.
  function cleanMenu(value, requestedDate) {
    const date = dateKey(requestedDate);
    if (!object(value) || value.date !== date || !Array.isArray(value.courses)) throw invalid();
    const courses = value.courses.slice(0, MAX_COURSES).map(function (course) {
      if (!object(course) || !text(course.name)) throw invalid();
      const result = {
        name: text(course.name),
        components: Array.isArray(course.components) ? unique(course.components.map(text)).slice(0, MAX_COMPONENTS) : []
      };
      if (validImageURL(course.imageUrl)) result.imageUrl = course.imageUrl;
      if (course.takeout === true) result.takeout = true;
      return result;
    });
    const fetched = Date.parse(value.fetchedAt);
    return {
      ok: true,
      date: date,
      dishes: unique(courses.map(function (course) { return course.name; })),
      courses: courses,
      fetchedAt: Number.isFinite(fetched) ? new Date(fetched).toISOString() : new Date().toISOString()
    };
  }

  // options.request(params) sends { action: 'menu', date } to the team server (JSONP in the page).
  async function fetchDay(requestedDate, options) {
    const date = dateKey(requestedDate);
    const request = (options || {}).request;
    if (typeof request !== 'function') {
      throw failure('NOT_CONNECTED', '메가존 식단은 팀 공유 연결 후 볼 수 있어요.');
    }
    let response;
    try {
      response = await request({ action: 'menu', date: date });
    } catch (error) {
      throw failure('NETWORK_ERROR', (error && error.message) || '공유 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    if (!object(response)) throw invalid();
    if (response.ok !== true) {
      const message = typeof response.error === 'string' && response.error.trim()
        ? response.error.trim().slice(0, 240) : '메가존 식단을 불러오지 못했어요.';
      throw failure(response.reason === 'setup' ? 'SETUP_REQUIRED' : 'PROVIDER_ERROR', message);
    }
    return cleanMenu(response.menu, date);
  }

  return Object.freeze({
    RESTAURANT_ID: RESTAURANT_ID,
    RESTAURANT_NAME: RESTAURANT_NAME,
    LUNCH_MEAL_TYPE: LUNCH_MEAL_TYPE,
    dateKey: dateKey,
    validImageURL: validImageURL,
    imageURL: imageURL,
    lunchMealType: lunchMealType,
    parseMealList: parseMealList,
    cleanMenu: cleanMenu,
    fetchDay: fetchDay
  });
});

/* 메가존 점심 식단: Welstory+ 회원 API를 Apps Script 서버에서만 호출합니다.
 * menu-source.js(LunchMenuSource) 다음, backend/server.js 앞에 붙여 Code.gs를 만듭니다.
 * 웰스토리 계정은 Apps Script > 프로젝트 설정 > 스크립트 속성에만 저장하고 GitHub 파일에는 넣지 않습니다.
 *   LUNCH_WELSTORY_USERNAME  웰스토리플러스 앱 로그인 아이디
 *   LUNCH_WELSTORY_PASSWORD  웰스토리플러스 앱 비밀번호
 * 나머지 LUNCH_WELSTORY_* 속성(기기 ID, 세션, 점심 코드, 로그인 일시 중지)은 서버가 자동으로 관리합니다.
 * 로그인은 세션이 없거나 만료될 때만 하고, 식단은 날짜별로 캐시해 웰스토리 요청을 최소화합니다.
 */
const WELSTORY_BASE = 'https://welplus.welstory.com';
const WELSTORY_USERNAME_PROPERTY = 'LUNCH_WELSTORY_USERNAME';
const WELSTORY_PASSWORD_PROPERTY = 'LUNCH_WELSTORY_PASSWORD';
const WELSTORY_DEVICE_PROPERTY = 'LUNCH_WELSTORY_DEVICE_ID';
const WELSTORY_SESSION_PROPERTY = 'LUNCH_WELSTORY_SESSION';
const WELSTORY_MEAL_TYPE_PROPERTY = 'LUNCH_WELSTORY_MEAL_TYPE';
const WELSTORY_PAUSE_PROPERTY = 'LUNCH_WELSTORY_LOGIN_PAUSE';
const WELSTORY_MENU_CACHE_PREFIX = 'lunch_welstory_menu_v1_';
const WELSTORY_MENU_TTL_SECONDS = 30 * 60;
const WELSTORY_PAST_MENU_TTL_SECONDS = 6 * 60 * 60;
const WELSTORY_ERROR_TTL_SECONDS = 2 * 60;
const WELSTORY_SESSION_MARGIN_MS = 5 * 60000;
const WELSTORY_DEFAULT_SESSION_MS = 50 * 60000;
// A rejected login is not retried for a while so a wrong password cannot lock the account.
const WELSTORY_LOGIN_PAUSE_MS = 30 * 60000;
const WELSTORY_SERVER_PAUSE_MS = 5 * 60000;
const WELSTORY_DEVICE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const WELSTORY_SETUP_ERROR = '메가존 식단을 보려면 Apps Script 스크립트 속성에 LUNCH_WELSTORY_USERNAME과 LUNCH_WELSTORY_PASSWORD를 등록해 주세요.';
const WELSTORY_NETWORK_ERROR = '웰스토리 식단 서버에 연결하지 못했어요. 잠시 후 다시 확인해 주세요.';

function welstoryError_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function welstoryHeader_(response, name) {
  const headers = response.getAllHeaders ? response.getAllHeaders() : {};
  const key = Object.keys(headers || {}).find(k => k.toLowerCase() === name);
  const value = key ? headers[key] : '';
  return String(Array.isArray(value) ? value[0] : value || '');
}
function welstoryCredentials_(properties) {
  const username = String(properties.getProperty(WELSTORY_USERNAME_PROPERTY) || '').trim();
  const password = String(properties.getProperty(WELSTORY_PASSWORD_PROPERTY) || '');
  if (!username || !password) throw welstoryError_('SETUP', WELSTORY_SETUP_ERROR);
  return { username: username, password: password };
}
function welstoryDeviceId_(properties) {
  let id = String(properties.getProperty(WELSTORY_DEVICE_PROPERTY) || '');
  if (!WELSTORY_DEVICE_ID.test(id)) {
    id = String(Utilities.getUuid()).toLowerCase();
    properties.setProperty(WELSTORY_DEVICE_PROPERTY, id);
  }
  return id;
}
function welstoryHeaders_(deviceId, token, extra) {
  const headers = { 'User-Agent': 'Welplus', 'X-Device-Id': deviceId, Accept: 'application/json' };
  if (token) headers.Authorization = token;
  Object.keys(extra || {}).forEach(k => { headers[k] = extra[k]; });
  return headers;
}
function welstoryTokenExpiry_(token) {
  try {
    const part = String(token).replace(/^Bearer\s+/i, '').split('.')[1] || '';
    const padded = part + '='.repeat((4 - part.length % 4) % 4);
    const exp = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString()).exp;
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
  } catch (_) { return 0; }
}
function welstorySessionRecord_(token, via) {
  const exp = welstoryTokenExpiry_(token);
  return { token: token, exp: exp > Date.now() ? exp : Date.now() + WELSTORY_DEFAULT_SESSION_MS, via: via, at: new Date().toISOString() };
}
function welstorySession_(properties) {
  let value = null;
  try { value = JSON.parse(properties.getProperty(WELSTORY_SESSION_PROPERTY) || 'null'); } catch (_) {}
  return value && typeof value.token === 'string' && value.token && Number.isFinite(value.exp) ? value : null;
}
// { until, reason: 'credentials' | 'server' }
function welstoryPauseState_(properties) {
  let value = null;
  try { value = JSON.parse(properties.getProperty(WELSTORY_PAUSE_PROPERTY) || 'null'); } catch (_) {}
  return value && Number.isFinite(value.until) && value.until > Date.now() ? value : null;
}
function welstoryPause_(properties, ms, reason) {
  properties.setProperty(WELSTORY_PAUSE_PROPERTY, JSON.stringify({ until: Date.now() + ms, reason: reason }));
}
function welstoryPausedError_(pause) {
  const time = Utilities.formatDate(new Date(pause.until), 'Asia/Seoul', 'HH:mm');
  if (pause.reason === 'server') return welstoryError_('LOGIN_PAUSED', '웰스토리 로그인 서버가 응답하지 않아 ' + time + ' 이후에 다시 시도해요.');
  return welstoryError_('LOGIN_PAUSED', '웰스토리 로그인이 거부되어 ' + time + '까지 다시 시도하지 않아요. 스크립트 속성의 아이디·비밀번호를 확인한 뒤 Apps Script에서 testWelstoryConnection을 실행해 주세요.');
}
function welstoryLogin_(properties, deviceId) {
  const pause = welstoryPauseState_(properties);
  if (pause) throw welstoryPausedError_(pause);
  const account = welstoryCredentials_(properties);
  let response;
  try {
    response = UrlFetchApp.fetch(WELSTORY_BASE + '/login', {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: 'username=' + encodeURIComponent(account.username) + '&password=' + encodeURIComponent(account.password) + '&remember-me=false',
      headers: welstoryHeaders_(deviceId, '', { 'X-Autologin': 'N' }),
      muteHttpExceptions: true,
      followRedirects: false
    });
  } catch (_) { throw welstoryError_('NETWORK', WELSTORY_NETWORK_ERROR); }
  const status = response.getResponseCode(), token = welstoryHeader_(response, 'authorization').trim();
  if (status >= 200 && status < 300 && token) return welstorySessionRecord_(token, 'login');
  if (status >= 500 || status === 429) {
    welstoryPause_(properties, WELSTORY_SERVER_PAUSE_MS, 'server');
    throw welstoryError_('LOGIN_UNAVAILABLE', '웰스토리 로그인 서버가 응답하지 않았어요 (' + status + '). 5분 뒤 다시 시도해요.');
  }
  welstoryPause_(properties, WELSTORY_LOGIN_PAUSE_MS, 'credentials');
  throw welstoryError_('LOGIN_REJECTED', '웰스토리 로그인에 실패했어요 (' + status + '). 스크립트 속성의 아이디·비밀번호를 확인한 뒤 testWelstoryConnection을 실행해 주세요.');
}
function welstoryRefresh_(session, deviceId) {
  try {
    const response = UrlFetchApp.fetch(WELSTORY_BASE + '/session', { headers: welstoryHeaders_(deviceId, session.token), muteHttpExceptions: true, followRedirects: false });
    if (response.getResponseCode() !== 200) return null;
    const body = JSON.parse(response.getContentText() || 'null');
    return body && typeof body.data === 'string' && body.data.trim() ? welstorySessionRecord_(body.data.trim(), 'refresh') : null;
  } catch (_) { return null; }
}
// Returns a usable token. Logging in again can sign the same account out of the phone app,
// so an unexpired session is reused and renewed through /session before a full login.
function welstoryToken_(properties, deviceId, rejectedToken) {
  const usable = s => s && s.token !== rejectedToken && s.exp - Date.now() > WELSTORY_SESSION_MARGIN_MS;
  const current = welstorySession_(properties);
  if (usable(current)) return { token: current.token, fresh: false };
  // A user lock serializes logins (the web app always runs as its owner) without holding
  // the script lock that attendance writes wait on.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(15000)) throw welstoryError_('BUSY', '다른 요청이 웰스토리에 로그인하는 중이에요. 잠시 후 다시 확인해 주세요.');
  try {
    const latest = welstorySession_(properties);
    if (usable(latest)) return { token: latest.token, fresh: false };
    let next = latest && latest.token !== rejectedToken && latest.exp > Date.now() ? welstoryRefresh_(latest, deviceId) : null;
    if (!next || next.token === rejectedToken) next = welstoryLogin_(properties, deviceId);
    properties.setProperty(WELSTORY_SESSION_PROPERTY, JSON.stringify(next));
    return { token: next.token, fresh: next.via === 'login' };
  } finally { lock.releaseLock(); }
}
function welstoryGet_(properties, deviceId, path, extraHeaders) {
  let rejected = '', emptyReplies = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const session = welstoryToken_(properties, deviceId, rejected);
    let response;
    try {
      response = UrlFetchApp.fetch(WELSTORY_BASE + path, { headers: welstoryHeaders_(deviceId, session.token, extraHeaders), muteHttpExceptions: true, followRedirects: false });
    } catch (_) { throw welstoryError_('NETWORK', WELSTORY_NETWORK_ERROR); }
    const status = response.getResponseCode(), body = response.getContentText() || '';
    const html = /text\/html/i.test(welstoryHeader_(response, 'content-type')) || /^\s*<(?:!doctype html|html[\s>])/i.test(body);
    if (status === 401 || status === 403 || (status >= 300 && status < 400) || (status === 200 && html)) {
      properties.deleteProperty(WELSTORY_SESSION_PROPERTY);
      if (session.fresh) {
        // A token from a brand-new login was refused: stop instead of logging in again and again.
        welstoryPause_(properties, WELSTORY_LOGIN_PAUSE_MS, 'credentials');
        throw welstoryError_('AUTH_REJECTED', '웰스토리가 새 로그인 세션을 받지 않았어요. Apps Script에서 testWelstoryConnection을 실행해 원인을 확인해 주세요.');
      }
      rejected = session.token;
      continue;
    }
    if (status !== 200) throw welstoryError_('HTTP_' + status, '웰스토리 식단 서버가 요청을 처리하지 못했어요 (' + status + '). 잠시 후 다시 확인해 주세요.');
    if (!body.trim()) {
      // Welstory sometimes answers concurrent requests with an empty body.
      if (++emptyReplies >= 3) break;
      Utilities.sleep(300 * emptyReplies);
      continue;
    }
    try { return JSON.parse(body); } catch (_) { throw welstoryError_('INVALID_RESPONSE', '웰스토리 식단 응답 형식을 확인하지 못했어요.'); }
  }
  throw welstoryError_('EMPTY_RESPONSE', '웰스토리 식단 서버의 응답이 비어 있어요. 잠시 후 다시 확인해 주세요.');
}
function welstoryMealType_(properties, deviceId) {
  let saved = null;
  try { saved = JSON.parse(properties.getProperty(WELSTORY_MEAL_TYPE_PROPERTY) || 'null'); } catch (_) {}
  if (saved && /^\d{1,2}$/.test(saved.code) && Date.now() - Date.parse(saved.checkedAt) < 7 * 86400000) return saved.code;
  let raw;
  try {
    raw = welstoryGet_(properties, deviceId, '/api/menu/getMealTimeList', { Cookie: 'cafeteriaActiveId=' + LunchMenuSource.RESTAURANT_ID });
  } catch (error) {
    // Only a bad meal-time list falls back to the default lunch code; login and network problems surface as-is.
    if (!/^(?:HTTP_\d+|INVALID_RESPONSE|EMPTY_RESPONSE)$/.test(String(error && error.code || ''))) throw error;
    return LunchMenuSource.LUNCH_MEAL_TYPE;
  }
  const code = LunchMenuSource.lunchMealType(raw);
  properties.setProperty(WELSTORY_MEAL_TYPE_PROPERTY, JSON.stringify({ code: code, checkedAt: new Date().toISOString() }));
  return code;
}
function welstoryMenu_(date) {
  if (typeof LunchMenuSource === 'undefined') throw welstoryError_('SETUP', '공유 서버 코드에 menu-source.js가 빠졌어요. setup.html에서 코드를 다시 복사해 주세요.');
  const properties = PropertiesService.getScriptProperties();
  welstoryCredentials_(properties);
  const deviceId = welstoryDeviceId_(properties), mealType = welstoryMealType_(properties, deviceId);
  const raw = welstoryGet_(properties, deviceId, '/api/meal?menuDt=' + date.replace(/-/g, '') + '&menuMealType=' + encodeURIComponent(mealType) + '&restaurantCode=' + LunchMenuSource.RESTAURANT_ID);
  return LunchMenuSource.parseMealList(raw, date, mealType);
}
function welstoryMenuResponse_(date) {
  const cache = CacheService.getScriptCache(), cacheKey = WELSTORY_MENU_CACHE_PREFIX + date;
  try {
    const cached = JSON.parse(cache.get(cacheKey) || 'null');
    if (cached && cached.ok === true && cached.menu && cached.menu.date === date) return cached;
    if (cached && cached.ok === false && typeof cached.error === 'string') return cached;
  } catch (_) {}
  let result;
  try {
    result = { ok: true, menu: welstoryMenu_(date) };
  } catch (error) {
    const known = error && typeof error.code === 'string' && typeof error.message === 'string';
    result = { ok: false, reason: known && error.code === 'SETUP' ? 'setup' : 'provider', error: known ? error.message : WELSTORY_NETWORK_ERROR };
    if (!known) console.log('Lunch Club Welstory menu failed: ' + String(error && error.message || error).slice(0, 120));
  }
  // Setup errors are not cached, so the menu appears as soon as the account is registered.
  const ttl = result.ok ? (date < LunchCore.today() ? WELSTORY_PAST_MENU_TTL_SECONDS : WELSTORY_MENU_TTL_SECONDS) : WELSTORY_ERROR_TTL_SECONDS;
  if (result.ok || result.reason !== 'setup') {
    try { cache.put(cacheKey, JSON.stringify(result), ttl); } catch (_) {}
  }
  return result;
}
// Apps Script 편집기에서 직접 실행하는 연결 진단입니다. 비밀번호와 토큰은 로그에 쓰지 않습니다.
function testWelstoryConnection() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(WELSTORY_PAUSE_PROPERTY);
  properties.deleteProperty(WELSTORY_MEAL_TYPE_PROPERTY);
  welstoryCredentials_(properties);
  console.log('1) 웰스토리 계정 스크립트 속성: 확인됨');
  const deviceId = welstoryDeviceId_(properties);
  const before = welstorySession_(properties), session = welstoryToken_(properties, deviceId, '');
  const saved = welstorySession_(properties);
  console.log('2) 로그인 세션: ' + (session.fresh ? '새로 로그인' : before && before.token === session.token ? '기존 세션 재사용' : '세션 연장') +
    ' · 만료 예상 ' + Utilities.formatDate(new Date(saved ? saved.exp : Date.now()), 'Asia/Seoul', 'MM-dd HH:mm'));
  const mealType = welstoryMealType_(properties, deviceId);
  console.log('3) 점심 식사 코드: ' + mealType);
  let date = LunchCore.today();
  while (LunchCore.weekday(date) === 0 || LunchCore.weekday(date) === 6) date = LunchCore.shiftDate(date, 1);
  const menu = welstoryMenu_(date);
  CacheService.getScriptCache().remove(WELSTORY_MENU_CACHE_PREFIX + date);
  console.log('4) ' + date + ' ' + LunchMenuSource.RESTAURANT_NAME + ' 점심: ' + (menu.courses.length
    ? menu.courses.map(c => c.name + (c.takeout ? ' [테이크아웃]' : '') + (c.imageUrl ? ' (사진 있음)' : '')).join(' / ')
    : '아직 등록된 메뉴가 없어요.'));
  console.log('완료. 배포 > 배포 관리 > 새 버전으로 배포한 뒤 점심판을 새로고침하세요.');
}

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
const GANGNAM_TOKEN_PROPERTY = 'LUNCH_THREADS_ACCESS_TOKEN';
const GANGNAM_RSS_FEED_PROPERTY = 'LUNCH_THREADS_RSS_FEED_URL';
const GANGNAM_PUBLIC_FEEDS = ['https://rsshub.gneko.io/threads/gangnambab', 'https://rsshub.isrss.com/threads/gangnambab'];
const GANGNAM_FORCE_THROTTLE = 'lunch_gangnam_refresh_';
const GANGNAM_CACHE_PREFIX = 'lunch_gangnam_menu_v3_';
const GANGNAM_ERROR = 'Threads 계정의 오늘 메뉴표를 아직 확인하지 못했어요.';
const KAKAO_PROFILE_ERROR = '카카오 채널의 최신 프로필 사진을 가져오지 못했어요. 잠시 후 다시 확인하거나 카카오 원문을 열어 주세요.';
// Slack secrets are NEVER embedded in GitHub Pages files or generated Code.gs.
// Set these in Apps Script > Project settings > Script properties.
const SLACK_TOKEN_PROPERTY = 'LUNCH_SLACK_BOT_TOKEN';
const SLACK_USERS_PROPERTY = 'LUNCH_SLACK_MEMBER_IDS';
// Optional no-Slack-API route: newly shared Google Drive files can trigger
// notifications in a recipient's *already connected* Google Drive Slack app.
// Email addresses remain in private Apps Script Script Properties, never on GitHub.
const DRIVE_NOTICE_EMAILS_PROPERTY = 'LUNCH_DRIVE_MEMBER_EMAILS';
const DRIVE_NOTICE_DOMAIN_PROPERTY = 'LUNCH_DRIVE_ALLOWED_DOMAIN';
const DRIVE_NOTICE_FOLDER_PROPERTY = 'LUNCH_DRIVE_NOTICE_FOLDER_ID';
const DRIVE_NOTICE_TEST_MEMBER_PROPERTY = 'LUNCH_DRIVE_TEST_MEMBER';
const DRIVE_NOTICE_CLEANUP_PROPERTY = 'LUNCH_DRIVE_NOTICE_CLEANUP';
const DRIVE_NOTICE_FOLDER_MARKER = 'SANDS_LUNCH_CLUB_DRIVE_NOTICE_V1';
const DRIVE_NOTICE_RETENTION_DAYS = 14;
const DRIVE_SELF_RELAY_URL_PROPERTY = 'LUNCH_DRIVE_SELF_RELAY_URL';
const DRIVE_SELF_RELAY_SECRET_PROPERTY = 'LUNCH_DRIVE_SELF_RELAY_SECRET';
// Slack provides personal Slackbot email forwarding addresses on all plans.
// A recipient must generate and privately share *their own* forwarding address.
// These are effectively inbox secrets: keep them in Script Properties only.
const SLACKBOT_EMAILS_PROPERTY = 'LUNCH_SLACKBOT_FORWARD_EMAILS';
const SLACKBOT_TEST_MEMBER_PROPERTY = 'LUNCH_SLACKBOT_TEST_MEMBER';
const LUNCH_SITE_URL = 'https://jsj-sands.github.io/lunch-club/';

function initializeLunchClub() {
  if (!/^[a-f0-9]{48,64}$/.test(TEAM_KEY)) throw new Error('setup.html의 코드 복사 버튼으로 만든 코드를 붙여넣어 주세요.');
  const properties = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Run again after upgrading: Apps Script must authorize Drive before deployment.
    menuImageFolder_(properties, properties.getProperties(), true);
    properties.setProperty('LUNCH_INSTALLED', new Date().toISOString());
  } finally { lock.releaseLock(); }
  // Authorizes outbound requests (Welstory+, Kakao, Threads) while running this in the editor.
  UrlFetchApp.fetch('https://welplus.welstory.com/', { muteHttpExceptions: true, followRedirects: false });
  console.log('점심판 준비 완료. 배포 > 새 배포 > 웹 앱에서 실행 사용자: 나 / 액세스: 모든 사용자로 배포하세요.');
  console.log('메가존 식단: 스크립트 속성에 LUNCH_WELSTORY_USERNAME과 LUNCH_WELSTORY_PASSWORD를 등록하고 testWelstoryConnection을 실행하세요.');
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
// A public RSSHub feed is the first attempt, so the restaurant need not authorize an app.
// Public community-hosted feeds are not an official Meta service and can fail at any time.
function gangnamRssUrls_(properties) {
  const custom = String(properties.getProperty(GANGNAM_RSS_FEED_PROPERTY) || '').trim();
  if (!custom) return GANGNAM_PUBLIC_FEEDS;
  if (!/^https:\/\/(?:rsshub\.(?:gneko\.io|isrss\.com|app|uocat\.com))\/threads\/gangnambab(?:\?.*)?$/i.test(custom)) return [];
  return [custom];
}
function gangnamFetchPosts_() {
  const properties = PropertiesService.getScriptProperties();
  const rssUrls = gangnamRssUrls_(properties), attempts = [];
  for (let i = 0; i < rssUrls.length; i++) {
    const record = { source: 'rsshub-' + (i + 1), httpStatus: null, code: '' };
    attempts.push(record);
    try {
      const response = UrlFetchApp.fetch(rssUrls[i], { muteHttpExceptions: true, followRedirects: false,
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
      record.httpStatus = response.getResponseCode();
      if (record.httpStatus !== 200) { record.code = 'HTTP_' + record.httpStatus; continue; }
      const raw = response.getContentText();
      if (!raw || raw.length > 650000) { record.code = 'INVALID_SIZE'; continue; }
      let posts;
      try { posts = LunchThreadsMenu.parseRss(raw); }
      catch (_) { record.code = 'INVALID_RSS'; continue; }
      if (!posts.data.length) { record.code = 'EMPTY_FEED'; continue; }
      record.code = 'OK';
      return { posts, source: 'rsshub', attempts };
    } catch (_) { record.code = 'NETWORK_ERROR'; }
  }
  const token = properties.getProperty(GANGNAM_TOKEN_PROPERTY);
  if (token && token.length >= 20) {
    const record = { source: 'meta_api', httpStatus: null, code: '' }; attempts.push(record);
    try {
      const api = 'https://graph.threads.net/v1.0/profile_posts?username=gangnambab&fields=id,username,media_type,media_url,thumbnail_url,permalink,timestamp,text,alt_text,is_quote_post&limit=50';
      const response = UrlFetchApp.fetch(api, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        muteHttpExceptions: true, followRedirects: false });
      record.httpStatus = response.getResponseCode();
      if (record.httpStatus !== 200) record.code = 'HTTP_' + record.httpStatus;
      else {
        const raw = response.getContentText();
        if (!raw || raw.length > 350000) record.code = 'INVALID_SIZE';
        else {
          const posts = JSON.parse(raw);
          if (!posts || !Array.isArray(posts.data) || posts.data.length > 100) record.code = 'INVALID_JSON';
          else { record.code = 'OK'; return { posts, source: 'meta_api', attempts }; }
        }
      }
    } catch (_) { record.code = record.httpStatus === 200 ? 'INVALID_JSON' : 'NETWORK_ERROR'; }
  }
  const error = new Error('Threads 게시물을 가져오지 못했습니다.');
  error.diagnostics = { attempts, failure: rssUrls.length ? 'feed_unavailable' : 'invalid_feed_config' };
  throw error;
}
function gangnamMenuResponse_(date, force) {
  if (typeof LunchThreadsMenu === 'undefined') return { ok: false, reason: 'setup', error: '공유 서버를 업데이트해 주세요.' };
  const today = LunchCore.today(), version = LunchThreadsMenu.VERSION;
  const base = { date, checkedAt: new Date().toISOString(), version };
  if (date > today) return { ...base, ok: false, reason: 'not_found', diagnostics: { failure: 'future_date', expectedDate: date }, error: '미래 날짜의 메뉴는 아직 조회하지 않습니다.' };
  if (date < LunchCore.shiftDate(today, -7)) return { ...base, ok: false, reason: 'not_found', diagnostics: { failure: 'outside_range', expectedDate: date }, error: '최근 7일 이내 메뉴만 자동으로 확인합니다.' };
  const cache = CacheService.getScriptCache(), cacheKey = GANGNAM_CACHE_PREFIX + date;
  try { const cached = cache.get(cacheKey); if (cached && (!force || cache.get(GANGNAM_FORCE_THROTTLE + date))) return JSON.parse(cached); } catch (_) {}
  let reply;
  try {
    const result = gangnamFetchPosts_();
    const selected = LunchThreadsMenu.chooseMenu(result.posts, date);
    const diagnostics = { ...(selected.diagnostics || {}), attempts: result.attempts || [] };
    const reason = selected.reason === 'not_found' ? diagnostics.failure || 'not_found' : selected.reason;
    reply = selected.ok ? { ...selected, ...base, provider: result.source, diagnostics }
      : { ...base, ok: false, reason, alternatives: selected.alternatives || [], provider: result.source, diagnostics,
          error: reason === 'ambiguous' ? '같은 날짜의 게시물 중 메뉴 공지를 구분하지 못했습니다.' : GANGNAM_ERROR };
  } catch (error) {
    reply = { ...base, ok: false, reason: 'feed_unavailable', diagnostics: error.diagnostics || { failure: 'processing_error' },
      error: 'Threads 게시물 조회에 실패했습니다. 이 결과로 오늘 게시물이 없다고 판단할 수는 없습니다.' };
  }
  try { cache.put(cacheKey, JSON.stringify(reply), reply.ok ? 300 : 120); cache.put(GANGNAM_FORCE_THROTTLE + date, '1', 60); } catch (_) {}
  return reply;
}
// Run from the Apps Script editor when investigating a live fetch failure.
// Logs only counts/status codes; never log the team key, token or signed media URL.
function testGangnamThreadsConnection() {
  const result = gangnamMenuResponse_(LunchCore.today(), true);
  const report = { version: result.version, date: result.date, ok: result.ok, reason: result.reason || 'ok',
    provider: result.provider || '', diagnostics: result.diagnostics || {} };
  console.log('강남밥상 조회 진단\n' + JSON.stringify(report, null, 2));
  console.log(result.ok ? '게시물 주소 확인 완료. 실제 영상 재생은 점심판에서 확인하세요.' :
    result.reason === 'ambiguous' ? '여러 게시물을 받았습니다. 점심판에서 후보를 확인하세요.' : '조회 결과의 reason과 diagnostics를 확인하세요.');
  return report;
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
function slackNotices_(op, before, after, date) {
  const memberName = id => (LunchCore.MEMBERS.find(item => item.id === id) || {}).name || '';
  const from = memberName(op.actor), payload = op.payload || {}, day = Number(date.slice(8)), month = Number(date.slice(5, 7));
  const dayLabel = month + '월 ' + day + '일', link = LUNCH_SITE_URL + '?date=' + date;
  const note = (to, text) => to && memberName(to) ? { to: to, text: '[SANDS Lunch Club] ' + dayLabel + '\n' + text + '\n점심판에서 확인: ' + link } : null;
  let out = [];
  if (op.type === 'pairInvite' || op.type === 'groupInvite') {
    const invitees = op.type === 'pairInvite' ? [payload.to] : (payload.invites || []).map(item => item.to);
    out = invitees.map(to => note(to, from + '님이 따로 먹는 점심에 초대했어요. 점심판에서 수락하거나 거절해 주세요.'));
  } else if (op.type === 'joinRequest') {
    out = [note(payload.to, from + '님이 내가 만든 따로 먹기 모임에 참여하고 싶어 해요. 점심판에서 승인하거나 거절해 주세요.')];
  } else if (['joinApprove', 'joinReject', 'joinWithdraw'].includes(op.type)) {
    const request = before.joinRequests.find(item => item.id === payload.requestId);
    if (request) out = [op.type === 'joinApprove' ? note(request.from, memberName(request.to) + '님이 참여 요청을 승인했어요! 따로 먹기 모임으로 이동했습니다.')
      : op.type === 'joinReject' ? note(request.from, memberName(request.to) + '님이 모임 참여 요청을 거절했어요.')
      : note(request.to, from + '님이 모임 참여 요청을 취소했어요.')];
  } else if (['pairAccept', 'pairDecline', 'pairCancel'].includes(op.type)) {
    const pair = before.pairs.find(item => item.id === payload.pairId);
    if (pair) out = [op.type === 'pairAccept' ? note(pair.from, from + '님이 따로 먹기 초대를 수락했어요.')
      : op.type === 'pairDecline' ? note(pair.from, from + '님이 초대를 거절했어요.')
      : note(pair.to, from + '님이 초대를 취소했어요.')];
  }
  return out.filter(Boolean);
}
function slackCall_(token, method, payload) {
  const response = UrlFetchApp.fetch('https://slack.com/api/' + method, {
    method: 'post', contentType: 'application/json; charset=utf-8',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload), muteHttpExceptions: true, timeoutSeconds: 8
  });
  if (response.getResponseCode() !== 200) throw new Error('Slack status ' + response.getResponseCode());
  const data = JSON.parse(response.getContentText());
  if (!data.ok) throw new Error('Slack API: ' + String(data.error || 'unknown').slice(0, 60));
  return data;
}
// Better admin-free notification route: Apps Script MailApp sends directly to
// each recipient's personal Slackbot forwarding inbox. No Slack bot API call or
// Drive sharing is needed. A successful MailApp call is NOT Slack delivery proof.
function slackbotEmails_(all) {
  let map;
  try { map = JSON.parse(all[SLACKBOT_EMAILS_PROPERTY] || '{}'); } catch (_) { return {}; }
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  const known = new Set(LunchCore.MEMBERS.map(m => m.id)), result = {};
  for (const id of Object.keys(map)) {
    if (!known.has(id) || typeof map[id] !== 'string') continue;
    const email = map[id].trim().toLowerCase();
    if (email.length > 240 || !/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(email)) continue;
    result[id] = email;
  }
  return result;
}
function sendSlackbotNotices_(notices, all, strict) {
  const emails = slackbotEmails_(all), sent = new Set();
  for (const notice of notices) {
    const recipient = emails[notice.to];
    if (!recipient) continue;
    try {
      const name = (LunchCore.MEMBERS.find(m => m.id === notice.to) || {}).name || notice.to;
      const lines = String(notice.text).split('\n');
      const title = '[SANDS Lunch Club] ' + name + '님 · ' + (lines[1] || '새 점심 알림').slice(0, 72);
      MailApp.sendEmail({
        to: recipient, subject: title, body: notice.text
          + '\n\n알림 수신처: Slackbot 개인 전달 주소\n알림을 읽은 후 초대 수락·거절 또는 모임 참여 요청 승인은 점심판에서 진행하세요.',
        name: 'SANDS Lunch Club'
      });
      sent.add(notice.to);
    } catch (error) {
      console.log('Lunch Club Slackbot forward notice failed for member ' + notice.to + ': ' + String(error.message || error).slice(0, 110));
      if (strict) throw error;
    }
  }
  return sent;
}
function testLunchSlackbotForwarding() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const id = String(all[SLACKBOT_TEST_MEMBER_PROPERTY] || '').trim();
  const member = LunchCore.MEMBERS.find(m => m.id === id);
  if (!member) throw new Error('스크립트 속성 LUNCH_SLACKBOT_TEST_MEMBER에 시험 발송할 직원 ID를 입력해 주세요.');
  if (!slackbotEmails_(all)[id]) throw new Error('LUNCH_SLACKBOT_FORWARD_EMAILS에 해당 직원의 Slackbot 전달 주소를 먼저 등록해 주세요.');
  const notice = { to: id, text: '[SANDS Lunch Club] 알림 테스트\n' + member.name
    + '님, Google Apps Script에서 보내는 Slackbot 이메일 알림 테스트입니다.\n점심판에서 확인: ' + LUNCH_SITE_URL };
  if (!sendSlackbotNotices_([notice], all, true).has(id)) throw new Error('테스트 이메일을 보내지 못했습니다.');
  console.log('Slackbot 전달 주소로 이메일을 보냈습니다. Slack 메시지 수신은 직원이 직접 확인해 주세요: ' + member.name);
}
// Sharing creates the Google Drive app's "shared with you" event, NOT a
// Slack chat message. Actual Slack delivery depends on each member's settings.
function driveNoticeEmails_(all) {
  let value;
  try { value = JSON.parse(all[DRIVE_NOTICE_EMAILS_PROPERTY] || '{}'); } catch (_) { return {}; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const domain = String(all[DRIVE_NOTICE_DOMAIN_PROPERTY] || '').trim().toLowerCase().replace(/^@/, '');
  const known = new Set(LunchCore.MEMBERS.map(m => m.id)), out = {};
  for (const id of Object.keys(value)) {
    if (!known.has(id) || typeof value[id] !== 'string') continue;
    const email = value[id].trim().toLowerCase();
    if (email.length > 200 || !/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(email)) continue;
    if (domain && email.split('@')[1] !== domain) continue;
    out[id] = email;
  }
  return out;
}
function driveNoticeFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const folderId = properties.getProperty(DRIVE_NOTICE_FOLDER_PROPERTY);
  if (folderId) {
    try {
      const folder = DriveApp.getFolderById(folderId);
      if (!folder.isTrashed() && folder.getDescription() === DRIVE_NOTICE_FOLDER_MARKER
          && folder.getSharingAccess() === DriveApp.Access.PRIVATE) return folder;
    } catch (_) { /* Folder removed or unavailable: create a private replacement. */ }
  }
  const folder = DriveApp.createFolder('SANDS Lunch Club - 자동 알림 (14일 보관)');
  folder.setDescription(DRIVE_NOTICE_FOLDER_MARKER);
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  properties.setProperty(DRIVE_NOTICE_FOLDER_PROPERTY, folder.getId());
  return folder;
}
function pruneDriveNoticeFolder_(folder) {
  const properties = PropertiesService.getScriptProperties(), now = Date.now();
  const prev = Date.parse(properties.getProperty(DRIVE_NOTICE_CLEANUP_PROPERTY) || '');
  if (Number.isFinite(prev) && now - prev < 86400000) return;
  const cutoff = now - DRIVE_NOTICE_RETENTION_DAYS * 86400000;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (!file.isTrashed() && file.getDateCreated().getTime() < cutoff) file.setTrashed(true);
  }
  properties.setProperty(DRIVE_NOTICE_CLEANUP_PROPERTY, new Date().toISOString());
}
// Self-share is impossible. A second Google account can safely originate the
// recipient's Drive file. The receiving account must be fixed by that relay.
function sendSelfDriveNoticeViaRelay_(notice, recipientEmail, all) {
  const url = String(all[DRIVE_SELF_RELAY_URL_PROPERTY] || '').trim();
  const secret = String(all[DRIVE_SELF_RELAY_SECRET_PROPERTY] || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(url)) {
    throw new Error('본인 알림용 중계 웹 앱 URL을 설정해 주세요.');
  }
  if (!/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error('본인 알림용 비밀키를 스크립트 속성에 설정해 주세요.');
  }
  const response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json; charset=utf-8',
    payload: JSON.stringify({ secret: secret, email: recipientEmail, text: notice.text,
      nonce: Utilities.getUuid().replace(/-/g, '') }),
    muteHttpExceptions: true, followRedirects: true, timeoutSeconds: 15
  });
  if (response.getResponseCode() !== 200) throw new Error('알림 중계 접속 실패: HTTP ' + response.getResponseCode());
  let body; try { body = JSON.parse(response.getContentText()); } catch (_) {
    throw new Error('알림 중계 응답을 읽지 못했습니다. 중계 웹 앱의 공개 범위를 확인해 주세요.');
  }
  if (!body || body.ok !== true) throw new Error('알림 중계 실패: ' + String(body && body.error || '설정을 확인해 주세요.').slice(0, 75));
  return true;
}
function sendDriveNotices_(notices, all, strict) {
  const emails = driveNoticeEmails_(all), sent = new Set();
  if (!notices.length || !Object.keys(emails).length) return sent;
  let folder = null;
  for (const notice of notices) {
    const to = emails[notice.to];
    if (!to) continue;
    let file;
    try {
      // An Apps Script deployed as "execute as me" cannot share its own file
      // *to the owner* and consequently cannot trigger a Drive self-share alert.
      const owner = Session.getEffectiveUser().getEmail().trim().toLowerCase();
      if (owner && owner === to) {
        // The file is shared by a teammate's standalone script, not by me.
        if (sendSelfDriveNoticeViaRelay_(notice, to, all)) sent.add(notice.to);
        continue;
      }
      if (!folder) { folder = driveNoticeFolder_(); pruneDriveNoticeFolder_(folder); }
      const member = LunchCore.MEMBERS.find(m => m.id === notice.to);
      const parts = String(notice.text).split('\n');
      const topic = (parts[1] || '새로운 점심 알림').trim().slice(0, 75);
      const name = '[Lunch Club] ' + (member ? member.name + '님 · ' : '') + topic;
      const body = notice.text + '\n\n이 파일은 Lunch Club에서 생성한 공유 알림입니다. 초대 수락/거절 및 참여 승인/거절은 반드시 점심판에서 해 주세요.';
      file = folder.createFile(name, body, MimeType.PLAIN_TEXT);
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
      // Drive permissions.create deliberately uses sendNotificationEmail=true.
      // This produces a standard Google share notification even when Slack
      // integration is unavailable. Do not grant edit/comment permission.
      const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.getId())
        + '/permissions?sendNotificationEmail=true&emailMessage=' + encodeURIComponent(parts[1] + '\n' + LUNCH_SITE_URL);
      const response = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json; charset=utf-8',
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        payload: JSON.stringify({ type: 'user', role: 'reader', emailAddress: to }),
        muteHttpExceptions: true, timeoutSeconds: 10
      });
      const code = response.getResponseCode();
      if (code !== 200 && code !== 201) throw new Error('Drive permissions.create status ' + code);
      sent.add(notice.to);
    } catch (error) {
      // An unshared file carries no useful notice; keep the Drive folder clean.
      if (file) try { file.setTrashed(true); } catch (_) {}
      console.log('Lunch Club Google Drive notice failed for member ' + notice.to + ': ' + String(error.message || error).slice(0, 110));
      if (strict) throw error;
    }
  }
  return sent;
}
// Explicit manual smoke test from Apps Script editor, never called by page.
// Set LUNCH_DRIVE_TEST_MEMBER to the intended colleague's internal ID first.
function testLunchDriveNotification() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const id = String(all[DRIVE_NOTICE_TEST_MEMBER_PROPERTY] || '').trim();
  const person = LunchCore.MEMBERS.find(m => m.id === id);
  if (!person) throw new Error('먼저 스크립트 속성 LUNCH_DRIVE_TEST_MEMBER에 테스트할 직원 ID를 넣어 주세요.');
  if (!driveNoticeEmails_(all)[id]) throw new Error('테스트할 직원의 LUNCH_DRIVE_MEMBER_EMAILS를 올바르게 설정해 주세요.');
  const notice = { to: id, text: '[SANDS Lunch Club] 알림 연결 테스트\n' + person.name
    + '님, Google Drive 파일 공유 알림 테스트입니다.\n점심판: ' + LUNCH_SITE_URL };
  if (!sendDriveNotices_([notice], all, true).has(id)) throw new Error('알림 파일을 공유하지 못했습니다.');
  console.log('Drive 파일 공유 성공. Slack에서 실제 수신되는지는 수신자가 직접 확인해 주세요: ' + person.name);
}
function sendSlackNotices_(notices, all) {
  if (!notices.length) return;
  const token = all[SLACK_TOKEN_PROPERTY];
  if (typeof token !== 'string' || !/^xoxb-[A-Za-z0-9-]{10,}$/.test(token)) return;
  let users = {};
  try { users = JSON.parse(all[SLACK_USERS_PROPERTY] || '{}'); } catch (_) { return; }
  if (!users || typeof users !== 'object' || Array.isArray(users)) return;
  notices.forEach(item => {
    const userId = users[item.to];
    if (typeof userId !== 'string' || !/^[UW][A-Z0-9]{8,24}$/.test(userId)) return;
    try {
      const dm = slackCall_(token, 'conversations.open', { users: userId });
      const channel = dm.channel && dm.channel.id;
      if (!channel || !/^D[A-Z0-9]{8,24}$/.test(channel)) throw new Error('Slack DM channel');
      slackCall_(token, 'chat.postMessage', { channel: channel, text: item.text, unfurl_links: false, unfurl_media: false });
    } catch (error) {
      // Notifications are optional. A Slack failure cannot roll back a stored meal selection.
      console.log('Lunch Club Slack notice failed for ' + item.to + ': ' + String(error.message || error).slice(0, 80));
    }
  });
}
function stateResponse_(date, receiptId) {
  const all = PropertiesService.getScriptProperties().getProperties(), cfg = getConfig_(all), dates = LunchCore.weekDates(date);
  if (!dates.includes(date)) dates.push(date);
  const days = {}; dates.forEach(d => { days[d] = getRecord_(all, d).data; });
  const receipt = receiptId ? getRecord_(all, date).receipts[receiptId] || null : null;
  return { ok: true, serverVersion: 6, features: { menuImages: true, menuImageDelete: true, explicitAttendance: true, lunchPairs: true, kakaoProfile: true, ceoVenue: true, gangnamMenu: true, separateGroups: true, separateVenues: true, joinRequests: true, welstoryMenu: true }, days: days, menuImages: menuImageState_(all, date, dates), settings: cfg.settings, configRevision: cfg.revision, receipt: receipt, serverTime: new Date().toISOString() };
}
function menuResponse_(date) {
  // 메가존 식단은 backend/welstory.js가 Welstory+ 회원 API에서 가져옵니다.
  if (typeof welstoryMenuResponse_ !== 'function') return { ok: false, reason: 'setup', error: '공유 서버 코드에 웰스토리 연동이 빠졌어요. setup.html에서 코드를 다시 복사해 주세요.' };
  return welstoryMenuResponse_(date);
}
function doGet(e) {
  const p = (e || {}).parameter || {}, callback = p.callback || '';
  try {
    if (callback && !/^lunchReply_[a-f0-9]{24}$/.test(callback)) return output_({ ok: false, error: '콜백 형식이 올바르지 않습니다.' });
    if (!authorized_(p.key)) return output_({ ok: false, error: '팀 키가 맞지 않아요. 초대 링크 또는 연결 설정을 확인해 주세요.' }, callback);
    if (p.action === 'kakaoProfile') return output_(kakaoProfileResponse_(p.force === '1'), callback);
    if (!LunchCore.validDate(p.date)) return output_({ ok: false, error: '날짜 형식이 올바르지 않습니다.' }, callback);
    if (p.action === 'menu') return output_(menuResponse_(p.date), callback);
    if (p.action === 'gangnamMenu') return output_(gangnamMenuResponse_(p.date, p.force === '1'), callback);
    if (p.action === 'menuImage') return output_(menuImageResponse_(p.date, p.scope, p.imageId), callback);
    if (p.action === 'state') return output_(stateResponse_(p.date, p.receipt), callback);
    return output_({ ok: false, error: '지원하지 않는 조회입니다.' }, callback);
  } catch (error) { return output_({ ok: false, error: error.message || '조회에 실패했어요. 다시 시도해 주세요.' }, callback); }
}
function doPost(e) {
  let lock, notices = [], storedProperties = null;
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
      } else {
        const before = record.data;
        record.data = LunchCore.applyOperation(before, body.date, cfg.settings, body.op, new Date().toISOString());
        notices = slackNotices_(body.op, before, record.data, body.date);
      }
      receipt = { ok: true, at: new Date().toISOString() };
    } catch (error) { receipt = { ok: false, error: String(error.message).slice(0, 160), at: new Date().toISOString() }; }
    const ids = Object.keys(record.receipts); while (ids.length >= 16) delete record.receipts[ids.shift()];
    record.receipts[body.op.id] = receipt;
    // A confirmed image deletion must affect only that image, even if other slots are old.
    if (body.op.type !== 'menuImageDelete') prune_(properties, all, body.date);
    saveRecord_(properties, all, body.date, record);
    if (receipt.ok && notices.length) storedProperties = all;
    // Slack requests happen after the transaction is durable and after releasing the lock.
    lock.releaseLock();
    if (storedProperties) {
      // Everyone with a Drive email mapping uses the SAME Drive alert route.
      // Do not silently fall back to a different Slack/email route on failure.
      const driveMap = driveNoticeEmails_(storedProperties);
      sendDriveNotices_(notices, storedProperties, false);
      const withoutDrive = notices.filter(n => !driveMap[n.to]);
      // Legacy email/Slack plugins still work for people without a Drive map.
      const emailed = sendSlackbotNotices_(withoutDrive, storedProperties, false);
      sendSlackNotices_(withoutDrive.filter(n => !emailed.has(n.to)), storedProperties);
    }
    return output_({ ok: true, accepted: true });
  } catch (error) { return output_({ ok: false, error: error.message || '저장하지 못했어요. 다시 시도해 주세요.' }); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
