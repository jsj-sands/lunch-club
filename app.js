(function () {
  'use strict';
  const C = window.LunchCore;
  const KEYS = { local: 'sandsLunch.local.v1', identity: 'sandsLunch.identity.v1', connection: 'sandsLunch.connection.v1', pending: 'sandsLunch.pendingKey.v1', cache: 'sandsLunch.menus.v1', images: 'sandsLunch.menuImages.v1' };
  const $ = id => document.getElementById(id);
  const esc = text => String(text == null ? '' : text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } };
  const write = (key, value) => { localStorage.setItem(key, JSON.stringify(value)); };
  const validConnection = c => c && /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(c.url) && /^[a-f0-9]{48,64}$/.test(c.key);
  let local = read(KEYS.local, { days: {}, settings: C.clone(C.DEFAULT_SETTINGS) });
  if (!local.days || typeof local.days !== 'object') local.days = {};
  local.settings = C.settings(local.settings);
  let connection = read(KEYS.connection, null); if (!validConnection(connection)) connection = null;
  let identity = read(KEYS.identity, ''); if (!C.MEMBERS.some(m => m.id === identity)) identity = '';
  let date = C.today(), followsToday = true, lastToday = date;
  let shared = { days: {}, settings: C.settings(), configRevision: -1, menuImages: {}, features: {} };
  let menus = read(KEYS.cache, {});
  if (!menus || typeof menus !== 'object') menus = {};
  if (!menus['2026-10-19']) menus['2026-10-19'] = { date: '2026-10-19', dishes: ['나주곰탕*당면사리', '눈꽃치즈김치볶음밥', '[오늘의데일리팩] 치킨텐더포케'], fetchedAt: '2026-10-19T02:51:00.000Z', initial: true };
  let syncing = false, busy = false, syncError = '', lastSync = null, menuLoading = false, toastTimer;
  let menuView = 'day';
  const menuRequests = new Map(), menuLoadingDates = new Set();
  let localImages = read(KEYS.images, {});
  if (!localImages || typeof localImages !== 'object' || Array.isArray(localImages)) localImages = {};
  const imageCache = new Map(), imageErrors = new Map(), imageLoading = new Set();
  let imageDraft = null, imageReadToken = 0, imageSaving = false;
  let connectedReady = false, dialogReturnFocus = null, selectedDecision = '', draftTime = '';
  const state = () => connection ? shared : local;
  const config = () => C.settings(state().settings);
  const day = (d = date) => C.cleanDay(state().days[d]);
  const dateText = d => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 ${'일월화수목금토'[C.weekday(d)]}요일`;
  const timeText = iso => { const d = new Date(iso); return isNaN(d) ? '' : new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d); };
  const nameOf = id => C.MEMBERS.find(m => m.id === id)?.name || '';
  const uid = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, n => n.toString(16).padStart(2, '0')).join(''); };
  const icon = name => {
    const paths = name === 'megazone' ? '<path d="M3 10h18M4 10c1 7 4 10 8 10s7-3 8-10M8 6c-2-2 2-3 0-5m4 5c-2-2 2-3 0-5m4 5c-2-2 2-3 0-5"/>' : name === 'lunchtime' ? '<path d="M4 5h16v15H4zM3 5l2-3h14l2 3M8 10h8M8 14h3m3 0h2M8 18h8"/>' : '<path d="M4 4v6c0 3 5 3 5 0V4M6.5 4v17M17 4c-3 3-3 8 0 8h2M19 4v17"/>';
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  };
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4300); }
  function openDialog(title, html, wide = false) {
    dialogReturnFocus = document.activeElement; $('dialogTitle').textContent = title; $('dialogContent').innerHTML = html;
    $('appDialog').classList.toggle('wide', wide); if (!$('appDialog').open) $('appDialog').showModal();
  }
  function closeDialog() { if (imageSaving) { toast('식단 이미지를 공유하고 있어요. 완료 후 닫아 주세요.'); return; } $('appDialog').close(); if (dialogReturnFocus && document.contains(dialogReturnFocus)) dialogReturnFocus.focus(); }
  function persistLocal() {
    const cutoff = C.shiftDate(C.today(), -120);
    Object.keys(local.days).forEach(d => { if (!C.validDate(d) || d < cutoff) delete local.days[d]; });
    write(KEYS.local, local);
  }
  function renderConnection() {
    const el = $('connectionBanner');
    el.className = `connection-banner${connection ? syncError ? ' error' : ' live' : ''}`;
    if (!connection) el.innerHTML = '<span><i class="status-dot"></i>현재 이 기기에만 저장돼요. 함께 선택하려면 팀 공유를 연결하세요.</span><button data-action="settings">공유 연결</button>';
    else if (syncError) el.innerHTML = `<span><i class="status-dot"></i>${esc(syncError)}</span><button data-action="retry">다시 연결</button>`;
    else el.innerHTML = `<span><i class="status-dot"></i>${busy ? '선택을 팀에 저장하고 있어요…' : syncing && !lastSync ? '팀 점심판을 불러오고 있어요…' : connectedReady ? '팀 공유 연결됨 · 30초마다 새 선택을 확인해요' : '팀 공유 연결을 확인해 주세요'}</span><button data-action="invite">동료 초대</button>`;
  }
  function renderMembers() {
    const d = day(), s = config(), attending = C.participants(date, d, s);
    $('heroDate').textContent = dateText(date); $('heroCount').textContent = `오늘 함께 ${attending.length}명`;
    $('dateInput').value = date; $('identitySelect').value = identity;
    $('ceoCancelled').checked = d.ceoCancelled; $('ceoCancelled').disabled = busy;
    $('availabilityHint').textContent = date > s.scheduleEnd ? '대표님과 점심 기본 일정의 적용 기간이 지났어요. 설정에서 일정을 다시 확인해 주세요.' : C.weekday(date) === 0 || C.weekday(date) === 6 ? '주말은 기본적으로 쉬는 날이에요. 필요하면 내 참석 상태를 바꿔 주세요.' : d.ceoCancelled ? '오늘의 기본 대표님과 점심이 취소됐어요. 개인적으로 바꾼 참석 상태는 그대로 유지돼요.' : '팀별 대표님과 점심 일정을 반영했어요. 일정이 달라지면 내 상태만 바꿔 주세요.';
    $('membersGrid').innerHTML = C.MEMBERS.map(m => {
      const status = C.memberStatus(m.id, date, d, s), me = m.id === identity;
      return `<article class="member-card${me ? ' is-me' : ''}"><div class="member-top"><span class="avatar ${m.color}" aria-hidden="true">${m.name.slice(1)}</span><div><div class="member-name">${m.name}${me ? '<small>나</small>' : ''}</div><div class="member-team">${m.team}</div></div></div><div class="member-bottom"><span class="member-status${status.in ? '' : ' out'}"><i class="status-dot"></i>${esc(status.reason)}${status.manual && status.in ? ' · 변경' : ''}</span><button class="member-action" data-action="${me ? 'availability' : 'identity'}" data-id="${m.id}">${me ? '일정 변경' : '나로 선택'}</button></div>${status.detail ? `<p class="member-absence">${esc(status.detail)}</p>` : ''}</article>`;
    }).join('');
  }
  function menuDishesHTML(menu) {
    return `<ul class="menu-list">${menu.dishes.map((dish, ix) => `<li><span class="course">${/데일리팩|takeout|테이크/i.test(dish) ? '간편식' : `메뉴 ${ix + 1}`}</span><span>${esc(dish)}</span></li>`).join('')}</ul>`;
  }
  function renderMegaDay() {
    const menu = menus[date], source = C.menuUrl(date), loading = menuLoadingDates.has(date);
    let content = `<p class="menu-date-label">${esc(dateText(date))} · 점심</p>`;
    if (menu && Array.isArray(menu.dishes) && menu.dishes.length) {
      content += menuDishesHTML(menu) + `<div class="menu-meta"><span>${menu.initial ? '미리 확인한 식단' : menu.error ? '최근 확인한 식단 · 재조회 실패' : '자동 조회'} · ${esc(timeText(menu.fetchedAt))}</span><a href="${source}" target="_blank" rel="noopener noreferrer">Welplan 원문 ↗</a></div>`;
    } else if (menu && menu.ok && !menu.error) {
      content += `<div class="empty-menu"><strong>아직 공개된 점심 식단이 없어요</strong><p>선택한 날짜의 메뉴가 올라오면 여기서 확인할 수 있어요.</p></div>`;
    } else {
      content += `<div class="empty-menu"><strong>${loading ? '선택한 날짜의 식단을 확인하고 있어요' : '식단을 불러오지 못했어요'}</strong><p>${loading ? '공개된 점심 메뉴를 가져오는 중이에요.' : '잠시 후 새로고침하거나 원문에서 확인해 주세요.'}</p><a class="menu-source-link" href="${source}" target="_blank" rel="noopener noreferrer">선택한 날 원문 보기 ↗</a></div>`;
    }
    return content;
  }
  function renderMegaWeek() {
    const dates = C.weekDates(date), today = C.today(), thisWeek = dates[0] === C.weekDates(today)[0];
    return `<div class="week-menu-heading"><strong>${thisWeek ? '이번 주' : '선택한 주'} 식단 미리보기</strong><span>${dates[0].slice(5).replace('-', '.')} – ${dates[4].slice(5).replace('-', '.')}</span></div><div class="week-menu-list">${dates.map(d => {
      const menu = menus[d], loading = menuLoadingDates.has(d), hasDishes = menu && Array.isArray(menu.dishes) && menu.dishes.length;
      let content;
      if (hasDishes) content = `<ul>${menu.dishes.map(dish => `<li>${esc(dish)}</li>`).join('')}</ul>${menu.error ? '<p class="week-menu-status">최근 확인한 식단 · 재조회 실패</p>' : ''}`;
      else content = `<p class="week-menu-status">${loading ? '식단 확인 중…' : menu?.error ? '조회 실패 · 원문에서 확인해 주세요' : menu?.ok ? '아직 공개된 점심 식단이 없어요' : '식단을 확인하고 있어요…'}</p>`;
      return `<article class="week-menu-day${d === date ? ' selected-day' : ''}"><div class="week-menu-date"><button data-action="menuDate" data-id="${d}" aria-label="${esc(dateText(d))} 선택">${'일월화수목금토'[C.weekday(d)]}<strong>${Number(d.slice(5, 7))}.${Number(d.slice(8))}</strong>${d === today ? '<small>오늘</small>' : ''}</button></div><div class="week-menu-content">${content}<a href="${C.menuUrl(d)}" target="_blank" rel="noopener noreferrer">원문 ↗</a></div></article>`;
    }).join('')}</div><p class="tiny-note">공개된 식단만 표시해요. 날짜를 누르면 그날의 점심을 선택할 수 있어요.</p>`;
  }
  function imageSlot(scope, d = date) { return scope + ':' + (scope === 'week' ? C.weekDates(d)[0] : d); }
  function selectedMenuImage(d = date) {
    const images = connection ? shared.menuImages || {} : localImages;
    return images[imageSlot('day', d)] || images[imageSlot('week', d)] || null;
  }
  function validImageData(url) { return typeof url === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url) && url.length < 1500000; }
  function imageData(meta) { return meta && (connection ? imageCache.get(meta.id) : meta.dataUrl); }
  function renderLunchImage() {
    const meta = selectedMenuImage(), dataUrl = imageData(meta);
    let content;
    if (!meta) content = `<div class="image-empty"><span aria-hidden="true">▧</span><strong>함께 볼 식단 이미지를 올려 주세요</strong><p>카카오 채널 프로필에서 저장하거나 캡처한 식단을<br>한 사람이 올리면 동료들도 볼 수 있어요.</p></div>`;
    else {
      content = dataUrl && validImageData(dataUrl) ? `<button class="menu-photo-button" data-action="viewMenuImage" aria-label="런치타임 식단 이미지 크게 보기"><img class="menu-photo" src="${dataUrl}" alt="런치타임 ${esc(meta.startDate)}부터 ${esc(meta.endDate)}까지의 식단" loading="lazy"><span>이미지 크게 보기 ↗</span></button>` : `<div class="image-empty"><strong>${imageErrors.has(meta.id) ? '이미지를 불러오지 못했어요' : '식단 이미지를 불러오고 있어요…'}</strong>${imageErrors.has(meta.id) ? '<button class="text-button" data-action="retryMenuImage">다시 불러오기 ↻</button>' : ''}</div>`;
      content += `<div class="image-caption"><strong>${meta.scope === 'week' ? '주간 식단' : '하루 식단'} · ${esc(meta.startDate)}${meta.startDate !== meta.endDate ? ' – ' + esc(meta.endDate) : ''}</strong><span>${esc(nameOf(meta.uploadedBy) || '멤버')}님이 올림 · ${esc(timeText(meta.uploadedAt))}</span></div>`;
      if (connection && meta.scope === 'day' && shared.menuImages?.[imageSlot('week')]) content += '<p class="tiny-note">이 날짜에 따로 올린 식단을 우선 표시해요.</p>';
    }
    content += `<div class="image-share-row"><button class="secondary-button" data-action="menuImageUpload" ${busy ? 'disabled' : ''}>${meta ? '식단 이미지 교체' : '식단 이미지 올리기'}</button><span>${connection ? '팀 멤버 모두 보기' : '연결 전에는 이 기기에서만 미리보기'}</span></div>`;
    if (connection && connectedReady && !shared.features?.menuImages) content += '<p class="inline-warning">공유 이미지 기능을 사용하려면 <a href="setup.html#update">공유 서버를 한 번 업데이트해 주세요 ↗</a></p>';
    return `<div class="lunch-image-panel">${content}</div>`;
  }
  function renderMenuCards() {
    const d = day(), meStatus = identity && C.memberStatus(identity, date, d, config());
    const activeDates = menuView === 'week' ? C.weekDates(date) : [date];
    menuLoading = activeDates.some(d => menuLoadingDates.has(d));
    $('refreshMenu').disabled = menuLoading; $('refreshMenu').textContent = menuLoading ? '식단 확인 중…' : '↻ 식단 새로고침';
    $('restaurantCards').innerHTML = C.places(d).map((p, i) => {
      const chosen = d.votes[identity] === p.id, note = d.notes[p.id]; let content = '';
      if (p.id === 'megazone') {
        content = `<div class="menu-tabs" role="group" aria-label="메가존 식단 보기"><button data-action="menuView" data-id="day" aria-pressed="${menuView === 'day'}">${date === C.today() ? '오늘 식단' : '선택한 날 식단'}</button><button data-action="menuView" data-id="week" aria-pressed="${menuView === 'week'}">${C.weekDates(date)[0] === C.weekDates(C.today())[0] ? '이번 주' : '선택한 주'} 식단</button></div>${menuView === 'week' ? renderMegaWeek() : renderMegaDay()}`;
      } else if (p.id === 'lunchtime') {
        content = `<a class="channel-preview" href="${esc(p.menuUrl)}" target="_blank" rel="noopener noreferrer"><span class="channel-mark">TALK</span><div><strong>런치타임 카카오 채널 열기</strong><p>친구 추가 후 프로필의 식단 이미지를 확인해 주세요</p></div><span class="arrow">↗</span></a>${renderLunchImage()}`;
      } else content = `<p class="channel-info">${esc(p.subtitle || '동료가 제안한 오늘의 다른 식당이에요.')}</p>`;
      if (note) content += `<div class="menu-note"><strong>${esc(dateText(date))} · 함께 적은 메뉴 메모</strong>${esc(note)}</div>`;
      return `<article class="restaurant-card${chosen ? ' selected' : ''}"><div class="restaurant-head"><div class="restaurant-title"><span class="restaurant-icon ${p.id === 'lunchtime' ? 'lunchtime' : i > 1 ? 'other' : ''}">${icon(p.id)}</span><div><h3>${esc(p.name)}</h3><p class="restaurant-subtitle">${esc(p.subtitle || '오늘의 다른 식당')}</p></div></div><span class="restaurant-tag">${p.id === 'megazone' ? '우리의 기본 픽' : p.id === 'lunchtime' ? '기분 좋은 대안' : 'NEW PICK'}</span></div>${content}<div class="restaurant-bottom"><div class="restaurant-tools">${p.id === 'megazone' ? `<button data-action="source">실시간 식단 ↗</button>` : p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">지도 ↗</a>` : ''}<button data-action="note" data-id="${esc(p.id)}">${note ? '메모 수정' : '메뉴 메모'}</button>${i > 1 ? `<button data-action="remove" data-id="${esc(p.id)}">삭제</button>` : ''}</div><button class="vote-button${chosen ? ' chosen' : ''}" data-action="vote" data-id="${esc(p.id)}" aria-pressed="${chosen}" aria-disabled="${!identity || !meStatus?.in}" ${busy ? 'disabled' : ''}>${chosen ? '✓ 내 선택' : '여기로 갈래요'}</button></div></article>`;
    }).join('');
  }
  function renderDecision() {
    const d = day(), s = config(), list = C.places(d), attending = C.participants(date, d, s), votes = C.tally(date, d, s);
    const total = Object.values(votes).reduce((n, v) => n + v.length, 0), top = Math.max(0, ...Object.values(votes).map(v => v.length));
    $('voteSummary').textContent = attending.length ? `함께하는 ${attending.length}명 중 ${total}명이 골랐어요` : '아직 함께 먹는 멤버가 없어요';
    $('voteResults').innerHTML = list.map(p => `<div class="result-row"><div class="result-heading"><span>${esc(p.name)}</span><b>${votes[p.id].length}표</b></div><div class="result-track"><div class="result-bar${top > 0 && votes[p.id].length === top ? ' leading' : ''}" style="width:${attending.length ? votes[p.id].length / attending.length * 100 : 0}%"></div></div><div class="voter-names">${votes[p.id].length ? votes[p.id].map(nameOf).join(' · ') : '아직 선택한 사람이 없어요'}</div></div>`).join('');
    if (d.decision) {
      const p = list.find(p => p.id === d.decision.placeId);
      $('decisionContent').innerHTML = `<div class="confirmed"><span class="confirmed-label">✓ 오늘 점심 확정</span><h3>${esc(p.name)}</h3><p class="meeting">${esc(d.decision.time)}에 만나요</p><p class="people">${attending.map(m => m.name).join(' · ') || '참석 인원을 다시 확인해 주세요'}</p><button class="text-button" data-action="unconfirm">확정 취소 / 다시 고르기</button></div>`;
    } else {
      if (!list.some(p => p.id === selectedDecision)) selectedDecision = '';
      $('decisionContent').innerHTML = `<form id="decisionForm" class="decision-form"><label class="field-label" for="decisionPlace">함께 정한 식당</label><select id="decisionPlace" required><option value="">식당을 선택해 주세요</option>${list.map(p => `<option value="${esc(p.id)}" ${selectedDecision === p.id ? 'selected' : ''}>${esc(p.name)}${votes[p.id].length ? ` · ${votes[p.id].length}표` : ''}</option>`).join('')}</select><label class="time-row" for="meetingTime">만날 시간<input id="meetingTime" type="time" required value="${esc(draftTime || s.meetingTime)}"></label><button class="primary-button" type="submit" ${busy ? 'disabled' : ''}>오늘 점심 확정하기 <span>↗</span></button><button class="random-button" type="button" data-action="random">못 고르겠다면? 최다 득표 후보 추첨</button></form>`;
    }
  }
  function renderWeek() {
    const days = C.weekDates(date), s = config();
    $('scheduleBadge').textContent = `대표님과 점심 기본 일정 ~ ${s.scheduleEnd.replaceAll('-', '.')}`;
    $('weekHead').innerHTML = `<tr><th scope="col">우리 멤버</th>${days.map(d => `<th scope="col" class="${d === date ? 'current' : ''}"><button data-action="date" data-id="${d}">${'일월화수목금토'[C.weekday(d)]} ${Number(d.slice(5, 7))}.${Number(d.slice(8))}${d === C.today() ? '<small>TODAY</small>' : ''}</button></th>`).join('')}</tr>`;
    $('weekBody').innerHTML = C.MEMBERS.map(m => `<tr><th scope="row"><span class="avatar ${m.color}" aria-hidden="true">${m.name.slice(1)}</span>${m.name}</th>${days.map(d => { const status = C.memberStatus(m.id, d, day(d), s); return `<td class="${d === date ? 'current' : ''}"><span class="${status.in ? 'week-dot' : status.reason === '대표님과 점심' ? 'week-ceo' : 'week-out'}" aria-label="${esc(status.reason)}">${status.in ? '●' : status.reason === '대표님과 점심' ? '대표님과 점심' : '—'}${status.manual ? '*' : ''}</span></td>`; }).join('')}</tr>`).join('') + `<tr><th scope="row">함께하는 인원</th>${days.map(d => `<td class="week-count ${d === date ? 'current' : ''}">${C.participants(d, day(d), s).length}명</td>`).join('')}</tr>`;
  }
  function render() {
    const focused = document.activeElement?.id;
    if (focused === 'meetingTime') draftTime = $('meetingTime').value;
    if (focused === 'decisionPlace') selectedDecision = $('decisionPlace').value;
    renderConnection(); renderMembers(); renderMenuCards(); renderDecision(); renderWeek(); ensureMenuImage();
    if ((focused === 'meetingTime' || focused === 'decisionPlace') && $(focused)) $(focused).focus({ preventScroll: true });
  }
  function mergeResponse(result) {
    if (!result || !result.ok) throw new Error(result?.error || '공유 연결 응답을 확인하지 못했어요.');
    if (result.days) Object.entries(result.days).forEach(([d, value]) => {
      if (C.validDate(d) && (!shared.days[d] || value.revision >= shared.days[d].revision)) shared.days[d] = C.cleanDay(value);
    });
    if (result.settings && (result.configRevision || 0) >= shared.configRevision) { shared.settings = C.settings(result.settings); shared.configRevision = result.configRevision || 0; }
    shared.features = result.features || {};
    shared.menuImages = result.menuImages || {};
    connectedReady = true; lastSync = new Date(); syncError = '';
  }
  function jsonp(params, target = connection) {
    return new Promise((resolve, reject) => {
      if (!validConnection(target)) { reject(new Error('공유 주소와 팀 키를 확인해 주세요.')); return; }
      const name = 'lunchReply_' + uid(); const node = document.createElement('script');
      const query = new URLSearchParams({ ...params, key: target.key, callback: name, _: Date.now() });
      let timer;
      const clean = () => { clearTimeout(timer); node.remove(); delete window[name]; };
      window[name] = data => { clean(); resolve(data); };
      timer = setTimeout(() => { clean(); reject(new Error('공유 서버 응답이 늦어요. 연결 주소와 배포 권한을 확인해 주세요.')); }, 28000);
      node.onerror = () => { clean(); reject(new Error('공유 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.')); };
      node.referrerPolicy = 'no-referrer'; node.src = target.url + '?' + query; document.head.appendChild(node);
    });
  }
  async function sync() {
    if (!connection || syncing || busy || document.hidden) return;
    const target = connection, requestDate = date; syncing = true; renderConnection();
    try {
      const before = JSON.stringify(shared);
      const res = await jsonp({ action: 'state', date: requestDate }, target); if (target !== connection) return;
      mergeResponse(res); if (before !== JSON.stringify(shared)) render(); else renderConnection();
    }
    catch (e) { if (target === connection) { syncError = e.message; renderConnection(); } }
    finally { syncing = false; renderConnection(); if (requestDate !== date && target === connection) sync(); }
  }
  async function fetchMenuDate(currentDate, force) {
    if (menuRequests.has(currentDate)) return menuRequests.get(currentDate);
    const previous = menus[currentDate];
    if (!force && previous && !previous.initial && !previous.error && Date.now() - Date.parse(previous.fetchedAt) < 5 * 60000) return;
    menuLoadingDates.add(currentDate); renderMenuCards();
    const task = Promise.resolve().then(async () => {
      try {
        let menu;
        try {
          if (!window.LunchMenuSource) throw new Error('식단 연결 기능을 불러오지 못했어요.');
          menu = await window.LunchMenuSource.fetchDay(currentDate);
        } catch (publicError) {
          const target = connection;
          if (!target || !connectedReady) throw publicError;
          const res = await jsonp({ action: 'menu', date: currentDate }, target);
          if (!res.ok) throw new Error(res.error || '식단 원본을 불러오지 못했어요.');
          menu = res.menu;
        }
        if (!menu || menu.date !== currentDate || !Array.isArray(menu.dishes) || menu.dishes.some(x => typeof x !== 'string')) throw new Error('날짜가 맞는 식단을 확인하지 못했어요.');
        menus[currentDate] = { ...menu, ok: true, initial: false, error: false };
        const kept = Object.fromEntries(Object.entries(menus).filter(([d]) => C.validDate(d)).sort(([a], [b]) => b.localeCompare(a)).slice(0, 35));
        try { write(KEYS.cache, kept); } catch (_) { /* Menu remains visible if storage is unavailable. */ }
      } catch (e) {
        menus[currentDate] = { ...(menus[currentDate] || {}), date: currentDate, error: true };
      } finally { menuLoadingDates.delete(currentDate); menuRequests.delete(currentDate); renderMenuCards(); }
    });
    menuRequests.set(currentDate, task);
    return task;
  }
  async function loadMenu(force = false) {
    const dates = menuView === 'week' ? C.weekDates(date) : [date];
    let index = 0;
    const worker = async () => { while (index < dates.length) { const d = dates[index++]; await fetchMenuDate(d, force); } };
    await Promise.all([worker(), worker()]);
  }
  async function ensureMenuImage(force = false) {
    const meta = selectedMenuImage(), target = connection;
    if (!target || !connectedReady || !meta || imageLoading.has(meta.id) || (!force && (imageCache.has(meta.id) || imageErrors.has(meta.id)))) return;
    const requestDate = date;
    imageLoading.add(meta.id); imageErrors.delete(meta.id);
    try {
      const res = await jsonp({ action: 'menuImage', date: requestDate, scope: meta.scope, imageId: meta.id }, target);
      if (target !== connection) return;
      if (!res.ok || !res.image || res.image.id !== meta.id || !validImageData(res.image.dataUrl)) throw new Error(res.error || '식단 이미지를 확인하지 못했어요.');
      imageCache.set(meta.id, res.image.dataUrl);
      while (imageCache.size > 8) imageCache.delete(imageCache.keys().next().value);
    } catch (e) { if (target === connection) imageErrors.set(meta.id, e.message); }
    finally { imageLoading.delete(meta.id); renderMenuCards(); }
  }
  async function prepareMenuImage(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 이미지 파일을 골라 주세요.');
    if (file.size > 15 * 1024 * 1024) throw new Error('15MB 이하의 식단 이미지를 골라 주세요.');
    const url = URL.createObjectURL(file), img = new Image();
    try {
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('이미지를 열지 못했어요. 다른 파일로 다시 시도해 주세요.')); img.src = url; });
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 50000000) throw new Error('이미지가 너무 커요. 식단 부분만 캡처해서 올려 주세요.');
      let ratio = Math.min(1, 2800 / Math.max(img.naturalWidth, img.naturalHeight));
      for (let attempt = 0; attempt < 6; attempt++) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('이 브라우저에서 이미지를 준비하지 못했어요.');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', attempt < 3 ? 0.91 - attempt * 0.06 : 0.76);
        if (dataUrl.length * 0.75 <= 900 * 1024 && validImageData(dataUrl)) return { dataUrl, name: file.name.slice(0, 120), mimeType: 'image/jpeg', size: Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75) };
        ratio *= 0.84;
      }
      throw new Error('이미지 용량을 줄이지 못했어요. 식단 부분만 캡처해서 올려 주세요.');
    } finally { URL.revokeObjectURL(url); }
  }
  function uploadScopeLabel(d, scope) {
    const start = scope === 'week' ? C.weekDates(d)[0] : d, end = scope === 'week' ? C.shiftDate(start, 6) : d;
    return `${scope === 'week' ? '선택한 주 전체' : '선택한 날짜만'} · ${start}${start === end ? '' : ' – ' + end}`;
  }
  function showMenuImageUpload() {
    if (!identity) return showIdentity();
    if (connection && !connectedReady) return toast('공유 연결을 먼저 확인해 주세요.');
    if (connection && !shared.features?.menuImages) {
      openDialog('공유 이미지 기능 업데이트', '<p class="dialog-copy">기존 공유 서버를 새 버전으로 바꾸면 식단 이미지를 함께 볼 수 있어요. 설정 안내의 업데이트 순서대로 서버 코드를 교체하고, 초기 실행 후 새 버전으로 배포해 주세요.</p><a class="primary-button" href="setup.html#update">업데이트 안내 보기 ↗</a>'); return;
    }
    imageDraft = null; imageReadToken++; imageSaving = false;
    const d = date, meta = selectedMenuImage(), scope = meta?.scope || 'week';
    openDialog('런치타임 식단 이미지 올리기', `<p class="dialog-copy">카카오 채널 프로필의 식단을 저장하거나 캡처한 이미지를 선택해 주세요. ${connection ? '올리면 팀 멤버 모두가 같은 이미지를 볼 수 있어요.' : '지금은 이 기기에서만 미리 볼 수 있어요. 모두에게 공유하려면 먼저 팀 공유를 연결해 주세요.'}</p><form id="menuImageForm" class="dialog-form" data-date="${d}"><label>식단 적용 기간<select id="menuImageScope" name="scope"><option value="week" ${scope === 'week' ? 'selected' : ''}>${uploadScopeLabel(d, 'week')}</option><option value="day" ${scope === 'day' ? 'selected' : ''}>${uploadScopeLabel(d, 'day')}</option></select></label><label>식단 이미지<input type="file" id="menuImageFile" accept="image/jpeg,image/png,image/webp" required></label><p class="upload-hint">JPG · PNG · WebP / 최대 15MB · 공유하기 좋게 자동으로 크기를 조정해요.</p><div id="menuImagePreview" class="upload-preview" hidden></div><p id="menuImageStatus" class="upload-status" role="status">적용 기간과 이미지 속 식단 날짜가 맞는지 확인해 주세요.</p><button id="uploadMenuImageButton" class="primary-button" type="submit" disabled>${connection ? '모두에게 식단 공유하기' : '이 기기에서 미리보기'}</button>${connection ? '' : '<a class="text-button" href="setup.html">동료들과 함께 쓰는 공유 연결 안내 ↗</a>'}</form>`);
    const form = $('menuImageForm');
    form.dataset.expectedWeek = (connection ? shared.menuImages : localImages)?.[imageSlot('week', d)]?.id || '';
    form.dataset.expectedDay = (connection ? shared.menuImages : localImages)?.[imageSlot('day', d)]?.id || '';
    $('menuImageFile').addEventListener('change', async e => {
      const token = ++imageReadToken; imageDraft = null; $('uploadMenuImageButton').disabled = true; $('menuImagePreview').hidden = true;
      const file = e.target.files?.[0]; if (!file) return;
      $('menuImageStatus').textContent = '식단 이미지를 준비하고 있어요…';
      try {
        const ready = await prepareMenuImage(file);
        if (token !== imageReadToken || !$('appDialog').open || !$('menuImageForm')) return;
        imageDraft = ready; $('menuImagePreview').innerHTML = `<img src="${ready.dataUrl}" alt="업로드할 런치타임 식단 미리보기">`; $('menuImagePreview').hidden = false;
        $('menuImageStatus').textContent = `${ready.name} · 준비 완료. 식단 날짜를 확인한 뒤 올려 주세요.`; $('uploadMenuImageButton').disabled = false;
      } catch (error) { if (token === imageReadToken && $('menuImageStatus')) $('menuImageStatus').textContent = error.message; }
    });
  }
  async function saveMenuImage(form) {
    if (!imageDraft || imageSaving) return;
    const scope = $('menuImageScope').value, d = form.dataset.date, draft = imageDraft;
    if (!C.validDate(d) || !['day', 'week'].includes(scope)) return toast('식단 날짜와 적용 기간을 확인해 주세요.');
    imageSaving = true; $('uploadMenuImageButton').disabled = true; $('menuImageFile').disabled = true; $('menuImageScope').disabled = true;
    $('menuImageStatus').textContent = connection ? '식단 이미지를 팀에 공유하고 있어요…' : '이 기기에 미리보기를 저장하고 있어요…';
    let saved = false;
    if (connection) {
      saved = await mutate('menuImageUpload', { scope, dataUrl: draft.dataUrl, name: draft.name, expectedImageId: scope === 'week' ? form.dataset.expectedWeek : form.dataset.expectedDay }, d);
    } else {
      const start = scope === 'week' ? C.weekDates(d)[0] : d;
      const meta = { ...draft, id: 'local_' + uid(), scope, date: start, startDate: start, endDate: scope === 'week' ? C.shiftDate(start, 6) : d, uploadedBy: identity, uploadedAt: new Date().toISOString() };
      const next = Object.fromEntries(Object.entries({ ...localImages, [imageSlot(scope, d)]: meta }).sort((a, b) => String(b[1].uploadedAt).localeCompare(String(a[1].uploadedAt))).slice(0, 3));
      try { write(KEYS.images, next); localImages = next; saved = true; } catch (_) { $('menuImageStatus').textContent = '기기 저장 공간이 부족해요. 팀 공유 연결 후 다시 올려 주세요.'; }
    }
    imageSaving = false;
    if (saved) { closeDialog(); render(); ensureMenuImage(); toast(connection ? '식단 이미지를 공유했어요. 동료들도 같은 이미지를 볼 수 있어요.' : '이 기기에 미리보기를 저장했어요. 공유 연결 후 다시 올리면 동료들도 볼 수 있어요.'); }
    else if ($('menuImageForm')) { $('uploadMenuImageButton').disabled = false; $('menuImageFile').disabled = false; $('menuImageScope').disabled = false; if (connection) $('menuImageStatus').textContent = syncError || '이미지를 공유하지 못했어요. 다시 시도해 주세요.'; }
  }
  function viewMenuImage() {
    const meta = selectedMenuImage(), dataUrl = imageData(meta); if (!meta || !validImageData(dataUrl)) return;
    openDialog('런치타임 · ' + (meta.scope === 'week' ? '주간 식단' : dateText(meta.date)), `<p class="dialog-copy">${esc(meta.startDate)}${meta.startDate !== meta.endDate ? ' – ' + esc(meta.endDate) : ''} · ${esc(nameOf(meta.uploadedBy))}님이 올린 식단</p><div class="full-menu-image"><img src="${dataUrl}" alt="런치타임 식단 이미지"></div>`, true);
  }
  async function mutate(type, payload, requestedDate = date) {
    if (busy) return false;
    if (!identity) { showIdentity(); return false; }
    if (connection && !connectedReady) { toast('공유 연결을 먼저 확인해 주세요.'); return false; }
    const opDate = requestedDate, actor = identity, op = { type, payload, actor, id: uid() }, target = connection;
    let next;
    try { if (!['settings', 'menuImageUpload'].includes(type)) next = C.applyOperation(day(opDate), opDate, config(), op); }
    
    catch (e) { toast(e.message); return false; }
    if (!target && type === 'menuImageUpload') return false;
    if (!target) {
      const prev = C.clone(local);
      try { if (type === 'settings') local.settings = C.settings(payload); else local.days[opDate] = next; persistLocal(); render(); return true; }
      catch (_) { local = prev; toast('기기에 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.'); return false; }
    }
    busy = true; render();
    try {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 24000);
      try { await fetch(target.url, { method: 'POST', mode: 'no-cors', redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ key: target.key, date: opDate, op, configRevision: shared.configRevision }), signal: controller.signal }); }
      finally { clearTimeout(timer); }
      // Opaque POST responses are never treated as success. A server receipt must confirm it.
      for (let n = 0; n < 4; n++) {
        const res = await jsonp({ action: 'state', date: opDate, receipt: op.id }, target);
        if (target !== connection) throw new Error('공유 공간이 변경됐어요. 이전 공간에서 저장 결과를 확인해 주세요.');
        mergeResponse(res);
        if (res.receipt) { if (!res.receipt.ok) throw new Error(res.receipt.error || '저장되지 않았어요.'); return true; }
        await new Promise(resolve => setTimeout(resolve, 700 + n * 600));
      }
      throw new Error('저장 완료 응답을 받지 못했어요. 새로고침 후 결과를 확인해 주세요.');
    } catch (e) { syncError = e.name === 'AbortError' ? '저장 확인 시간이 지났어요. 새로고침 후 결과를 확인해 주세요.' : e.message; toast(syncError); return false; }
    finally { busy = false; render(); }
  }
  function changeDate(next) {
    if (!C.validDate(next)) { toast('올바른 날짜를 선택해 주세요.'); return; }
    date = next; followsToday = date === C.today(); selectedDecision = ''; draftTime = ''; render(); sync(); loadMenu();
  }
  function setIdentity(id) {
    if (!C.MEMBERS.some(m => m.id === id)) return;
    identity = id; try { write(KEYS.identity, id); } catch (_) {} render(); toast(nameOf(id) + '님으로 선택했어요.');
  }
  function showIdentity() { openDialog('먼저 내 이름을 알려주세요', '<p class="dialog-copy">내 이름으로 식당을 고르고, 내 참석 상태를 바꿔요.</p><div class="choice-grid">' + C.MEMBERS.map(m => `<button data-action="chooseIdentity" data-id="${m.id}">${m.name}<small style="display:block;color:#89917f;font-weight:400">${m.team}</small></button>`).join('') + '</div>'); }
  function showAvailability() {
    if (!identity) return showIdentity();
    const current = day().overrides[identity] || 'auto';
    openDialog(nameOf(identity) + '님의 ' + dateText(date), `<p class="dialog-copy">오늘만 바꿀 수 있어요. 다른 날짜의 기본 일정은 유지됩니다.</p><div class="availability-options">${[['auto','기본 일정 따르기','요일별 대표님과 점심 일정을 자동으로 반영해요'],['in','오늘 함께 먹어요','대표님과 점심 일정이 달라졌거나 함께 먹을 수 있어요'],['out','오늘 점심 안 먹어요','속이 안 좋음 · 선약 · 병원 등 / 사유는 선택사항'],['ceo','오늘은 대표님과 점심','기본 일정과 달리 대표님과 점심에 참석해요']].map(([id,title,sub]) => `<button data-action="${id === 'out' ? 'absence' : 'setAvailability'}" data-id="${id}" class="${current === id ? 'active' : ''}">${title}<small>${sub}</small></button>`).join('')}</div>`);
  }
  function showAbsence() {
    const current = day().absenceReasons[identity] || '';
    const options = ['', '속이 안 좋아요', '선약이 있어요', '병원에 가요', '개인 사정'];
    const custom = current && !options.includes(current);
    openDialog('오늘 점심 안 먹어요', `<p class="dialog-copy">${esc(dateText(date))}의 참석 인원과 투표 집계에서 빠져요. 사유는 남기지 않아도 됩니다. 적은 사유는 점심판 멤버에게 보여요.</p><form id="absenceForm" class="dialog-form"><label>사유 · 선택<select name="reason" id="absenceReason">${options.map(x => `<option value="${esc(x)}" ${current === x ? 'selected' : ''}>${x || '사유는 남기지 않을게요'}</option>`).join('')}<option value="custom" ${custom ? 'selected' : ''}>직접 입력</option></select></label><label id="customReasonLabel" ${custom ? '' : 'hidden'}>한 줄 메모<input name="customReason" maxlength="60" value="${custom ? esc(current) : ''}" placeholder="필요한 내용만 간단히 남겨 주세요"></label><button class="primary-button">오늘 안 먹는 것으로 저장</button></form>`);
  }
  function showSource() {
    const url = C.menuUrl(date);
    openDialog('메가존 · ' + dateText(date), `<p class="dialog-copy">Welplan의 실시간 원문입니다. 원문 서비스가 열리지 않으면 <a href="${url}" target="_blank" rel="noopener noreferrer"><u>새 창에서 확인하세요 ↗</u></a></p><iframe class="menu-frame" style="height:60vh" title="메가존 원문 식단" src="${url}" referrerpolicy="no-referrer"></iframe>`, true);
  }
  function showNote(id) {
    if (!identity) return showIdentity(); const p = C.places(day()).find(p => p.id === id); if (!p) return;
    openDialog(p.name + ' · 오늘 메뉴 메모', `<p class="dialog-copy">${esc(dateText(date))}에만 표시됩니다. 공유 연결 시 동료들도 함께 볼 수 있어요.</p><form id="noteForm" class="dialog-form" data-id="${esc(id)}"><label>메뉴 또는 전달할 내용<textarea name="text" maxlength="300" placeholder="예: 오늘 제육볶음과 생선까스가 나온대요.">${esc(day().notes[id] || '')}</textarea></label><button class="primary-button" type="submit">메모 저장</button></form>`);
  }
  function showAddPlace() {
    if (!identity) return showIdentity();
    openDialog('오늘은 다른 곳도 좋아요', '<p class="dialog-copy">오늘의 식당 후보에 추가해요. 지도 링크가 있으면 동료들이 찾기 쉬워요.</p><form id="addForm" class="dialog-form"><label>식당 이름<input name="name" required maxlength="30" placeholder="가고 싶은 식당 이름"></label><label>한 줄 소개 · 선택<input name="subtitle" maxlength="60" placeholder="예: 뜨끈한 국물이 생각나는 날"></label><label>지도 링크 · 선택<input name="url" type="url" placeholder="https://naver.me/..."></label><button class="primary-button" type="submit">오늘 후보에 추가</button></form>');
  }
  function showSettings() {
    const s = config();
    openDialog('우리 점심판 설정', `<section class="settings-block"><h3>동료와 함께 쓰기</h3><p class="dialog-copy">${connection ? '초대 링크를 받은 동료는 같은 선택과 일정을 볼 수 있어요. 이름 선택 방식이며, 팀 링크를 가진 사람은 이 점심판을 수정할 수 있습니다.' : '처음 한 번만 공유 서버를 연결하면, 다섯 사람의 선택이 같은 점심판에 저장돼요.'}</p><div class="button-row"><a class="secondary-button" href="setup.html">코딩 없이 연결하는 안내 ↗</a>${connection ? '<button class="secondary-button" data-action="invite">동료 초대 링크</button>' : ''}</div><details style="margin-top:15px"><summary style="font-size:12px;cursor:pointer">${connection ? '공유 연결 정보 변경' : '이미 공유 주소가 있어요'}</summary><form id="connectionForm" class="dialog-form" style="margin-top:13px"><label>Apps Script 웹 앱 URL<input name="url" type="url" required value="${esc(connection?.url || '')}" placeholder="https://script.google.com/macros/s/.../exec"></label><label>팀 키<input name="key" type="password" required autocomplete="off" value="${esc(connection?.key || read(KEYS.pending, '') || '')}"></label><button class="primary-button">연결 확인하고 저장</button></form></details>${connection ? '<button data-action="disconnect" class="text-button" style="margin-top:13px">이 기기에서 공유 연결 해제</button>' : ''}</section><section class="settings-block"><h3>요일별 대표님과 점심</h3><p class="dialog-copy">체크한 요일은 함께 먹는 인원에서 제외돼요. 공유 연결 시 이 기본 일정도 팀 전체에 적용됩니다.</p><form id="scheduleForm" class="dialog-form">${C.MEMBERS.map(m => `<div><span style="font-size:12px;font-weight:650">${m.name} <small style="font-weight:400;color:#858e7a">${m.team}</small></span><div class="checkbox-grid">${[1,2,3,4,5].map(n => `<label><input type="checkbox" name="${m.id}" value="${n}" ${s.ceoDays[m.id].includes(n) ? 'checked' : ''}>${'일월화수목금토'[n]}</label>`).join('')}</div></div>`).join('')}<label>기본 일정 적용 마지막 날<input name="scheduleEnd" type="date" required min="2020-01-01" max="2099-12-31" value="${s.scheduleEnd}"></label><label>기본 만남 시간 · 수정 가능<input name="meetingTime" type="time" required value="${s.meetingTime}"></label><button class="primary-button">기본 일정 저장</button></form></section>`);
  }
  async function saveConnection(next) {
    if (!validConnection(next)) { toast('웹 앱 /exec 주소와 팀 키를 확인해 주세요.'); return false; }
    try {
      toast('공유 서버와 연결하고 있어요…'); const result = await jsonp({ action: 'state', date }, next);
      if (!result.ok) throw new Error(result.error || '팀 키를 확인해 주세요.');
      write(KEYS.connection, next); connection = next; imageCache.clear(); imageErrors.clear(); shared = { days: {}, settings: C.settings(), configRevision: -1, menuImages: {}, features: {} }; mergeResponse(result);
      render(); loadMenu(true); return true;
    } catch (e) { toast(e.message); return false; }
  }
  function shareEncode(value) { const bytes = new TextEncoder().encode(JSON.stringify(value)); let str = ''; bytes.forEach(b => { str += String.fromCharCode(b); }); return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
  function shareDecode(str) { if (str.length > 18000) throw new Error('링크가 너무 길어요.'); const raw = atob(str.replaceAll('-', '+').replaceAll('_', '/')); return JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0)))); }
  async function copy(text, success) {
    try { await navigator.clipboard.writeText(text); toast(success || '복사했어요.'); }
    catch (_) { openDialog('아래 내용을 복사해 주세요', `<p class="dialog-copy">자동 복사가 차단되어 직접 복사할 수 있게 준비했어요.</p><textarea id="copyText" style="width:100%;height:160px;padding:12px;font:inherit;font-size:12px;border:1px solid #d8dfcf;border-radius:9px" readonly>${esc(text)}</textarea>`); $('copyText').select(); }
  }
  async function shareLink() {
    if (location.protocol === 'file:') { toast('GitHub Pages에 올린 뒤 링크를 공유해 주세요.'); return; }
    const base = new URL('./', location.href).href;
    if (connection) await copy(base + '#join=' + shareEncode(connection), '팀 초대 링크를 복사했어요. 동료에게 전달해 주세요.');
    else { const url = base + '#snapshot=' + shareEncode({ date, day: day(), settings: config() }); await copy(url, '현재 선택 결과 링크를 복사했어요. 이후 변경은 자동 공유되지 않아요.'); }
  }
  function summary() {
    const d = day(), names = C.participants(date, d, config()).map(m => m.name), counts = C.tally(date, d, config());
    const lines = [`[우리 점심 · ${dateText(date)}]`, `함께: ${names.join(', ') || '참석 인원 미정'}`];
    if (d.decision) { const p = C.places(d).find(x => x.id === d.decision.placeId); lines.push(`장소: ${p.name}`, `시간: ${d.decision.time}`); if (p.url) lines.push(p.id === 'megazone' ? C.menuUrl(date) : p.url); }
    else { lines.push('장소: 아직 고르는 중'); C.places(d).forEach(p => lines.push(`${p.name}: ${counts[p.id].length}표`)); }
    return lines.join('\n');
  }
  async function handleFragment() {
    const hash = location.hash.slice(1); if (!hash.startsWith('join=') && !hash.startsWith('snapshot=')) return;
    try {
      const value = shareDecode(hash.split('=')[1]); history.replaceState(null, '', location.pathname + location.search);
      if (hash.startsWith('join=')) {
        if (!validConnection(value)) throw new Error('유효하지 않은 초대 링크예요.');
        if (connection && connection.url === value.url && connection.key === value.key) { if (!identity) showIdentity(); return; }
        openDialog('우리 점심판에 초대받았어요', '<p class="dialog-copy">이 팀의 점심 선택과 일정을 함께 볼 수 있어요. 연결 전 이 기기에만 저장한 내용은 팀 공유 공간으로 옮겨지지 않습니다.</p><button id="acceptInvite" class="primary-button">팀 점심판 연결하기</button>');
        $('acceptInvite').addEventListener('click', async () => { $('acceptInvite').disabled = true; if (await saveConnection(value)) { closeDialog(); if (!identity) showIdentity(); } else if ($('acceptInvite')) $('acceptInvite').disabled = false; });
      } else {
        if (!C.validDate(value.date)) throw new Error('올바르지 않은 선택 결과 링크예요.');
        if (connection) { toast('공유 연결 중에는 팀의 최신 내용을 사용해요.'); changeDate(value.date); return; }
        openDialog('동료가 보낸 점심 선택', `<p class="dialog-copy">${esc(dateText(value.date))}의 전달 당시 선택 결과예요. 불러오면 이 기기의 기본 일정과 해당 날짜 내용을 바꿉니다. 이후 변경은 자동 공유되지 않아요.</p><button id="acceptSnapshot" class="primary-button">이 선택 결과 불러오기</button>`);
        $('acceptSnapshot').onclick = () => { const previous = C.clone(local); try { local.days[value.date] = C.cleanDay(value.day); local.settings = C.settings(value.settings); persistLocal(); closeDialog(); changeDate(value.date); } catch (_) { local = previous; toast('선택 결과를 저장하지 못했어요.'); } };
      }
    } catch (e) { toast(e.message); }
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-action]'); if (!b) return;
    const action = b.dataset.action, id = b.dataset.id;
    if (action === 'identity') setIdentity(id);
    else if (action === 'chooseIdentity') { setIdentity(id); closeDialog(); }
    else if (action === 'availability') showAvailability();
    else if (action === 'absence') showAbsence();
    else if (action === 'setAvailability') { closeDialog(); if (await mutate('availability', { value: id })) toast('오늘 참석 상태를 바꿨어요.'); }
    else if (action === 'vote') {
      if (!identity) return showIdentity();
      if (!C.memberStatus(identity, date, day(), config()).in) { toast('함께 먹는 상태로 바꾸면 선택할 수 있어요.'); return showAvailability(); }
      const isChosen = day().votes[identity] === id;
      if (await mutate('vote', { placeId: isChosen ? null : id })) toast(isChosen ? '내 선택을 취소했어요.' : '오늘 점심 후보를 골랐어요.');
    }
    else if (action === 'menuView') { menuView = id === 'week' ? 'week' : 'day'; renderMenuCards(); loadMenu(); }
    else if (action === 'menuDate') { menuView = 'day'; changeDate(id); }
    else if (action === 'menuImageUpload') showMenuImageUpload();
    else if (action === 'viewMenuImage') viewMenuImage();
    else if (action === 'retryMenuImage') ensureMenuImage(true);
    else if (action === 'note') showNote(id);
    else if (action === 'remove') { if (confirm('이 식당과 연결된 선택을 오늘 후보에서 삭제할까요?')) await mutate('removePlace', { placeId: id }); }
    else if (action === 'settings') showSettings();
    else if (action === 'retry') { syncError = ''; sync(); loadMenu(true); }
    else if (action === 'invite') shareLink();
    else if (action === 'source') showSource();
    else if (action === 'date') changeDate(id);
    else if (action === 'unconfirm') { if (await mutate('unconfirm', {})) toast('확정을 취소했어요. 다시 골라주세요.'); }
    else if (action === 'disconnect') {
      if (busy) return toast('저장이 끝난 뒤 연결을 해제해 주세요.');
      if (confirm('이 기기의 공유 연결을 해제할까요? 팀 공유 데이터는 삭제되지 않습니다.')) { connection = null; connectedReady = false; syncError = ''; imageCache.clear(); imageErrors.clear(); try { localStorage.removeItem(KEYS.connection); } catch (_) {} closeDialog(); render(); }
    }
    else if (action === 'random') {
      const counts = C.tally(date, day(), config()), max = Math.max(0, ...Object.values(counts).map(a => a.length));
      const pool = C.places(day()).filter(p => counts[p.id].length === max), n = crypto.getRandomValues(new Uint32Array(1))[0];
      const chosen = pool[n % pool.length]; selectedDecision = chosen.id; renderDecision(); toast(chosen.name + ' 당첨! 괜찮다면 확정해 주세요.');
    }
  });
  document.addEventListener('submit', async e => {
    const form = e.target; if (!['decisionForm','addForm','noteForm','connectionForm','scheduleForm','absenceForm','menuImageForm'].includes(form.id)) return;
    e.preventDefault(); const f = new FormData(form);
    if (form.id === 'menuImageForm') { await saveMenuImage(form); }
    else if (form.id === 'decisionForm') { if (await mutate('decision', { placeId: $('decisionPlace').value, time: $('meetingTime').value })) toast('오늘 점심을 확정했어요!'); }
    else if (form.id === 'absenceForm') { const reason = f.get('reason') === 'custom' ? f.get('customReason') : f.get('reason'); if (await mutate('availability', { value: 'out', reason })) { closeDialog(); toast('오늘 점심에 함께하지 않는 것으로 저장했어요.'); } }
    else if (form.id === 'addForm') { const p = { id: 'extra_' + uid(), name: f.get('name'), subtitle: f.get('subtitle'), url: f.get('url') }; if (await mutate('addPlace', p)) { closeDialog(); toast('오늘의 다른 식당을 추가했어요.'); } }
    else if (form.id === 'noteForm') { if (await mutate('note', { placeId: form.dataset.id, text: f.get('text') })) { closeDialog(); toast('메뉴 메모를 저장했어요.'); } }
    else if (form.id === 'connectionForm') { const submit = form.querySelector('button'); submit.disabled = true; if (await saveConnection({ url: String(f.get('url')).trim(), key: String(f.get('key')).trim() })) { closeDialog(); toast('공유 연결이 준비됐어요. 동료를 초대해 주세요.'); } else submit.disabled = false; }
    else if (form.id === 'scheduleForm') {
      const payload = { scheduleEnd: f.get('scheduleEnd'), meetingTime: f.get('meetingTime'), ceoDays: Object.fromEntries(C.MEMBERS.map(m => [m.id, f.getAll(m.id).map(Number)])) };
      if (!C.validDate(payload.scheduleEnd)) return toast('일정 적용 기간을 확인해 주세요.');
      if (await mutate('settings', payload)) { closeDialog(); toast('기본 일정을 저장했어요.'); }
    }
  });
  document.addEventListener('change', e => { if (e.target.id === 'decisionPlace') selectedDecision = e.target.value; if (e.target.id === 'meetingTime') draftTime = e.target.value; if (e.target.id === 'absenceReason') $('customReasonLabel').hidden = e.target.value !== 'custom'; });
  $('identitySelect').innerHTML += C.MEMBERS.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  $('identitySelect').addEventListener('change', e => { if (e.target.value) setIdentity(e.target.value); else { identity = ''; try { localStorage.removeItem(KEYS.identity); } catch (_) {} render(); } });
  $('dateInput').addEventListener('change', e => changeDate(e.target.value));
  $('prevDate').onclick = () => changeDate(C.shiftDate(date, -1)); $('nextDate').onclick = () => changeDate(C.shiftDate(date, 1)); $('todayBtn').onclick = () => changeDate(C.today());
  $('settingsBtn').onclick = showSettings; $('addPlaceBtn').onclick = showAddPlace; $('refreshMenu').onclick = () => loadMenu(true);
  $('ceoCancelled').onchange = async e => { const checked = e.target.checked; if (!identity) { renderMembers(); return showIdentity(); } if (await mutate('ceo', { cancelled: checked })) toast(checked ? '오늘 기본 대표님과 점심을 취소했어요.' : '오늘 대표님과 점심 기본 일정을 복원했어요.'); else renderMembers(); };
  $('copySummary').onclick = () => copy(summary(), '점심 공지를 복사했어요. 메신저에 붙여넣어 주세요.'); $('shareLink').onclick = shareLink;
  $('closeDialog').onclick = closeDialog;
  $('appDialog').addEventListener('close', () => { imageReadToken++; imageDraft = null; });
  $('appDialog').addEventListener('cancel', e => { if (imageSaving) e.preventDefault(); });
  $('appDialog').addEventListener('click', e => { if (e.target === $('appDialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkMidnight(); sync(); loadMenu(); } });
  function checkMidnight() { const now = C.today(); if (now !== lastToday) { lastToday = now; if (followsToday) changeDate(now); else renderMembers(); } }
  setInterval(() => { checkMidnight(); sync(); }, 30000);
  setInterval(() => { if (!document.hidden) loadMenu(); }, 5 * 60000);
  render(); handleFragment(); sync(); loadMenu();
})();
