// SANDS Lunch Club — generated single-file Apps Script
// Paste the entire code copied from setup.html into Code.gs.

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
  function emptyDay() { return { ceoCancelled: false, overrides: {}, absenceReasons: {}, votes: {}, extras: [], decision: null, notes: {}, pairs: [], revision: 0, updatedAt: null }; }
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
    const pairs = (Array.isArray(v.pairs) ? v.pairs : []).slice(0, MEMBERS.length * MEMBERS.length), pairIds = new Set(), pairedMembers = new Set();
    // Prefer existing consented pairs when a malformed record contains overlaps.
    ['accepted', 'pending'].forEach(status => pairs.forEach(pair => {
      if (!pair || typeof pair !== 'object' || Array.isArray(pair) || pair.status !== status || typeof pair.id !== 'string' || !PAIR_ID.test(pair.id) || !MEMBER_IDS.has(pair.from) || !MEMBER_IDS.has(pair.to) || pair.from === pair.to) return;
      if (d.overrides[pair.from] !== 'separate' || status === 'accepted' && d.overrides[pair.to] !== 'separate') return;
      if (pairIds.has(pair.id) || pairedMembers.has(pair.from) || pairedMembers.has(pair.to)) return;
      pairIds.add(pair.id); pairedMembers.add(pair.from); pairedMembers.add(pair.to);
      d.pairs.push({ id: pair.id, from: pair.from, to: pair.to, status: status });
    }));
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
        if (!['auto'].concat(OVERRIDE_VALUES).includes(p.value)) throw new Error('참석 상태를 확인해 주세요.');
        d.pairs = d.pairs.filter(pair => pair.from !== op.actor && pair.to !== op.actor);
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
          d.pairs = d.pairs.filter(item => item.id !== pair.id);
          d.overrides[op.actor] = 'pending'; delete d.absenceReasons[op.actor];
        } else {
          if (pair.status !== 'pending') throw new Error('초대가 이미 처리됐어요. 새로고침 후 확인해 주세요.');
          if (op.type === 'pairCancel' ? pair.from !== op.actor : pair.to !== op.actor) throw new Error(op.type === 'pairCancel' ? '초대한 본인만 초대를 취소할 수 있어요.' : '초대받은 본인만 수락하거나 거절할 수 있어요.');
          if (op.type === 'pairAccept') {
            pair.status = 'accepted';
            d.overrides[pair.from] = 'separate'; d.overrides[pair.to] = 'separate';
            delete d.absenceReasons[pair.from]; delete d.absenceReasons[pair.to];
          } else d.pairs = d.pairs.filter(item => item.id !== pair.id);
        }
        break;
      }
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
  return { MEMBERS, PLACES, DEFAULT_SETTINGS, WELPLAN, clone, validDate, today, weekday, shiftDate, weekDates, settings, emptyDay, cleanDay, safeUrl, memberStatus, pairFor, incomingPairs, participants, places, tally, applyOperation, parseMenuMarkdown, menuUrl };
});


/* This file is appended to core.js to create the single copy/paste Code.gs. */
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
  return { ok: true, serverVersion: 3, features: { menuImages: true, explicitAttendance: true, lunchPairs: true }, days: days, menuImages: menuImageState_(all, date, dates), settings: cfg.settings, configRevision: cfg.revision, receipt: receipt, serverTime: new Date().toISOString() };
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
    prune_(properties, all, body.date);
    saveRecord_(properties, all, body.date, record);
    return output_({ ok: true, accepted: true });
  } catch (error) { return output_({ ok: false, error: error.message || '저장하지 못했어요. 다시 시도해 주세요.' }); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
