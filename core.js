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
  return { MEMBERS, PLACES, DEFAULT_SETTINGS, WELPLAN, clone, validDate, today, weekday, shiftDate, weekDates, settings, emptyDay, cleanDay, safeUrl, memberStatus, pairFor, incomingPairs, incomingJoinRequests, myJoinRequest, separateGroup, participants, places, tally, applyOperation, parseMenuMarkdown, menuUrl };
});
