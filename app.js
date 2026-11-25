(function () {
  'use strict';
  const C = window.LunchCore;
  const compareMembers = (a, b) => a.team.localeCompare(b.team, 'ko') || a.name.localeCompare(b.name, 'ko');
  const MEMBERS = C.MEMBERS.slice().sort(compareMembers);
  const teamGroups = members => [...new Set(members.map(m => m.team))].map(team => ({ team, members: members.filter(m => m.team === team) }));
  const KEYS = { local: 'sandsLunch.local.v1', identity: 'sandsLunch.identity.v1', connection: 'sandsLunch.connection.v1', pending: 'sandsLunch.pendingKey.v1', kakao: 'sandsLunch.kakaoProfile.v1', gangnam: 'sandsLunch.gangnamMenu.v5' };
  const KAKAO_CHANNEL = 'https://pf.kakao.com/_xbbMPn';
  const KAKAO_REFRESH_MS = 5 * 60000;
  const $ = id => document.getElementById(id);
  const esc = text => String(text == null ? '' : text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } };
  const write = (key, value) => { localStorage.setItem(key, JSON.stringify(value)); };
  const validConnection = c => c && /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(c.url) && /^[a-f0-9]{48,64}$/.test(c.key);
  let local = read(KEYS.local, { days: {}, settings: C.clone(C.DEFAULT_SETTINGS) });
  if (!local.days || typeof local.days !== 'object') local.days = {};
  local.settings = C.settings(local.settings);
  let connection = read(KEYS.connection, null); if (!validConnection(connection)) connection = null;
  let identity = read(KEYS.identity, ''); if (!MEMBERS.some(m => m.id === identity)) identity = '';
  const deepLinkDate = new URLSearchParams(location.search || '').get('date');
  let date = C.validDate(deepLinkDate) ? deepLinkDate : C.today(), followsToday = date === C.today(), lastToday = C.today();
  let shared = { days: {}, settings: C.settings(), configRevision: -1, menuImages: {}, features: {} };
  let syncing = false, busy = false, syncError = '', lastSync = null, toastTimer;
  let guideCategory = '전체', guideQuery = '', guideLimit = 6;
  const GUIDE_CATEGORIES = ['한식', '중식', '일식', '양식', '분식', '아시안'];
  const megaPhotos = new Map(), megaLoads = new Map(), megaErrors = new Set();
  let megaDraft = null;
  let kakaoProfile = cleanKakaoProfile(read(KEYS.kakao, null));
  let kakaoLoading = false, kakaoWaiting = false, kakaoError = '', kakaoPhotoError = '', kakaoRequest = null, lastKakaoAttempt = 0;
  let gangnamMenus = read(KEYS.gangnam, {});
  if (!gangnamMenus || typeof gangnamMenus !== 'object') gangnamMenus = {};
  let gangnamLoading = false, gangnamAttempt = {}, gangnamRequests = {}, gangnamPhotoErrors = new Set();
  let connectedReady = false, dialogReturnFocus = null, selectedDecision = '', draftTime = '';
  const state = () => connection ? shared : local;
  const config = () => C.settings(state().settings);
  const day = (d = date) => C.cleanDay(state().days[d]);
  const dayReady = (d = date) => !connection || connectedReady && Object.prototype.hasOwnProperty.call(shared.days, d);
  const needsServerUpdate = () => !!connection && connectedReady && (!shared.features.explicitAttendance || !shared.features.lunchPairs || !shared.features.ceoVenue || !shared.features.separateGroups || !shared.features.separateVenues || !shared.features.joinRequests);
  const dateText = d => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 ${'일월화수목금토'[C.weekday(d)]}요일`;
  const timeText = iso => { const d = new Date(iso); return isNaN(d) ? '' : new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d); };
  const nameOf = id => MEMBERS.find(m => m.id === id)?.name || '';
  const ceoMembers = (d = date) => MEMBERS.filter(m => C.memberStatus(m.id, d, day(d), config()).kind === 'ceo').sort(compareMembers);
  const uid = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, n => n.toString(16).padStart(2, '0')).join(''); };
  const icon = name => {
    const paths = name === 'megazone' ? '<path d="M3 10h18M4 10c1 7 4 10 8 10s7-3 8-10M8 6c-2-2 2-3 0-5m4 5c-2-2 2-3 0-5m4 5c-2-2 2-3 0-5"/>' : name === 'lunchtime' ? '<path d="M4 5h16v15H4zM3 5l2-3h14l2 3M8 10h8M8 14h3m3 0h2M8 18h8"/>' : '<path d="M4 4v6c0 3 5 3 5 0V4M6.5 4v17M17 4c-3 3-3 8 0 8h2M19 4v17"/>';
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  };
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4300); }
  function openDialog(title, html, wide = false) {
    if (!$('appDialog').open) dialogReturnFocus = document.activeElement;
    $('dialogTitle').textContent = title; $('dialogContent').innerHTML = html;
    $('appDialog').classList.toggle('wide', wide); if (!$('appDialog').open) $('appDialog').showModal();
  }
  function closeDialog() { $('appDialog').close(); const focusTarget = dialogReturnFocus?.id ? $(dialogReturnFocus.id) : dialogReturnFocus; if (focusTarget && document.contains(focusTarget)) focusTarget.focus({ preventScroll: true }); }
  function persistLocal() {
    const cutoff = C.shiftDate(C.today(), -120);
    Object.keys(local.days).forEach(d => { if (!C.validDate(d) || d < cutoff) delete local.days[d]; });
    write(KEYS.local, local);
  }
  function renderConnection() {
    const el = $('connectionBanner');
    el.className = `connection-banner${connection ? syncError || needsServerUpdate() ? ' error' : ' live' : ''}`;
    if (!connection) el.innerHTML = '<span><i class="status-dot"></i>현재 이 기기에만 저장돼요. 함께 선택하려면 팀 공유를 연결하세요.</span><button data-action="settings">공유 연결</button>';
    else if (syncError) el.innerHTML = `<span><i class="status-dot"></i>${esc(syncError)}</span><button data-action="retry">다시 연결</button>`;
    else if (needsServerUpdate()) el.innerHTML = '<span><i class="status-dot"></i>모임 참여 요청·알림 기능을 사용하려면 공유 서버를 업데이트해 주세요.</span><a href="setup.html#update">업데이트 안내 ↗</a>';
    else el.innerHTML = `<span><i class="status-dot"></i>${busy ? '선택을 팀에 저장하고 있어요…' : syncing && !lastSync ? '팀 점심판을 불러오고 있어요…' : connectedReady ? '팀 공유 연결됨 · 30초마다 새 선택을 확인해요' : '팀 공유 연결을 확인해 주세요'}</span><button data-action="invite">동료 초대</button>`;
  }
  function renderMyResponse() {
    const d = day(), mine = MEMBERS.find(m => m.id === identity), status = mine && dailyStatus(mine, date);
    const disabled = busy || !dayReady() || needsServerUpdate(), target = date === C.today() ? '오늘' : '이날';
    const attrs = `data-date="${date}" data-member="${identity}" ${disabled ? 'disabled' : ''}`;
    $('myResponseTitle').textContent = `${target} 점심, 어떻게 할까요?`;
    let content = `<p class="response-status${status ? ' is-' + status.kind : ''}">${mine ? `<span>${esc(mine.name)}님의 선택</span><strong>${dayReady() ? esc(status.label) : '확인 중…'}</strong>` : '내 이름을 고르고 아래 버튼으로 점심 여부를 알려 주세요.'}</p>`;
    content += `<div class="response-actions" role="group" aria-label="${esc(dateText(date))} 내 점심 선택"><button id="choiceIn" class="response-option is-in" data-action="setAvailability" data-id="in" ${attrs} aria-pressed="${status?.kind === 'in'}"><strong>함께 먹기</strong><small>같이 먹는 인원에 참여</small></button><button id="choiceSeparate" class="response-option is-separate" data-action="separate" ${attrs} aria-pressed="${status?.kind === 'separate'}"><strong>따로 먹기</strong><small>동료와 따로 또는 개별 식사</small></button><button id="choiceOut" class="response-option is-out" data-action="absence" ${attrs} aria-pressed="${status?.kind === 'out'}"><strong>안 먹기</strong><small>불참 사유는 선택사항</small></button></div>`;
    content += `<div class="response-secondary"><button class="text-button" data-action="setAvailability" data-id="pending" ${attrs}>선택 취소 · 미선택으로</button><button class="text-button" data-action="setAvailability" data-id="ceo" ${attrs}>대표님과 먹어요</button></div>`;
    if (status?.kind === 'in') content += `<div class="response-cafeteria-picker"><strong>일반 점심 장소 · 세 곳 중 택 1</strong><div class="response-cafeteria-buttons">${C.PLACES.map(p => `<button class="${d.votes[identity] === p.id ? 'active' : ''}" data-action="vote" data-id="${p.id}" ${disabled ? 'disabled' : ''} aria-pressed="${d.votes[identity] === p.id}">${d.votes[identity] === p.id ? '✓ ' : ''}${p.name}</button>`).join('')}</div><small>선택한 곳은 내 이름으로 저장돼요. 다른 곳을 누르면 바뀝니다.</small></div>`;
    if (status?.kind === 'separate') { const group = C.separateGroup(identity, d); content += `<div class="personal-ceo-notice personal-separate-notice"><strong>${group.members.length > 1 ? group.members.length + '명 모임' : '따로 먹는 점심'} · ${group.venue ? esc(group.venue.name) : '장소 미정'}</strong><a href="#guideSection" class="ceo-guide-jump">과천 맛집에서 따로 먹을 장소 고르기 ↓</a><button class="secondary-button" data-action="separate" ${attrs}>함께 먹을 동료 관리</button></div>`; }
    if (status?.kind === 'ceo') content += `<div class="personal-ceo-notice"><strong>${target}은 대표님과 점심 일정이 있어요.</strong><a href="#guideSection" class="ceo-guide-jump">아래 과천 맛집에서 점심 장소 고르기 ↓</a><button id="cancelMyCeo" class="secondary-button" data-action="setAvailability" data-id="pending" ${attrs}>내 대표님 점심 취소</button><small>취소하면 미선택으로 이동해요. 이후 함께 먹기·따로 먹기·안 먹기를 골라 주세요.</small></div>`;
    else if (mine && d.overrides[mine.id] === 'pending' && !d.ceoCancelled && date <= config().scheduleEnd && config().ceoDays[mine.id].includes(C.weekday(date))) content += `<div class="personal-ceo-notice"><strong>내 기본 대표님 점심은 해제되어 있어요.</strong><button class="secondary-button" data-action="setAvailability" data-id="auto" ${attrs}>내 기본 대표님 일정 복원</button></div>`;
    if (needsServerUpdate()) content += '<p class="response-warning">따로 먹기 합류 요청·초대 알림을 지원하는 공유 서버로 업데이트해야 사용할 수 있어요. <a href="setup.html#update">관리자 업데이트 안내 ↗</a></p>';
    $('myResponseContent').innerHTML = content;
    const incoming = identity && dayReady() ? C.incomingPairs(identity, d) : [];
    const joiners = identity && dayReady() ? C.incomingJoinRequests(identity, d) : [];
    const mineRequest = identity && dayReady() ? C.myJoinRequest(identity, d) : null;
    const alerts = incoming.map(pair => `<article class="pair-invitation"><p><strong>🔔 ${esc(nameOf(pair.from))}님의 따로 먹기 초대</strong><br>수락하면 해당 모임에 합류하고, 일반 '함께 점심' 명단에서는 자동으로 빠집니다.</p><div class="button-row"><button class="primary-button" data-action="pairAccept" data-id="${pair.id}" ${attrs}>수락하고 합류</button><button class="secondary-button" data-action="pairDecline" data-id="${pair.id}" ${attrs}>거절</button></div></article>`);
    joiners.forEach(req => alerts.push(`<article class="pair-invitation is-join-request"><p><strong>🔔 ${esc(nameOf(req.from))}님의 모임 참여 요청</strong><br>${esc(nameOf(req.from))}님이 내가 만든 따로 먹는 모임에 합류하고 싶어 해요. 승인하면 해당 직원은 일반 점심 인원에서 자동으로 이동합니다.</p><div class="button-row"><button class="primary-button" data-action="joinApprove" data-id="${req.id}" ${attrs}>참여 승인</button><button class="secondary-button" data-action="joinReject" data-id="${req.id}" ${attrs}>거절</button></div></article>`));
    if (mineRequest) alerts.push(`<article class="pair-invitation is-join-wait"><p><strong>⏳ ${esc(nameOf(mineRequest.to))}님 모임에 참여 요청 중</strong><br>모임 생성자의 승인을 기다리고 있어요. 승인 전까지는 기존 점심 선택이 그대로 유지됩니다.</p><div class="button-row"><button class="secondary-button" data-action="joinWithdraw" data-id="${mineRequest.id}" ${attrs}>참여 요청 취소</button></div></article>`);
    const urgentCount = incoming.length + joiners.length;
    $('myResponseTitle').textContent = urgentCount ? `오늘 점심, 어떻게 할까요? · 🔔 ${urgentCount}건` : '오늘 점심, 어떻게 할까요?';
    $('pairInvitations').innerHTML = alerts.length ? `<p class="pair-alert-title" role="status">${urgentCount ? `🔔 처리할 초대·참여 요청 ${urgentCount}건` : '내가 보낸 참여 요청'}</p>${alerts.join('')}` : '';
  }
  function renderPairBoard() {
    const d = day(), separate = MEMBERS.filter(m => dailyStatus(m, date).kind === 'separate');
    $('pairBoard').hidden = !dayReady() || !separate.length;
    if ($('pairBoard').hidden) { $('pairBoard').innerHTML = ''; return; }
    const groups = new Map();
    separate.forEach(m => { const group = C.separateGroup(m.id, d); if (!groups.has(group.root)) groups.set(group.root, group); });
    const cards = [...groups.values()].sort((a, b) => MEMBERS.findIndex(m => a.members.includes(m.id)) - MEMBERS.findIndex(m => b.members.includes(m.id))).map(group => {
      const ids = MEMBERS.filter(m => group.members.includes(m.id) && dailyStatus(m, date).kind === 'separate').map(m => m.id);
      const isPending = group.pending.length > 0, isAccepted = ids.length > 1;
      const label = isAccepted ? `${ids.length}명이 따로 점심` : isPending ? '동료의 수락을 기다려요' : '개별 식사';
      const pending = group.pending.length ? `<p>초대 대기: ${group.pending.map(p => esc(nameOf(p.to))).join(' · ')}</p>` : '';
      const venue = group.venue ? `<p class="separate-place">📍 ${esc(group.venue.name)} · <a href="${esc(group.venue.url)}" target="_blank" rel="noopener noreferrer">지도 ↗</a></p>` : '<p class="separate-place">📍 장소 미정</p>';
      const canEdit = identity && ids.includes(identity);
      const request = identity ? C.myJoinRequest(identity, d) : null;
      const myPair = identity ? C.pairFor(identity, d) : null;
      const waiting = request && request.to === group.root;
      const requestCount = C.incomingJoinRequests(group.root, d).length;
      const requestButton = !canEdit && !myPair && !request
        ? `<button data-action="joinRequest" data-id="${group.root}" data-date="${date}">이 모임에 참여 요청 ↗</button>`
        : waiting ? `<button data-action="joinWithdraw" data-id="${request.id}" data-date="${date}">요청 취소 · 승인 대기</button>` : '';
      return `<article class="lunch-pair is-${isAccepted ? 'accepted' : isPending ? 'pending' : 'solo'}"><strong>${ids.map(id => esc(nameOf(id))).join(' · ')}</strong><p>${label}${requestCount ? ' · 참여 요청 ' + requestCount + '명' : ''}</p>${pending}${venue}<div class="separate-board-actions"><button class="text-button" data-action="pairDetails" data-id="${canEdit ? identity : group.root}" data-date="${date}">모임 보기 ↗</button>${canEdit ? `<a class="separate-guide-link" href="#guideSection">${group.venue ? '다른 식당 고르기' : '식당 등록하기'} ↗</a>` : ''}${requestButton}</div></article>`;
    });
    $('pairBoard').innerHTML = `<h3>따로 먹는 점심 <span>${separate.length}명</span></h3><div class="pair-list">${cards.join('')}</div><p class="tiny-note">다른 직원은 기존 모임에 참여 요청할 수 있어요. 생성자가 승인하거나 초대를 수락하면 일반 함께 점심에서 빠져 모임에 합류합니다. 모임별 식당은 과천 맛집에서 등록합니다.</p>`;
  }
  function renderMembers() {
    const d = day(), s = config(), attending = C.participants(date, d, s), isToday = date === C.today();
    const ready = dayReady(), pending = busy || !ready || needsServerUpdate();
    $('heroDate').textContent = dateText(date); $('heroCount').textContent = ready ? `${isToday ? '오늘' : '이날'} 함께 ${attending.length}명` : '현황 확인 중…';
    $('peopleTitle').textContent = isToday ? '오늘 점심 현황' : '선택한 날의 점심 현황';
    $('dateInput').value = date; $('identitySelect').value = identity;
    $('ceoCancelled').checked = d.ceoCancelled; $('ceoCancelled').disabled = pending;
    $('ceoCancelLabel').textContent = `${isToday ? '오늘' : '이날'} 대표님 점심 전체 취소${d.ceoCancelled ? '됨' : ''}`;
    $('ceoCancelled').setAttribute('aria-label', dateText(date) + ' 기본 대표님과 점심 전체 취소');
    $('ceoControlHint').textContent = d.ceoCancelled ? '기본 대표님 일정이 미선택으로 바뀌었어요. 각자 점심 여부를 선택해 주세요.' : '전체 일정이 취소된 날에 체크해 주세요. 내 일정만 취소할 때는 위의 개인 취소 버튼을 이용하세요.';
    $('availabilityHint').textContent = !ready ? '선택한 날짜의 공유 현황을 확인하고 있어요.' : date > s.scheduleEnd ? '대표님 기본 일정의 적용 기간이 지났어요. 기본 요일 설정을 확인해 주세요.' : '일반 점심은 메가존·런치타임·강남밥상 중 하나를, 대표님 점심은 아래 과천 맛집에서 따로 확정해요.';
    $('dailySaveNote').textContent = connection ? !ready ? '공유 현황 확인 중…' : busy ? '팀에 저장 중…' : `총 ${MEMBERS.length}명 · 팀 공유` : `총 ${MEMBERS.length}명 · 이 기기에 저장`;
    const members = MEMBERS.map(m => ({ ...m, status: dailyStatus(m, date) }));
    const groups = [['in', '함께 점심'], ['ceo', '대표님과 점심'], ['out', isToday ? '오늘 안 먹음' : '이날 안 먹음'], ['pending', '미선택']];
    $('membersGrid').setAttribute('aria-busy', String(!ready || busy));
    $('membersGrid').innerHTML = groups.map(([kind, label]) => {
      const list = members.filter(m => m.status.kind === kind);
      const rows = teamGroups(list).map(group => `<div class="daily-team-row"><span class="daily-team-name">${esc(group.team)}</span><div class="daily-name-list">${group.members.map(m => {
        const me = m.id === identity;
        return `<button id="dailyMember-${m.id}" class="daily-member${me ? ' is-me' : ''}" data-action="dailyMember" data-id="${m.id}" data-date="${date}" aria-label="${esc(m.team + ', ' + m.name + ', ' + dateText(date) + ', ' + m.status.label + (m.status.detail ? ', ' + m.status.detail : '') + '. ' + (me ? '내 일정 변경' : '일정 상세 보기'))}" ${busy || !ready ? 'disabled' : ''}><span class="daily-member-name">${esc(m.name)}</span>${me ? '<small class="daily-me">나</small>' : ''}${m.status.detail ? `<span class="daily-member-note">${esc(m.status.detail)}</span>` : ''}</button>`;
      }).join('')}</div></div>`).join('');
      return `<article id="dailyGroup-${kind}" class="daily-group is-${kind}" aria-labelledby="dailyHeading-${kind}"><header class="daily-group-heading"><h3 id="dailyHeading-${kind}">${label}</h3><span class="daily-group-count"><b>${ready ? list.length : '–'}</b>명</span></header>${!ready ? '<p class="daily-empty">현황 확인 중…</p>' : list.length ? `<div class="daily-team-list">${rows}</div>` : '<p class="daily-empty">해당 인원 없음</p>'}</article>`;
    }).join('');
    renderMyResponse(); renderPairBoard();
  }
  // The Megazone card shows manually uploaded screenshots only, never vendor credentials.
  const megaSlot=d=>'megaDay:'+d;
  const megaDayMeta=(d=date)=>shared.menuImages[megaSlot(d)]||null;
  const megaShownMeta=()=>megaDayMeta();
  const megaReady=()=>!!(connection&&connectedReady&&shared.features.megaPhotos&&shared.features.menuImages);
  function megaPlaceholder(){
    if(!connection)return '<div class="image-empty"><strong>팀 공유에 연결해 주세요</strong><p>동료 초대 링크로 연결하면 식단 사진을 공유할 수 있어요.</p><a href="setup.html" class="menu-source-link">공유 연결 안내 ↗</a></div>';
    if(!connectedReady)return '<div class="image-empty"><strong>팀 공유 연결을 확인 중이에요…</strong></div>';
    if(!megaReady())return '<div class="image-empty"><strong>사진 업로드 서버 업데이트가 필요해요</strong><p>기존 Google Apps Script 코드를 교체하고 새 버전으로 배포해 주세요. 웰스토리 로그인은 사용하지 않아요.</p><a href="setup.html#update" class="menu-source-link">업데이트 방법 ↗</a></div>';
    return '<div class="image-empty"><span aria-hidden="true">📷</span><strong>등록된 식단 사진이 없어요</strong><p>웰스토리플러스 앱에서 메뉴 부분을 캡처해 올려 주세요.</p></div>';
  }
  function megaPhotoHTML(meta){
    if(!meta)return megaPlaceholder();
    if(megaErrors.has(meta.id))return '<div class="image-empty"><strong>사진을 불러오지 못했어요</strong><p>연결을 확인하고 다시 불러와 주세요.</p></div><button class="secondary-button" data-action="megaReload">사진 다시 불러오기 ↻</button>';
    const data=megaPhotos.get(meta.id);
    if(!data)return '<div class="image-empty"><strong>사진을 불러오고 있어요…</strong></div>';
    const scope='선택한 날짜';
    return '<button class="menu-photo-button mega-uploaded-photo" data-action="megaZoom" aria-label="메가존 식단 사진 확대"><img class="menu-photo" src="'+esc(data)+'" alt="메가존 식단 캡처" loading="lazy"><span>사진 크게 보기 ↗</span></button><p class="image-caption"><strong>'+scope+' · '+esc(nameOf(meta.uploadedBy)||'직원')+'님 공유</strong><span>'+esc(timeText(meta.uploadedAt))+' 업로드 · 사진에 적힌 날짜를 확인해 주세요.</span></p>';
  }
  function megaActions(meta){
    if(!megaReady())return '';
    return '<div class="image-share-row mega-image-actions"><button class="primary-button" data-action="megaUpload">'+(meta?'↻ 사진 교체':'＋ 식단 사진 올리기')+'</button>'+(meta?'<button class="danger-button" data-action="megaDelete" data-id="'+esc(meta.id)+'">사진 삭제</button>':'')+'</div><p class="upload-hint">선택한 날짜의 메뉴 사진만 공유해요. JPG·PNG·WEBP 파일을 자동으로 압축합니다.</p>';
  }
  function renderMegaDay(){
    const meta=megaReady()?megaDayMeta():null;
    return '<p class="menu-date-label">'+esc(dateText(date))+' · 메가존 점심</p>'+megaPhotoHTML(meta)+megaActions(meta);
  }
  function loadMegaPhoto(force=false){
    if(!megaReady())return Promise.resolve();
    const meta=megaShownMeta();if(!meta)return Promise.resolve();
    if(force){megaPhotos.delete(meta.id);megaErrors.delete(meta.id);}
    if(!force&&(megaPhotos.has(meta.id)||megaErrors.has(meta.id)))return Promise.resolve();
    if(megaLoads.has(meta.id))return megaLoads.get(meta.id);
    const target=connection,id=meta.id;
    const task=jsonp({action:'menuImage',date:meta.date,scope:meta.scope,imageId:id},target).then(result=>{
      if(target!==connection||megaShownMeta()?.id!==id)return;
      const data=result?.image?.dataUrl;
      if(!result?.ok||result.image.id!==id||typeof data!=='string'||!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw new Error('잘못된 사진 응답');
      megaPhotos.set(id,data);megaErrors.delete(id);
    }).catch(()=>{if(target===connection&&megaShownMeta()?.id===id)megaErrors.add(id);})
      .finally(()=>{megaLoads.delete(id);if(target===connection&&megaShownMeta()?.id===id)renderMenuCards();});
    megaLoads.set(id,task);return task;
  }
  function zoomMega(){
    const meta=megaShownMeta(),photo=meta&&megaPhotos.get(meta.id);
    if(!photo){loadMegaPhoto(true);return toast('사진을 불러오는 중이에요. 다시 눌러 주세요.');}
    openDialog('메가존 · '+dateText(date)+' 식단 사진','<p class="dialog-copy">직원이 공유한 앱 캡처입니다. 사진 속 메뉴 날짜를 확인해 주세요.</p><div class="full-menu-image"><img id="megaPhotoFull" src="'+esc(photo)+'" alt="메가존 식단 확대"></div><p id="megaPhotoError" class="inline-warning" hidden>사진을 표시하지 못했어요.</p>',true);
  }
  function openMegaUpload(){
    if(!megaReady())return toast('팀 공유 서버를 사진 업로드 버전으로 갱신한 뒤 사용해 주세요.');
    if(!identity)return showIdentity();
    megaDraft=null;
    openDialog('메가존 식단 사진 올리기','<p class="dialog-copy">웰스토리플러스 앱에서 메뉴만 캡처해 주세요. 계정정보·바코드·QR코드가 포함되지 않게 확인하세요.</p><form id="megaUploadForm" data-date="'+date+'"><p class="dialog-copy">등록 날짜: <strong>'+esc(dateText(date))+'</strong> · 이 날짜에만 사진이 보여요.</p><label for="megaFile">사진 선택 (원본 15MB 이하)</label><input id="megaFile" type="file" accept="image/png,image/jpeg,image/webp" required><div id="megaPreview" class="upload-preview" hidden></div><p id="megaStatus" class="upload-status" role="status">파일을 고르면 미리 보여 드려요.</p><button class="primary-button" type="submit" id="megaSave" disabled>팀원에게 사진 공유하기</button></form>');
  }
  async function prepareMega(file){
    megaDraft=null;const status=$('megaStatus'),button=$('megaSave'),preview=$('megaPreview');
    if(!status||!button||!preview)return;button.disabled=true;preview.hidden=true;
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024){status.textContent='JPG·PNG·WEBP 15MB 이하 파일을 골라 주세요.';return;}
    status.textContent='이미지를 압축하고 있어요…';let url;
    try{
      url=URL.createObjectURL(file);const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
      if(!img.naturalWidth||!img.naturalHeight)throw Error('사진 크기를 확인하지 못했어요.');
      let scale=Math.min(1,2200/Math.max(img.naturalWidth,img.naturalHeight)),quality=.88,data='';
      for(let i=0;i<7;i++){
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
        const ctx=canvas.getContext('2d');if(!ctx)throw Error('이미지 처리 기능을 사용할 수 없어요.');
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
        data=canvas.toDataURL('image/jpeg',quality);
        if(data.startsWith('data:image/jpeg;base64,')&&(data.length-23)*3/4<=1024*1024)break;
        scale*=.82;quality=Math.max(.55,quality-.06);
      }
      if(!data.startsWith('data:image/jpeg;base64,')||(data.length-23)*3/4>1024*1024)throw Error('압축에 실패했어요. 메뉴 부분만 잘라 다시 시도해 주세요.');
      megaDraft={dataUrl:data,name:file.name.slice(0,100)};
      preview.innerHTML='<img src="'+esc(data)+'" alt="업로드 사진 미리보기">';preview.hidden=false;
      button.disabled=false;status.textContent='사진 준비 완료 · 같은 기간의 기존 사진은 교체됩니다.';
    }catch(e){status.textContent=e?.message||'사진을 열지 못했어요. 다른 사진을 골라 주세요.';}
    finally{if(url)URL.revokeObjectURL(url);}
  }
  async function saveMega(form){
    if(!megaDraft)return toast('먼저 사진을 선택해 주세요.');
    const when=form.dataset.date,scope='megaDay';
    if(!C.validDate(when))return toast('날짜를 확인해 주세요.');
    const original=megaDraft,old=shared.menuImages[megaSlot(when)];
    $('megaSave').disabled=true;$('megaStatus').textContent='팀 공유에 저장 중…';
    const ok=await mutate('menuImageUpload',{scope,dataUrl:original.dataUrl,name:original.name,expectedImageId:old?.id||''},when);
    if(ok){
      const saved=shared.menuImages[megaSlot(when)];if(saved)megaPhotos.set(saved.id,original.dataUrl);
      megaDraft=null;closeDialog();renderMenuCards();loadMegaPhoto();toast('메가존 사진을 팀원에게 공유했어요.');
    }else{if($('megaStatus'))$('megaStatus').textContent='저장에 실패했어요. 연결 상태를 확인해 주세요.';if($('megaSave'))$('megaSave').disabled=false;}
  }
  async function deleteMega(id){
    const meta=megaShownMeta();if(!meta||meta.id!==id||meta.scope!=='megaDay')return toast('사진이 바뀌었어요. 새로고침해 주세요.');
    if(!identity)return showIdentity();
    if(!confirm('이날 식단 사진을 삭제할까요? 팀원 화면에서도 사라집니다.'))return;
    if(await mutate('menuImageDelete',{scope:'megaDay',expectedImageId:id},date)){megaPhotos.delete(id);megaErrors.delete(id);renderMenuCards();loadMegaPhoto();toast('식단 사진을 삭제했어요.');}
  }
  function cleanKakaoProfile(value) {
    if (!value || value.sourceUrl !== KAKAO_CHANNEL || typeof window.LunchKakaoSource?.validImageURL !== 'function' || !window.LunchKakaoSource.validImageURL(value.imageUrl)) return null;
    const checked = Date.parse(value.checkedAt);
    if (!Number.isFinite(checked) || checked > Date.now() + 60000) return null;
    return { ok: true, sourceUrl: KAKAO_CHANNEL, imageUrl: value.imageUrl, checkedAt: new Date(checked).toISOString() };
  }
  function renderKakaoProfile() {
    const profile = kakaoProfile, isToday = date === C.today();
    const available = !!connection && connectedReady && !!shared.features.kakaoProfile;
    let content = '<div class="kakao-auto-heading"><strong>카카오 프로필 식단</strong><span class="auto-menu-badge">자동</span></div>';
    if (!isToday) {
      content += '<p class="kakao-auto-meta">선택한 날짜의 식단이 아니에요. 카카오 프로필은 현재 올라온 사진만 확인할 수 있어요.</p>';
    } else if (profile && !kakaoPhotoError) {
      content += `<button class="menu-photo-button" data-action="viewKakaoProfile" aria-label="카카오 프로필 식단 사진 크게 보기"><img id="kakaoProfilePhoto" class="menu-photo" src="${esc(profile.imageUrl)}" alt="런치타임 카카오 채널의 현재 프로필 사진. 사진에 적힌 식단 날짜를 확인해 주세요." loading="lazy" referrerpolicy="no-referrer"><span>식단 사진 크게 보기 ↗</span></button>`;
    } else {
      content += `<div class="image-empty"><strong>${kakaoPhotoError ? '사진을 표시하지 못했어요' : !connection ? '자동 조회는 팀 공유 연결 후 사용할 수 있어요' : !connectedReady ? '공유 연결을 확인하고 있어요…' : !shared.features.kakaoProfile ? '자동 식단 조회를 준비해 주세요' : kakaoLoading || kakaoWaiting || !lastKakaoAttempt ? '카카오에서 식단 사진을 가져오고 있어요…' : '자동으로 가져오지 못했어요'}</strong><p>${kakaoPhotoError ? '카카오 원문에서 확인하거나 다시 불러와 주세요.' : '카카오 채널 원문에서 확인하거나 사진을 다시 불러와 주세요.'}</p></div>`;
    }
    if (!connection) content += `<p class="kakao-auto-meta">${profile ? '자동 조회는 팀 공유 연결 후 사용할 수 있어요. 현재는 마지막으로 가져온 사진입니다.<br>' : ''}<a href="setup.html">팀 공유 연결 안내 ↗</a></p>`;
    else if (connectedReady && !shared.features.kakaoProfile) content += '<p class="inline-warning">식단 사진을 자동으로 보려면 <a href="setup.html#update">공유 서버를 한 번 업데이트해 주세요 ↗</a></p>';
    if (kakaoLoading) content += '<p class="kakao-auto-meta" role="status">채널에서 최신 사진 확인 중…</p>';
    else if (kakaoWaiting) content += '<p class="kakao-auto-meta" role="status">먼저 시작한 식단 조회가 진행 중이에요. 잠시 후 자동으로 다시 확인합니다.</p>';
    if (kakaoError) content += `<p class="inline-warning" role="status">${profile ? '다시 확인하지 못했어요. 마지막으로 가져온 사진이므로 날짜를 확인해 주세요.' : '채널 연결을 확인하지 못했어요. 잠시 후 다시 불러와 주세요.'}</p>`;
    if (profile) content += `<p class="kakao-auto-meta">마지막 확인 ${esc(timeText(profile.checkedAt))}<br>확인 시각과 식단 날짜는 달라요. 사진에 적힌 날짜를 확인해 주세요.</p>`;
    content += `<div class="kakao-auto-actions">${!isToday && profile ? '<button class="secondary-button" data-action="viewKakaoProfile">카카오 최신 사진 보기 ↗</button>' : ''}<button class="text-button" data-action="refreshKakaoProfile" ${kakaoLoading || !available ? 'disabled' : ''}>${kakaoLoading ? '사진 확인 중…' : '사진 다시 불러오기 ↻'}</button><a href="${KAKAO_CHANNEL}" target="_blank" rel="noopener noreferrer">카카오 원문 ↗</a></div>`;
    return `<div class="kakao-auto-panel" aria-label="런치타임 카카오 프로필 자동 조회">${content}</div>`;
  }
  // 런치타임은 공식 카카오 채널의 자동 식단만 표시합니다.
  // 기존 공유 서버의 업로드 파일은 삭제하지 않으며, 화면에서는 노출하지 않습니다.
  function renderLunchImage() {
    return `<div class="lunch-image-panel">${renderKakaoProfile()}</div>`;
  }
  function gangnamMediaHTML(item, suffix = '') {
    const valid = window.LunchThreadsMenu;
    if (!valid?.validPostURL(item?.postUrl)) return '';
    if (item.kind === 'video' && valid.validMediaURL(item.videoUrl)) {
      const poster = valid.validImageURL(item.posterUrl) ? ` poster="${esc(item.posterUrl)}"` : '';
      return `<div class="gangnam-media-wrap"><video class="gangnam-menu-video" id="gangnamMenuVideo${esc(suffix)}" controls muted playsinline preload="metadata"${poster} aria-label="강남밥상 메뉴 공지 게시물 영상. 일시정지하거나 재생 위치를 이동해서 메뉴표를 보세요."><source src="${esc(item.videoUrl)}" type="video/mp4">이 브라우저는 영상 재생을 지원하지 않습니다.</video><p class="gangnam-menu-meta">카카오 메뉴 공지 화면을 담은 Threads 게시물입니다. 영상 속 메뉴표가 보이는 장면에서 정지해 주세요.</p></div>`;
    }
    if (item.kind === 'image' && valid.validImageURL(item.imageUrl)) {
      return `<button class="menu-photo-button gangnam-photo-button" data-action="viewGangnamMenu" aria-label="강남밥상 메뉴 사진 크게 보기"><img id="gangnamMenuPhoto" src="${esc(item.imageUrl)}" alt="강남밥상 오늘의 식단 공지" loading="lazy" referrerpolicy="no-referrer"><span>메뉴 사진 확대 ↗</span></button>`;
    }
    return '';
  }
  function gangnamDiagnosticsHTML(entry) {
    if (!entry) return '';
    const d = entry.diagnostics || {}, num = value => Number.isInteger(value) && value >= 0 && value <= 100 ? String(value) : '—';
    const attempts = Array.isArray(d.attempts) ? d.attempts.slice(0, 3) : [];
    const lines = [
      '수정 버전: ' + (entry.version || '이전 서버 · 새 버전 배포 필요'),
      '선택한 날짜: ' + date,
      '받은 게시물: ' + num(d.totalPosts) + '개 / 같은 날짜: ' + num(d.matchingDatePosts) + '개',
      '표시 가능한 사진·영상: ' + num(d.validMediaPosts) + '개',
      '메뉴 공지로 확인된 게시물: ' + num(d.identifiedMenuPosts) + '개 / 홍보 게시물: ' + num(d.promotionPosts) + '개',
      '받은 목록의 최신 게시일: ' + (C.validDate(d.latestPostDate) ? d.latestPostDate : '확인 못 함'),
      '상태: ' + (entry.ok ? 'ok' : entry.reason || 'unavailable') + (d.failure ? ' / ' + d.failure : '')
    ];
    for (const a of attempts) lines.push(String(a.source || 'feed').slice(0, 30) + ': ' + String(a.code || 'unknown').slice(0, 40));
    return '<details class="gangnam-diagnostics"><summary>조회 진단 보기</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:14px;line-height:1.6">' + esc(lines.join('\n')) + '</pre></details>';
  }
  const VERIFIED_GANGNAM_VERSION = '20261125-menu-screening';
  function renderGangnamMenu() {
    const entry = gangnamMenus[date], supported = !!connection && connectedReady && shared.features.gangnamMenu;
    const ready = entry?.ok && entry.version === VERIFIED_GANGNAM_VERSION && entry.confidence === 'caption' && entry.date === date && window.LunchThreadsMenu?.validPostURL(entry.postUrl) &&
      (entry.kind === 'video' ? window.LunchThreadsMenu.validMediaURL(entry.videoUrl) : window.LunchThreadsMenu.validImageURL(entry.imageUrl)) &&
      window.LunchThreadsMenu.seoulDate(entry.publishedAt) === date;
    const oldServer = !!entry && !!entry.version && entry.version !== VERIFIED_GANGNAM_VERSION;
    const badge = gangnamLoading ? '확인 중' : ready ? '게시물 확인' : '조회 확인 필요';
    let content = '<div class="gangnam-menu-panel"><div class="gangnam-menu-heading"><span class="gangnam-menu-badge">THREADS</span><strong>강남밥상 메뉴 공지</strong><span class="auto-menu-badge">' + badge + '</span></div>';
    if (ready && !(entry.kind === 'image' && gangnamPhotoErrors.has(entry.imageUrl))) {
      content += gangnamMediaHTML(entry);
      content += `<p class="gangnam-menu-meta">${esc(dateText(date))} 게시 · 마지막 성공 조회 ${esc(timeText(entry.checkedAt || entry.publishedAt))}</p>`;
      if (entry.refreshFailure) content += '<p class="inline-warning">새로 조회하지 못해 이전에 확인한 메뉴 게시물을 표시합니다. 아래 진단을 확인해 주세요.</p>';
    } else if (['ambiguous', 'unverified_menu'].includes(entry?.reason) && Array.isArray(entry.alternatives) && entry.alternatives.length) {
      const ambiguous = entry.reason === 'ambiguous';
      content += '<div class="image-empty"><strong>' + (ambiguous ? '메뉴 공지 후보가 여러 개예요' : '오늘 메뉴 공지인지 확인되지 않았어요') +
        '</strong><p>짧은 홍보 영상도 식단으로 잘못 표시될 수 있어 자동 선택하지 않습니다. 아래에서 해당 날짜의 게시물을 직접 확인해 주세요.</p></div>';
      content += '<div class="gangnam-post-links">' + entry.alternatives.filter(p => window.LunchThreadsMenu?.validPostURL(p.postUrl))
        .slice(0,4).map((p,i) => '<a href="' + esc(p.postUrl) + '" target="_blank" rel="noopener noreferrer">' +
          esc(p.caption || '게시물 ' + (i + 1)) + ' ↗</a>').join('') + '</div>';
    } else {
      let title = '아직 게시물을 조회하지 않았어요', detail = '게시물 조회가 완료되면 이곳에 표시됩니다.';
      if (!connection) { title = '팀 공유 연결 후 조회할 수 있어요'; detail = '기존 팀 공유 연결을 사용해 주세요.'; }
      else if (!connectedReady) { title = '팀 공유 연결을 확인하고 있어요…'; detail = '연결이 완료되면 게시물을 조회합니다.'; }
      else if (!shared.features.gangnamMenu || oldServer) { title = '공유 서버 수정본을 적용해 주세요'; detail = 'GitHub 파일뿐 아니라 Google Apps Script 코드도 교체하고 새 버전으로 배포해야 합니다.'; }
      else if (gangnamLoading) { title = 'Threads 게시물을 확인하고 있어요…'; detail = '조회 결과를 기다리는 중입니다.'; }
      else if (entry) {
        const failure = entry.diagnostics?.failure || entry.reason;
        if (entry.reason === 'feed_unavailable') { title = '게시물 연결에 실패했어요'; detail = '오늘 게시물이 없다는 뜻은 아닙니다. 피드 연결 또는 응답 처리에 실패했습니다. 아래 조회 진단을 확인해 주세요.'; }
        else if (failure === 'future_date' || failure === 'outside_range') { title = '자동 조회 범위 밖의 날짜예요'; detail = '오늘부터 최근 7일 이내 날짜를 선택해 주세요.'; }
        else if (entry.reason === 'promotion_only') { title = '메뉴 대신 행사·홍보 게시물이 확인됐어요'; detail = '홍보 영상은 식단으로 표시하지 않습니다. Threads 원문에서 해당 날짜의 메뉴 공지를 확인해 주세요.'; }
        else if (entry.reason === 'unverified_menu') { title = '메뉴 공지인지 확인하지 못했어요'; detail = '게시물 설명에 식단을 나타내는 내용이 없어 자동 선택하지 않습니다.'; }
        else if (entry.reason === 'not_found') { title = '선택한 날짜의 게시물을 받지 못했어요'; detail = '피드 반영이 늦거나 게시 날짜가 다를 수 있습니다. 메뉴가 아직 올라오지 않았다고 단정할 수는 없습니다.'; }
        else if (entry.reason === 'date_unknown') { title = '게시 날짜를 읽지 못했어요'; detail = '게시물은 받았지만 날짜 형식을 확인하지 못했습니다.'; }
        else if (['media_unavailable','invalid_post_link','no_supported_media'].includes(entry.reason)) { title = '게시물은 받았지만 사진·영상 주소를 확인하지 못했어요'; detail = '게시물 없음이 아니라 표시 정보 부족입니다. 아래 진단 정보를 확인해 주세요.'; }
        else if (ready) { title = '메뉴 사진을 표시하지 못했어요'; detail = '사진 주소가 만료됐거나 외부 표시가 제한될 수 있습니다. 새 게시물 확인을 눌러 주세요.'; }
        else { title = '조회 결과를 확인하지 못했어요'; detail = '공유 서버 연결 또는 게시물 형식을 확인해야 합니다.'; }
        if (C.validDate(entry.diagnostics?.latestPostDate)) detail += ' 받은 목록의 최신 게시일: ' + entry.diagnostics.latestPostDate + '.';
      }
      content += `<div class="image-empty"><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>`;
    }
    if (connectedReady && (!shared.features.gangnamMenu || oldServer)) content += '<p class="inline-warning"><a href="setup.html#update">공유 서버 업데이트 안내 ↗</a></p>';
    content += gangnamDiagnosticsHTML(entry?.refreshFailure || entry);
    content += `<div class="gangnam-menu-actions"><button class="text-button" data-action="refreshGangnamMenu" ${!supported || gangnamLoading ? 'disabled' : ''}>${gangnamLoading ? '확인 중…' : 'Threads 새 게시물 확인 ↻'}</button><a href="https://www.threads.com/@gangnambab" target="_blank" rel="noopener noreferrer">원문 링크(예비) ↗</a></div></div>`;
    return content;
  }
  function viewGangnamMenu() {
    const entry = gangnamMenus[date];
    if (!entry?.ok || entry.kind !== 'image' || entry.date !== date || !window.LunchThreadsMenu?.validImageURL(entry.imageUrl)) return;
    openDialog('강남밥상 · ' + dateText(date) + ' 메뉴표', `<div class="full-menu-image"><img id="gangnamMenuFull" src="${esc(entry.imageUrl)}" alt="강남밥상 메뉴표" referrerpolicy="no-referrer"></div><p id="gangnamFullError" class="inline-warning" hidden>사진을 표시하지 못했어요.</p>`, true);
  }
  function renderMenuCards() {
    const d = day(), meStatus = identity && C.memberStatus(identity, date, d, config());
    $('menuTitle').textContent = date === C.today() ? '오늘 구내식당 식단' : '선택한 날의 구내식당 식단';
    $('refreshMenu').disabled = kakaoLoading || gangnamLoading; $('refreshMenu').textContent = kakaoLoading || gangnamLoading ? '식단 확인 중…' : '↻ 식단 새로고침';
    $('restaurantCards').innerHTML = C.PLACES.map((p, i) => {
      const chosen = d.votes[identity] === p.id, note = d.notes[p.id]; let content = '';
      if (p.id === 'megazone') {
        content = renderMegaDay();
      } else if (p.id === 'lunchtime') {
        content = `<a class="channel-preview" href="${esc(p.menuUrl)}" target="_blank" rel="noopener noreferrer"><span class="channel-mark">TALK</span><div><strong>런치타임 카카오 채널</strong><p>점심판을 열 때 자동 조회 · 열어 두면 5분마다 확인</p></div><span class="arrow">↗</span></a>${renderLunchImage()}`;
      } else if (p.id === 'gangnambab') {
        content = renderGangnamMenu();
      } else content = `<p class="channel-info">${esc(p.subtitle || '동료가 제안한 오늘의 다른 식당이에요.')}</p>`;
      if (note) content += `<div class="menu-note"><strong>${esc(dateText(date))} · 함께 적은 메뉴 메모</strong>${esc(note)}</div>`;
      return `<article class="restaurant-card${chosen ? ' selected' : ''}"><div class="restaurant-head"><div class="restaurant-title"><span class="restaurant-icon ${p.id === 'lunchtime' ? 'lunchtime' : i > 1 ? 'other' : ''}">${icon(p.id)}</span><div><h3>${esc(p.name)}</h3><p class="restaurant-subtitle">${esc(p.subtitle || '오늘의 다른 식당')}</p></div></div><span class="restaurant-tag">${p.id === 'lunchtime' ? '우리의 기본 픽' : p.id === 'megazone' ? '기분 좋은 대안' : 'NEW PICK'}</span></div>${content}<div class="restaurant-bottom"><div class="restaurant-tools">${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${p.id === 'gangnambab' ? 'Threads 원문 ↗' : '지도 ↗'}</a>` : ''}<button data-action="note" data-id="${esc(p.id)}">${note ? '메모 수정' : '메뉴 메모'}</button></div><button class="vote-button${chosen ? ' chosen' : ''}" data-action="vote" data-id="${esc(p.id)}" aria-pressed="${chosen}" aria-disabled="${!identity || !meStatus?.in}" ${busy || !dayReady() || needsServerUpdate() ? 'disabled' : ''}>${chosen ? '✓ 선택 완료' : '이곳 선택하기'}</button></div></article>`;
    }).join('');
  }
  function renderDecision() {
    const d = day(), s = config(), attending = C.participants(date, d, s).sort(compareMembers);
    const votes = C.tally(date, d, s), selectedDay = date === C.today() ? '오늘' : '이날';
    const total = Object.values(votes).reduce((count, list) => count + list.length, 0);
    $('decisionTitle').textContent = '일반 점심 장소 선택 현황';
    $('voteSummary').textContent = attending.length
      ? `함께 점심 ${attending.length}명 중 ${total}명 장소 선택 · 메가존 / 런치타임 / 강남밥상 중 택 1`
      : '일반 점심 참석자가 아직 없어요. 함께 먹기를 선택하면 세 곳 중 고를 수 있어요.';
    $('voteResults').innerHTML = C.PLACES.map(p => `<div class="result-row"><div class="result-heading"><span>${esc(p.name)}</span><b>${votes[p.id].length}명</b></div><div class="result-track"><div class="result-bar" style="width:${attending.length ? votes[p.id].length / attending.length * 100 : 0}%"></div></div><div class="voter-names">${votes[p.id].length ? MEMBERS.filter(m => votes[p.id].includes(m.id)).map(m => esc(m.name)).join(' · ') : '아직 선택한 사람이 없어요'}</div></div>`).join('');
    const undecided = attending.filter(m => !C.PLACES.some(p => p.id === d.votes[m.id]));
    $('decisionContent').innerHTML = `<div class="lunch-choice-note">${undecided.length ? `<strong>장소 미선택 ${undecided.length}명</strong><p>${undecided.map(m => esc(m.name)).join(' · ')}</p>` : '<strong>일반 점심 참석자 모두 장소를 골랐어요.</strong>'}<p>각자 선택한 식당으로 나뉘어 점심을 먹어요. 단일 장소 확정은 하지 않습니다.</p></div>`;
    const guests = ceoMembers(), canPick = !!identity && C.memberStatus(identity, date, d, s).kind === 'ceo';
    const venue = d.ceoDecision;
    $('ceoDecisionPanel').innerHTML = `<section class="ceo-venue-summary"><span class="section-kicker">CEO LUNCH</span><h3>${selectedDay} 대표님 점심 장소</h3><p class="ceo-venue-members">참석 ${guests.length}명 · ${guests.length ? guests.map(m => esc(m.name)).join(' · ') : '참석자 없음'}</p>${venue
      ? `<div class="ceo-venue-confirmed"><span class="ceo-venue-badge">✓ 장소 확정</span><h4>${esc(venue.name)}</h4><p>${esc(venue.category || '과천 맛집')} · ${esc(venue.time)} 만남</p><p>${esc(nameOf(venue.actor))}님 확정${venue.at ? ' · ' + esc(timeText(venue.at)) : ''}</p><a href="${esc(venue.url)}" target="_blank" rel="noopener noreferrer">네이버 지도에서 보기 ↗</a>${canPick ? `<button class="text-button" data-action="ceoUnconfirm">확정 취소 · 다시 고르기</button>` : ''}</div>`
      : `<p class="ceo-venue-pending">${guests.length ? '아직 장소를 확정하지 않았어요.' : '이날은 대표님 점심 참석자가 없어요.'}</p>`}
      <p class="ceo-venue-help">${guests.length ? '대표님 점심 참석자가 아래 ‘과천 맛집 골라보기’에서 식당을 고르면 모든 참석자에게 공유돼요.' : '대표님 점심 참석 일정이 생기면 과천 맛집에서 장소를 선택할 수 있어요.'}</p>
      ${canPick ? '<a class="ceo-venue-link" href="#guideSection">과천 맛집에서 장소 고르기 ↓</a>' : ''}</section>`;
  }
  function guideData() { return window.LunchRestaurantGuide || { restaurants: [] }; }
  function renderGuide() {
    const data = guideData(), all = Array.isArray(data.restaurants) ? data.restaurants : [];
    const query = guideQuery.trim().toLocaleLowerCase('ko');
    const filtered = all.filter(item => (guideCategory === '전체' || item.category === guideCategory) && (!query || [item.name, item.category, item.menu, item.area].filter(Boolean).join(' ').toLocaleLowerCase('ko').includes(query)));
    const ready = dayReady() && !needsServerUpdate(), d = day();
    const status = identity ? C.memberStatus(identity, date, d, config()).kind : '';
    const selectedCeo = d.ceoDecision, selectedSeparate = identity ? C.separateGroup(identity, d).venue : null;
    $('guideIntro').textContent = '대표님 점심은 「대표님 점심 장소」, 동료끼리 따로 먹는 모임은 「따로 먹기 장소」를 눌러 등록하세요. 선택한 날짜와 해당 모임에 공유되며 식당 예약은 별도입니다.';
    $('guideFilters').innerHTML = ['전체', ...GUIDE_CATEGORIES].map((category, i) => `<button id="guideFilter-${i}" data-action="guideFilter" data-id="${category}" aria-pressed="${guideCategory === category}">${category}<small>${category === '전체' ? all.length : all.filter(item => item.category === category).length}</small></button>`).join('');
    $('guideResultCount').textContent = `${guideCategory} · ${filtered.length}곳`;
    $('guideCards').innerHTML = filtered.slice(0, guideLimit).map(item => {
      const ceoChosen = selectedCeo?.placeId === item.id, separateChosen = status === 'separate' && selectedSeparate?.placeId === item.id, safeUrl = C.safeUrl(item.url);
      return `<article class="guide-card${ceoChosen ? ' is-ceo-picked' : ''}${separateChosen ? ' is-separate-picked' : ''}"><span class="guide-category">${esc(item.category)}</span><h4>${esc(item.name)}</h4><p class="guide-menu">${esc(item.menu || item.rawCategory || item.category)}</p>${item.area ? `<p class="guide-area">${esc(item.area)}</p>` : ''}<div class="guide-card-actions">${safeUrl ? `<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">네이버 지도 ↗</a>` : ''}<button class="guide-ceo-action" data-action="guideConfirm" data-id="${esc(item.id)}" ${ceoChosen || !ready || busy ? 'disabled' : ''} aria-label="${esc(item.name)} 대표님 점심 장소로 선택">${ceoChosen ? '✓ 대표님 점심 장소' : '대표님 점심 장소'}</button><button class="guide-separate-action" data-action="guideSeparate" data-id="${esc(item.id)}" ${separateChosen || !ready || busy ? 'disabled' : ''} aria-label="${esc(item.name)} 따로 먹기 장소로 선택">${separateChosen ? '✓ 따로 먹기 장소' : '따로 먹기 장소'}</button></div></article>`;
    }).join('');
    $('guideEmpty').hidden = !!filtered.length;
    $('guideEmpty').textContent = all.length ? '조건에 맞는 식당이 없어요. 다른 종류나 검색어를 골라 주세요.' : '목록을 준비 중이에요. 위의 주변 식당 지도에서 식당을 확인할 수 있어요.';
    $('guideMore').hidden = filtered.length <= guideLimit;
    $('guideMore').textContent = `맛집 더 보기 · ${Math.max(0, filtered.length - guideLimit)}곳 남음`;
  }
  function guidePlace(id) { return (guideData().restaurants || []).find(item => item.id === id); }
  function guidePayload(item) { return { placeId: item.id, name: item.name, url: item.url, category: item.category, time: config().meetingTime }; }
  async function confirmGuideVenue(id) {
    const item = guidePlace(id);
    if (!item) return toast('맛집 목록에서 식당을 다시 선택해 주세요.');
    if (!identity) return showIdentity();
    if (C.memberStatus(identity, date, day(), config()).kind !== 'ceo') {
      openDialog('대표님 점심 장소 선택', `<p class="dialog-copy"><strong>${esc(item.name)}</strong>을(를) 대표님 점심 장소로 등록하려면 먼저 내 점심 상태를 ‘대표님과 점심’으로 변경해야 합니다. 기존 점심 선택은 이날만 바뀝니다.</p><button class="primary-button" data-action="guideJoinCeo" data-id="${esc(id)}">대표님과 점심으로 변경하고 장소 선택</button>`);
      return;
    }
    const before = day().ceoDecision;
    if (before?.placeId === id) return;
    if (before && !confirm(`${dateText(date)} 대표님 점심 장소를\n${before.name} → ${item.name}(으)로 변경할까요?\n변경 내용은 다른 참석자에게도 공유됩니다.`)) return;
    const targetDate = date;
    if (await mutate('ceoDecision', guidePayload(item), targetDate)) toast(`${dateText(targetDate)} 대표님 점심 장소를 ${item.name}(으)로 확정했어요.`);
  }
  async function confirmSeparateVenue(id) {
    const item = guidePlace(id);
    if (!item) return toast('맛집 목록에서 식당을 다시 선택해 주세요.');
    if (!identity) return showIdentity();
    if (C.memberStatus(identity, date, day(), config()).kind !== 'separate') {
      openDialog('따로 먹기 장소 선택', `<p class="dialog-copy"><strong>${esc(item.name)}</strong>을(를) 따로 먹는 식당으로 등록하려면 먼저 ‘따로 먹기’로 변경해야 합니다. 동료가 있는 모임은 장소가 함께 공유되고, 혼자 먹는 경우에는 내 식당으로 저장됩니다.</p><button class="primary-button" data-action="guideJoinSeparate" data-id="${esc(id)}">따로 먹기로 변경하고 식당 등록</button>`);
      return;
    }
    const group = C.separateGroup(identity, day()), before = group.venue;
    if (before?.placeId === id) return;
    if (before && !confirm(`${dateText(date)} 따로 먹는 식당을\n${before.name} → ${item.name}(으)로 변경할까요?\n모임 참석자에게도 공유됩니다.`)) return;
    const targetDate = date;
    if (await mutate('separateVenue', guidePayload(item), targetDate)) toast(`${dateText(targetDate)} 따로 먹기 장소를 ${item.name}(으)로 등록했어요.`);
  }
  function pairInviteDialog(targetDate = date) {
    if (!identity) return showIdentity();
    if (!C.validDate(targetDate)) return;
    const record = day(targetDate), current = C.pairFor(identity, record);
    if (current && current.from !== identity) return showPairDetails(identity, targetDate);
    const selected = new Set([identity]);
    const group = C.separateGroup(identity, record);
    group.pairs.forEach(link => selected.add(link.to));
    const available = MEMBERS.filter(m => !selected.has(m.id) && !C.pairFor(m.id, record));
    const attrs = `data-date="${targetDate}" data-member="${identity}"`;
    openDialog(dateText(targetDate) + ' · 따로 먹기', `<p class="dialog-copy">함께 먹을 동료를 <strong>여러 명 선택</strong>할 수 있어요. 초대받은 사람은 각자 수락하면 같은 모임에 들어옵니다. 식당은 과천 맛집에서 모임별로 등록할 수 있어요.</p><form id="pairInviteForm" class="dialog-form" ${attrs}><fieldset class="pair-member-fieldset"><legend>함께할 동료 · 복수 선택 가능</legend><div class="pair-member-options">${available.map(m => `<label class="pair-member-option"><input id="pairPartner-${m.id}" name="to" type="checkbox" value="${m.id}"><span><strong>${esc(m.name)}</strong><small>${esc(m.team)} · ${esc(dailyStatus(m, targetDate).label)}</small></span></label>`).join('')}</div></fieldset><button class="primary-button" ${available.length ? '' : 'disabled'}>선택한 동료 초대하기</button></form>${available.length ? '' : '<p class="dialog-copy">지금 추가로 초대할 수 있는 동료가 없어요.</p>'}${!current ? `<button class="text-button" data-action="setAvailability" data-id="separate" ${attrs}>동료 지정 없이 따로 먹기</button>` : ''}<p class="tiny-note">${connection ? '초대받은 동료가 본인 이름을 선택하고 수락하면 함께하는 모임으로 표시됩니다.' : '지금은 이 기기에만 저장됩니다. 다른 기기에서 초대 수락을 하려면 팀 공유를 연결해 주세요.'}</p>`);
  }
  function showPairDialog(targetDate = date) {
    if (!identity) return showIdentity();
    if (!C.validDate(targetDate)) return;
    const record = day(targetDate), pair = C.pairFor(identity, record);
    if (pair) return showPairDetails(identity, targetDate);
    pairInviteDialog(targetDate);
  }
  function showPairDetails(memberId, targetDate) {
    if (!C.validDate(targetDate)) return;
    const record = day(targetDate), group = C.separateGroup(memberId, record);
    const isSeparate = C.memberStatus(memberId, targetDate, record, config()).kind === 'separate';
    if (!isSeparate && !group.pairs.length) return openDialog(nameOf(memberId) + '님의 점심', '<p class="dialog-copy">따로 먹는 모임이 없어요.</p>');
    const attrs = `data-date="${targetDate}" data-member="${identity}"`;
    const member = group.members.includes(identity), root = group.root === identity;
    const accepted = group.pairs.find(pair => pair.to === identity && pair.status === 'accepted');
    const incoming = group.pairs.find(pair => pair.to === identity && pair.status === 'pending');
    const names = MEMBERS.filter(m => group.members.includes(m.id) && C.memberStatus(m.id, targetDate, record, config()).kind === 'separate').map(m => esc(m.name)).join(' · ');
    let actions = '';
    if (root) actions += `<button class="secondary-button" data-action="pairInviteMore" ${attrs}>동료 추가 초대</button>`;
    if (root) group.pending.forEach(pair => { actions += `<button class="secondary-button" data-action="pairCancel" data-id="${pair.id}" ${attrs}>${esc(nameOf(pair.to))} 초대 취소</button>`; });
    if (root && group.pairs.length) actions += `<button class="text-button" data-action="setAvailability" data-id="pending" ${attrs}>모임 나가기 · 내 선택 취소</button>`;
    else if (accepted) actions += `<button class="secondary-button" data-action="pairLeave" data-id="${accepted.id}" ${attrs}>모임 나가기 · 미선택으로</button>`;
    if (incoming && memberId === identity) actions += `<button class="primary-button" data-action="pairAccept" data-id="${incoming.id}" ${attrs}>수락하고 따로 먹기</button><button class="secondary-button" data-action="pairDecline" data-id="${incoming.id}" ${attrs}>거절</button>`;
    const venue = group.venue;
    const joiners = C.incomingJoinRequests(group.root, record);
    const myRequest = identity ? C.myJoinRequest(identity, record) : null;
    if (root) joiners.forEach(req => { actions += `<div class="pair-join-row"><strong>${esc(nameOf(req.from))}님의 참여 요청</strong><button class="primary-button" data-action="joinApprove" data-id="${req.id}" ${attrs}>승인</button><button class="secondary-button" data-action="joinReject" data-id="${req.id}" ${attrs}>거절</button></div>`; });
    if (identity && !member && !C.pairFor(identity, record)) {
      if (myRequest?.to === group.root) actions += `<button class="secondary-button" data-action="joinWithdraw" data-id="${myRequest.id}" ${attrs}>참여 요청 취소 · 승인 대기 중</button>`;
      else if (!myRequest) actions += `<button class="primary-button" data-action="joinRequest" data-id="${group.root}" ${attrs}>이 모임에 참여 요청하기</button>`;
    }
    openDialog(dateText(targetDate) + ' · 따로 먹는 모임', `<p class="dialog-copy"><strong>${names || esc(nameOf(memberId))}</strong><br>${group.members.length > 1 ? '함께 따로 점심을 먹어요.' : '개별 식사 또는 동료 수락 대기 중이에요.'}</p>${group.pending.length ? `<p class="dialog-copy">초대 대기: ${group.pending.map(p => esc(nameOf(p.to))).join(' · ')}</p>` : ''}<div class="separate-dialog-venue"><strong>모임 식당: ${venue ? esc(venue.name) : '아직 미정'}</strong>${venue ? `<a href="${esc(venue.url)}" target="_blank" rel="noopener noreferrer">네이버 지도 ↗</a>` : ''}</div>${member || root ? '<p class="dialog-copy"><a class="ceo-guide-jump" href="#guideSection">과천 맛집에서 식당 고르기 ↓</a></p>' : ''}<div class="button-row pair-detail-actions">${actions}</div><p class="tiny-note">참여 요청은 모임 생성자만 승인할 수 있어요. 승인을 받거나 초대를 수락하면 일반 함께 점심에서는 빠집니다. 모임 식당은 참여자가 변경할 수 있습니다.</p>`);
  }
  function dailyStatus(member, targetDate) {
    const record = day(targetDate), status = C.memberStatus(member.id, targetDate, record, config());
    const kind = status.kind;
    const labels = { in: '함께 점심', ceo: '대표님과 점심', out: targetDate === C.today() ? '오늘 안 먹음' : '이날 안 먹음', pending: '미선택', separate: '따로 점심' };
    const notes = { in: '직접 함께 먹기를 선택했어요', ceo: status.manual ? '직접 지정한 대표님 일정' : '요일별 기본 일정', out: '점심 불참', pending: '아직 점심 여부를 선택하지 않았어요', separate: '함께 점심과 별도로 식사해요' };
    return { ...status, kind, label: labels[kind], note: status.detail || notes[kind] };
  }
  function showDailyMember(id, targetDate) {
    const member = MEMBERS.find(m => m.id === id); if (!member || !C.validDate(targetDate)) return;
    if (identity === id) return showAvailability(targetDate);
    const status = dailyStatus(member, targetDate);
    openDialog(member.name + '님의 점심 일정', `<p class="dialog-copy">${esc(member.team)} · ${esc(dateText(targetDate))}</p><p class="dialog-copy"><strong>${esc(status.label)}</strong><br>${esc(status.note)}</p>${identity ? '<p class="dialog-copy">내 일정은 화면에서 내 이름을 눌러 바꿀 수 있어요.</p>' : `<button class="secondary-button" data-action="chooseIdentity" data-id="${id}">${esc(member.name)}님이 나예요</button>`}`);
  }
  function render() {
    const focused = document.activeElement?.id;
    if (focused === 'meetingTime') draftTime = $('meetingTime').value;
    if (focused === 'decisionPlace') selectedDecision = $('decisionPlace').value;
    renderConnection(); renderMembers(); renderMenuCards(); renderDecision(); renderGuide();
    if ((focused === 'meetingTime' || focused === 'decisionPlace' || /^(?:dailyMember-|choice|cancelMyCeo|guideFilter-)/.test(focused || '')) && $(focused)) $(focused).focus({ preventScroll: true });
  }
  function mergeResponse(result) {
    if (!result || !result.ok) throw new Error(result?.error || '공유 연결 응답을 확인하지 못했어요.');
    if (result.days) Object.entries(result.days).forEach(([d, value]) => {
      if (C.validDate(d) && (!shared.days[d] || value.revision >= shared.days[d].revision)) shared.days[d] = C.cleanDay(value);
    });
    if (result.settings && (result.configRevision || 0) >= shared.configRevision) { shared.settings = C.settings(result.settings); shared.configRevision = result.configRevision || 0; }
    if (result.menuImages) shared.menuImages = result.menuImages;
    shared.features = result.features || {};
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
      loadKakaoProfile(!lastKakaoAttempt); loadGangnamMenu(requestDate);
      loadMegaPhoto();
    }
    catch (e) { if (target === connection) { syncError = e.message; renderConnection(); } }
    finally { syncing = false; renderConnection(); if (requestDate !== date && target === connection) sync(); }
  }
  function loadKakaoProfile(force = false) {
    const target = connection;
    if (!target || !connectedReady || !shared.features.kakaoProfile) return Promise.resolve();
    if (kakaoRequest?.target === target) return kakaoRequest.promise;
    if (!force && lastKakaoAttempt && Date.now() - lastKakaoAttempt < KAKAO_REFRESH_MS) return Promise.resolve();
    lastKakaoAttempt = Date.now(); kakaoLoading = true; kakaoWaiting = false;
    const request = { target, promise: null }; kakaoRequest = request;
    renderMenuCards();
    request.promise = Promise.resolve().then(async () => {
      try {
        const result = await jsonp({ action: 'kakaoProfile', force: force ? '1' : '0' }, target);
        if (target !== connection || kakaoRequest !== request) return;
        if (result?.pending === true) {
          kakaoWaiting = true; kakaoError = '';
          // Another member started the shared fetch. Retry on the next normal
          // sync after ten seconds, instead of waiting a full five minutes.
          lastKakaoAttempt = Date.now() - KAKAO_REFRESH_MS + 10000;
          return;
        }
        const profile = result?.ok && cleanKakaoProfile(result.profile);
        if (!profile) throw new Error('카카오 프로필 사진을 확인하지 못했어요.');
        // Fetch time belongs to the channel metadata, never to a menu date.
        if (!kakaoProfile || Date.parse(profile.checkedAt) >= Date.parse(kakaoProfile.checkedAt)) {
          kakaoProfile = profile;
          try { write(KEYS.kakao, profile); } catch (_) { /* A full cache must not block the menu. */ }
        }
        kakaoError = result.profile.error ? '최근 조회 실패' : '';
        if (!result.profile.error) kakaoPhotoError = '';
      } catch (_) {
        if (target === connection && kakaoRequest === request) kakaoError = '최근 조회 실패';
      } finally {
        if (kakaoRequest === request) { kakaoLoading = false; kakaoRequest = null; renderMenuCards(); }
      }
    });
    return request.promise;
  }
  function loadGangnamMenu(when = date, force = false) {
    const target = connection;
    if (!target || !connectedReady || !shared.features.gangnamMenu || !C.validDate(when)) return Promise.resolve();
    if (gangnamRequests[when]) return gangnamRequests[when];
    if (!force && gangnamAttempt[when] && Date.now() - gangnamAttempt[when] < 5 * 60000) return Promise.resolve();
    gangnamAttempt[when] = Date.now(); gangnamLoading = true; renderMenuCards();
    const task = Promise.resolve().then(async () => {
      try {
        const result = await jsonp({ action: 'gangnamMenu', date: when, force: force ? '1' : '0' }, target);
        if (target !== connection) return;
        if (result?.ok && result.version === VERIFIED_GANGNAM_VERSION && result.confidence === 'caption' && result.date === when && window.LunchThreadsMenu?.validPostURL(result.postUrl) && window.LunchThreadsMenu?.seoulDate(result.publishedAt) === when &&
            (result.kind === 'video' ? window.LunchThreadsMenu.validMediaURL(result.videoUrl) : window.LunchThreadsMenu.validImageURL(result.imageUrl))) {
          gangnamMenus[when] = { ...result };
          if (result.kind === 'image') gangnamPhotoErrors.delete(result.imageUrl);
        } else if (['ambiguous', 'unverified_menu'].includes(result?.reason) && Array.isArray(result.alternatives)) {
          const alternatives = result.alternatives.filter(p => window.LunchThreadsMenu?.validPostURL(p.postUrl) && window.LunchThreadsMenu?.seoulDate(p.publishedAt) === when &&
            (p.kind === 'video' ? window.LunchThreadsMenu.validMediaURL(p.videoUrl) : window.LunchThreadsMenu.validImageURL(p.imageUrl))).slice(0,3);
          gangnamMenus[when] = { ok: false, date: when, reason: result.reason, alternatives, version: result.version, diagnostics: result.diagnostics, checkedAt: result.checkedAt };
        } else {
          const failure = { ok: false, date: when, reason: result?.ok && result?.version !== VERIFIED_GANGNAM_VERSION ? 'old_server' : result?.reason || 'unavailable', version: result?.version, diagnostics: result?.diagnostics, checkedAt: result?.checkedAt };
          gangnamMenus[when] = gangnamMenus[when]?.ok ? { ...gangnamMenus[when], refreshFailure: failure } : failure;
        }
        try { write(KEYS.gangnam, Object.fromEntries(Object.entries(gangnamMenus).sort(([a],[b]) => b.localeCompare(a)).slice(0, 14))); } catch (_) {}
      } catch (_) { if (target === connection) { const failure = { ok: false, date: when, reason: 'transport_error' }; gangnamMenus[when] = gangnamMenus[when]?.ok ? { ...gangnamMenus[when], refreshFailure: failure } : failure; } }
      finally { if (gangnamRequests[when] === task) delete gangnamRequests[when]; gangnamLoading = Object.keys(gangnamRequests).length > 0; renderMenuCards(); }
    });
    gangnamRequests[when] = task;
    return task;
  }
  function viewKakaoProfile() {
    if (!kakaoProfile) return;
    openDialog('런치타임 · 카카오 최신 프로필 사진', `<p class="dialog-copy">마지막 확인 ${esc(timeText(kakaoProfile.checkedAt))}<br>${date !== C.today() ? '선택한 날짜의 식단이 아니에요. ' : ''}사진에 적힌 식단 날짜를 확인해 주세요.${kakaoError ? '<br>다시 확인하지 못해 마지막으로 가져온 사진입니다.' : ''}</p><div class="full-menu-image"><img id="kakaoProfileFull" src="${esc(kakaoProfile.imageUrl)}" alt="런치타임 카카오 프로필 식단. 이미지 속 날짜 확인이 필요합니다." referrerpolicy="no-referrer"></div><p id="kakaoFullError" class="inline-warning" role="status" hidden>사진을 표시하지 못했어요. 아래 카카오 원문에서 확인해 주세요.</p><p class="dialog-copy"><a href="${KAKAO_CHANNEL}" target="_blank" rel="noopener noreferrer">카카오 채널 원문 열기 ↗</a></p>`, true);
  }
  async function mutate(type, payload, requestedDate = date) {
    if (busy) return false;
    if (!identity) { showIdentity(); return false; }
    if (connection && (!connectedReady || !dayReady(requestedDate))) { toast('선택한 날짜의 공유 현황을 먼저 확인해 주세요.'); return false; }
    if (needsServerUpdate()) { toast('모임 참여 요청·알림 기능을 위해 공유 서버를 업데이트해야 합니다. 설정 안내를 확인해 주세요.'); return false; }
    const opDate = requestedDate, actor = identity, op = { type, payload, actor, id: uid() }, target = connection;
    let next;
    try { if (!['settings','menuImageUpload','menuImageDelete'].includes(type)) next = C.applyOperation(day(opDate), opDate, config(), op); }
    
    catch (e) { toast(e.message); return false; }
    if (!target) {
      if (type === 'menuImageUpload' || type === 'menuImageDelete') { toast('팀 공유 연결 후 이용해 주세요.'); return false; }
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
        if (res.receipt) { if (!res.receipt.ok) throw new Error(res.receipt.error || '저장되지 않았어요.'); loadMegaPhoto(); return true; }
        await new Promise(resolve => setTimeout(resolve, 700 + n * 600));
      }
      throw new Error('저장 완료 응답을 받지 못했어요. 새로고침 후 결과를 확인해 주세요.');
    } catch (e) { syncError = e.name === 'AbortError' ? '저장 확인 시간이 지났어요. 새로고침 후 결과를 확인해 주세요.' : e.message; toast(syncError); return false; }
    finally { busy = false; render(); if (opDate !== date && target === connection) sync(); }
  }
  function changeDate(next) {
    if (!C.validDate(next)) { toast('올바른 날짜를 선택해 주세요.'); return; }
    date = next; followsToday = date === C.today(); selectedDecision = ''; draftTime = ''; render(); sync(); loadMegaPhoto(); loadGangnamMenu(date);
  }
  function setIdentity(id) {
    if (!MEMBERS.some(m => m.id === id)) return;
    identity = id; try { write(KEYS.identity, id); } catch (_) {} render(); toast(nameOf(id) + '님으로 선택했어요.');
  }
  function showIdentity() { openDialog('먼저 내 이름을 알려주세요', '<p class="dialog-copy">내 이름으로 식당을 고르고, 내 참석 상태를 바꿔요.</p><div class="choice-grid">' + MEMBERS.map(m => `<button data-action="chooseIdentity" data-id="${m.id}">${m.name}<small style="display:block;color:#89917f;font-weight:400">${m.team}</small></button>`).join('') + '</div>'); }
  function showAvailability(targetDate = date) {
    if (!identity) return showIdentity();
    if (!C.validDate(targetDate)) return;
    const member = MEMBERS.find(m => m.id === identity), current = dailyStatus(member, targetDate).kind;
    const selectedDay = targetDate === C.today() ? '오늘' : '이날';
    const options = [['in', selectedDay + ' 함께 먹어요', '일반 점심으로 메가존·런치타임·강남밥상 중 골라요'], ['separate', selectedDay + ' 따로 먹어요', '동료와 따로 먹거나 개별 식사해요'], ['out', selectedDay + ' 점심 안 먹어요', '연차·반차·외근·출장 등 사유는 선택사항'], ['pending', '선택 취소 · 미선택으로', '내 대표님 점심 취소도 미선택으로 바꿔요'], ['ceo', selectedDay + '은 대표님과 점심', '대표님과 점심으로 직접 지정해요'], ['auto', '기본 일정 따르기', '기본 대표님 일정이 없으면 미선택이 됩니다']];
    openDialog(nameOf(identity) + '님의 ' + dateText(targetDate), `<p class="dialog-copy">${esc(dateText(targetDate))}의 일정만 바꿉니다.</p><div class="availability-options">${options.map(([id, title, sub]) => `<button data-action="${id === 'out' ? 'absence' : id === 'separate' ? 'separate' : 'setAvailability'}" data-id="${id}" data-date="${targetDate}" data-member="${identity}" class="${current === id ? 'active' : ''}">${title}<small>${sub}</small></button>`).join('')}</div>`);
  }
  function showAbsence(targetDate = date, actor = identity) {
    if (!identity) return showIdentity();
    if (actor !== identity || !C.validDate(targetDate)) { toast('내 이름과 변경할 날짜를 다시 확인해 주세요.'); return; }
    const current = day(targetDate).absenceReasons[identity] || '';
    const options = ['', '연차·반차·외근·출장', '속이 안 좋아요', '선약이 있어요', '병원에 가요', '개인 사정'];
    const custom = current && !options.includes(current);
    openDialog(dateText(targetDate) + ' · 점심 불참', `<p class="dialog-copy">${esc(dateText(targetDate))}의 참석 인원과 투표 집계에서 빠져요. 사유는 남기지 않아도 됩니다. 적은 사유는 점심판 멤버에게 보여요.</p><form id="absenceForm" class="dialog-form" data-date="${targetDate}" data-member="${identity}"><label>사유 · 선택<select name="reason" id="absenceReason">${options.map(x => `<option value="${esc(x)}" ${current === x ? 'selected' : ''}>${x || '사유는 남기지 않을게요'}</option>`).join('')}<option value="custom" ${custom ? 'selected' : ''}>직접 입력</option></select></label><label id="customReasonLabel" ${custom ? '' : 'hidden'}>한 줄 메모<input name="customReason" maxlength="60" value="${custom ? esc(current) : ''}" placeholder="필요한 내용만 간단히 남겨 주세요"></label><button class="primary-button">이날 불참으로 저장</button></form>`);
  }
  function showNote(id) {
    if (!identity) return showIdentity(); const p = C.places(day()).find(p => p.id === id); if (!p) return;
    openDialog(p.name + ' · ' + dateText(date) + ' 메뉴 메모', `<p class="dialog-copy">${esc(dateText(date))}에만 표시됩니다. 공유 연결 시 동료들도 함께 볼 수 있어요.</p><form id="noteForm" class="dialog-form" data-id="${esc(id)}"><label>메뉴 또는 전달할 내용<textarea name="text" maxlength="300" placeholder="예: 오늘 제육볶음과 생선까스가 나온대요.">${esc(day().notes[id] || '')}</textarea></label><button class="primary-button" type="submit">메모 저장</button></form>`);
  }
  function showAddPlace() {
    if (!identity) return showIdentity();
    openDialog('오늘은 다른 곳도 좋아요', '<p class="dialog-copy">오늘의 식당 후보에 추가해요. 지도 링크가 있으면 동료들이 찾기 쉬워요.</p><form id="addForm" class="dialog-form"><label>식당 이름<input name="name" required maxlength="30" placeholder="가고 싶은 식당 이름"></label><label>한 줄 소개 · 선택<input name="subtitle" maxlength="60" placeholder="예: 뜨끈한 국물이 생각나는 날"></label><label>지도 링크 · 선택<input name="url" type="url" placeholder="https://naver.me/..."></label><button class="primary-button" type="submit">오늘 후보에 추가</button></form>');
  }
  function showSettings() {
    const s = config();
    openDialog('우리 점심판 설정', `<section class="settings-block"><h3>동료와 함께 쓰기</h3><p class="dialog-copy">${connection ? '초대 링크를 받은 동료는 같은 선택과 일정을 볼 수 있어요. 이름 선택 방식이며, 팀 링크를 가진 사람은 이 점심판을 수정할 수 있습니다.' : '처음 한 번만 공유 서버를 연결하면, 우리 멤버들의 선택이 같은 점심판에 저장돼요.'}</p><div class="button-row"><a class="secondary-button" href="setup.html">코딩 없이 연결하는 안내 ↗</a>${connection ? '<button class="secondary-button" data-action="invite">동료 초대 링크</button>' : ''}</div><details style="margin-top:15px"><summary style="font-size:12px;cursor:pointer">${connection ? '공유 연결 정보 변경' : '이미 공유 주소가 있어요'}</summary><form id="connectionForm" class="dialog-form" style="margin-top:13px"><label>Apps Script 웹 앱 URL<input name="url" type="url" required value="${esc(connection?.url || '')}" placeholder="https://script.google.com/macros/s/.../exec"></label><label>팀 키<input name="key" type="password" required autocomplete="off" value="${esc(connection?.key || read(KEYS.pending, '') || '')}"></label><button class="primary-button">연결 확인하고 저장</button></form></details>${connection ? '<button data-action="disconnect" class="text-button" style="margin-top:13px">이 기기에서 공유 연결 해제</button>' : ''}</section><section class="settings-block"><h3>요일별 대표님과 점심</h3><p class="dialog-copy">체크한 요일에는 대표님과 점심으로 자동 표시돼요. 나머지 날은 미선택으로 시작합니다. 공유 연결 시 이 기본 일정도 팀 전체에 적용됩니다.</p><form id="scheduleForm" class="dialog-form" data-config-revision="${connection ? shared.configRevision : -1}">${MEMBERS.map(m => `<div><span style="font-size:12px;font-weight:650">${m.name} <small style="font-weight:400;color:var(--muted)">${m.team}</small></span><div class="checkbox-grid">${[1,2,3,4,5].map(n => `<label><input type="checkbox" name="${m.id}" value="${n}" ${s.ceoDays[m.id].includes(n) ? 'checked' : ''}>${'일월화수목금토'[n]}</label>`).join('')}</div></div>`).join('')}<label>기본 일정 적용 마지막 날<input name="scheduleEnd" type="date" required min="2020-01-01" max="2099-12-31" value="${s.scheduleEnd}"></label><label>기본 만남 시간 · 수정 가능<input name="meetingTime" type="time" required value="${s.meetingTime}"></label><button class="primary-button">기본 일정 저장</button></form></section>`);
  }
  async function saveConnection(next) {
    if (!validConnection(next)) { toast('웹 앱 /exec 주소와 팀 키를 확인해 주세요.'); return false; }
    try {
      toast('공유 서버와 연결하고 있어요…'); const result = await jsonp({ action: 'state', date }, next);
      if (!result.ok) throw new Error(result.error || '팀 키를 확인해 주세요.');
      write(KEYS.connection, next); connection = next; shared = { days: {}, settings: C.settings(), configRevision: -1, menuImages: {}, features: {} }; megaPhotos.clear(); megaErrors.clear(); mergeResponse(result);
      lastKakaoAttempt = 0; kakaoWaiting = false; render(); loadMegaPhoto(); loadKakaoProfile(true); return true;
    } catch (e) { toast(e.message); return false; }
  }
  function shareEncode(value) { const bytes = new TextEncoder().encode(JSON.stringify(value)); let str = ''; bytes.forEach(b => { str += String.fromCharCode(b); }); return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
  function shareDecode(str) { if (str.length > 18000) throw new Error('링크가 너무 길어요.'); const raw = atob(str.replaceAll('-', '+').replaceAll('_', '/')); return JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0)))); }
  async function copy(text, success) {
    try { await navigator.clipboard.writeText(text); toast(success || '복사했어요.'); }
    catch (_) { openDialog('아래 내용을 복사해 주세요', `<p class="dialog-copy">자동 복사가 차단되어 직접 복사할 수 있게 준비했어요.</p><textarea id="copyText" style="width:100%;height:160px;padding:12px;font:inherit;font-size:12px;border:1px solid var(--line);border-radius:9px" readonly>${esc(text)}</textarea>`); $('copyText').select(); }
  }
  async function shareLink() {
    if (location.protocol === 'file:') { toast('GitHub Pages에 올린 뒤 링크를 공유해 주세요.'); return; }
    const base = new URL('./', location.href).href;
    if (connection) await copy(base + '#join=' + shareEncode(connection), '팀 초대 링크를 복사했어요. 동료에게 전달해 주세요.');
    else { const url = base + '#snapshot=' + shareEncode({ date, day: day(), settings: config() }); await copy(url, '현재 선택 결과 링크를 복사했어요. 이후 변경은 자동 공유되지 않아요.'); }
  }
  function summary() {
    const d = day(), s = config(), attendees = C.participants(date, d, s).sort(compareMembers), counts = C.tally(date, d, s);
    const guests = ceoMembers();
    const lines = [`[SANDS 점심 · ${dateText(date)}]`, `[일반 점심 · ${attendees.length}명]`];
    C.PLACES.forEach(p => lines.push(`${p.name} (${counts[p.id].length}명): ${counts[p.id].map(id => nameOf(id)).join(' · ') || '선택 없음'}`));
    const notPicked = attendees.filter(m => !C.PLACES.some(p => p.id === d.votes[m.id]));
    if (notPicked.length) lines.push(`아직 미선택: ${notPicked.map(m => m.name).join(' · ')}`);
    lines.push('', `[대표님 점심 · ${guests.length}명]`, `참석: ${guests.map(m => m.name).join(' · ') || '없음'}`);
    if (d.ceoDecision) lines.push(`확정 장소: ${d.ceoDecision.name}`, `만남: ${d.ceoDecision.time}`, d.ceoDecision.url);
    else lines.push('장소: 아직 미확정');
    const recorded = new Set();
    MEMBERS.filter(m => C.memberStatus(m.id, date, d, s).kind === 'separate').forEach(m => {
      const group = C.separateGroup(m.id, d);
      if (recorded.has(group.root)) return;
      recorded.add(group.root);
      const names = MEMBERS.filter(person => group.members.includes(person.id)).map(person => person.name);
      const pending = group.pending.map(p => nameOf(p.to));
      lines.push('', `[따로 먹기 · ${names.length}명]`, `참석: ${names.join(' · ')}`);
      if (pending.length) lines.push(`초대 대기: ${pending.join(' · ')}`);
      lines.push(`식당: ${group.venue ? group.venue.name : '미정'}`);
      if (group.venue) lines.push(group.venue.url);
    });
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
    const b = e.target.closest('[data-action]'); if (!b || b.disabled) return;
    const action = b.dataset.action, id = b.dataset.id;
    if (action === 'identity') setIdentity(id);
    else if (action === 'chooseIdentity') { setIdentity(id); closeDialog(); }
    else if (action === 'availability') showAvailability();
    else if (action === 'separate') {
      if (b.dataset.member && b.dataset.member !== identity) return toast('내 이름을 다시 선택해 주세요.');
      showPairDialog(b.dataset.date || date);
    }
    else if (action === 'pairDetails') showPairDetails(id, b.dataset.date || date);
    else if (action === 'joinRequest') {
      if (!identity) return showIdentity();
      const targetDate = b.dataset.date || date;
      if (await mutate('joinRequest', { id: 'join_' + uid(), to: id }, targetDate)) {
        if ($('appDialog').open) closeDialog();
        toast(`${nameOf(id)}님께 모임 참여 요청을 보냈어요. 승인 전까지 기존 점심 선택을 유지합니다.`);
      }
    }
    else if (['joinApprove', 'joinReject', 'joinWithdraw'].includes(action)) {
      if (!identity) return showIdentity();
      if (b.dataset.member && b.dataset.member !== identity) return toast('내 이름을 다시 선택해 주세요.');
      b.disabled = true;
      if (await mutate(action, { requestId: id }, b.dataset.date || date)) {
        if ($('appDialog').open) closeDialog();
        toast({ joinApprove: '참여 요청을 승인했어요. 동료가 따로 먹는 모임으로 이동했습니다.', joinReject: '참여 요청을 거절했어요.', joinWithdraw: '참여 요청을 취소했어요.' }[action]);
      } else b.disabled = false;
    }
    else if (action === 'pairInviteMore') pairInviteDialog(b.dataset.date || date);
    else if (['pairAccept', 'pairDecline', 'pairCancel', 'pairLeave'].includes(action)) {
      if (b.dataset.member && b.dataset.member !== identity) return toast('내 이름을 다시 선택해 주세요.');
      b.disabled = true;
      if (await mutate(action, { pairId: id }, b.dataset.date || date)) {
        if ($('appDialog').open) closeDialog();
        toast({ pairAccept: '따로 먹는 모임에 합류했어요.', pairDecline: '초대를 거절했어요.', pairCancel: '초대를 취소했어요.', pairLeave: '모임에서 나왔어요. 내 점심 여부를 다시 골라 주세요.' }[action]);
      } else b.disabled = false;
    }
    else if (action === 'guideFilter') { guideCategory = ['전체', ...GUIDE_CATEGORIES].includes(id) ? id : '전체'; guideLimit = 6; renderGuide(); }
    else if (action === 'guideMore') { guideLimit += 6; renderGuide(); }
    else if (action === 'guideConfirm') await confirmGuideVenue(id);
    else if (action === 'guideSeparate') await confirmSeparateVenue(id);
    else if (action === 'guideJoinCeo' || action === 'guideJoinSeparate') {
      const targetDate = date, targetAction = action;
      const value = targetAction === 'guideJoinCeo' ? 'ceo' : 'separate';
      if (await mutate('availability', { value }, targetDate)) { closeDialog(); if (targetAction === 'guideJoinCeo') await confirmGuideVenue(id); else await confirmSeparateVenue(id); }
    }
    else if (action === 'absence') showAbsence(b.dataset.date || date, b.dataset.member || identity);
    else if (action === 'setAvailability') {
      const targetDate = b.dataset.date || date;
      if (b.dataset.member && b.dataset.member !== identity) return toast('내 이름을 다시 선택한 뒤 일정을 바꿔 주세요.');
      b.disabled = true;
      if (await mutate('availability', { value: id }, targetDate)) { if ($('appDialog').open) closeDialog(); toast(dateText(targetDate) + ' 참석 상태를 바꿨어요.'); }
      else b.disabled = false;
    }
    else if (action === 'vote') {
      if (!identity) return showIdentity();
      if (!C.memberStatus(identity, date, day(), config()).in) { toast('함께 먹는 상태로 바꾸면 선택할 수 있어요.'); return showAvailability(); }
      if (day().votes[identity] === id) return toast('이미 이 장소를 선택했어요. 다른 식당을 누르면 변경돼요.');
      if (await mutate('vote', { placeId: id })) toast(dateText(date) + ' 일반 점심 장소를 ' + (C.PLACES.find(p => p.id === id)?.name || '') + '(으)로 저장했어요.');
    }
    else if (action === 'megaUpload') openMegaUpload();
    else if (action === 'megaZoom') zoomMega();
    else if (action === 'megaReload') loadMegaPhoto(true);
    else if (action === 'megaDelete') deleteMega(id);
    else if (action === 'viewKakaoProfile') viewKakaoProfile();
    else if (action === 'refreshKakaoProfile') loadKakaoProfile(true);
    else if (action === 'refreshGangnamMenu') loadGangnamMenu(date, true);
    else if (action === 'viewGangnamMenu') viewGangnamMenu();
    else if (action === 'note') showNote(id);
    else if (action === 'remove') { if (confirm('이 식당과 연결된 선택을 오늘 후보에서 삭제할까요?')) await mutate('removePlace', { placeId: id }); }
    else if (action === 'settings') showSettings();
    else if (action === 'retry') { syncError = ''; sync(); loadMegaPhoto(true); }
    else if (action === 'invite') shareLink();
    else if (action === 'date') changeDate(id);
    else if (action === 'dailyMember') showDailyMember(id, b.dataset.date);
    else if (action === 'ceoUnconfirm') {
      if (!identity) return showIdentity();
      if (C.memberStatus(identity, date, day(), config()).kind !== 'ceo') return toast('대표님 점심 참석자만 장소를 변경할 수 있어요.');
      if (confirm(dateText(date) + ' 대표님 점심 장소 확정을 취소할까요?')) { const targetDate = date; if (await mutate('ceoUnconfirm', {}, targetDate)) toast('대표님 점심 장소 확정을 취소했어요.'); }
    }
    else if (action === 'disconnect') {
      if (busy) return toast('저장이 끝난 뒤 연결을 해제해 주세요.');
      if (confirm('이 기기의 공유 연결을 해제할까요? 팀 공유 데이터는 삭제되지 않습니다.')) { connection = null; connectedReady = false; syncError = ''; gangnamRequests = {}; gangnamLoading = false; kakaoRequest = null; kakaoLoading = false; kakaoWaiting = false; kakaoError = ''; lastKakaoAttempt = 0; try { localStorage.removeItem(KEYS.connection); } catch (_) {} closeDialog(); render(); }
    }
    else if (action === 'random') {
      const counts = C.tally(date, day(), config()), max = Math.max(0, ...Object.values(counts).map(a => a.length));
      const pool = C.places(day()).filter(p => counts[p.id].length === max), n = crypto.getRandomValues(new Uint32Array(1))[0];
      const chosen = pool[n % pool.length]; selectedDecision = chosen.id; renderDecision(); toast(chosen.name + ' 당첨! 괜찮다면 확정해 주세요.');
    }
  });
  document.addEventListener('submit', async e => {
    const form = e.target; if (!['decisionForm','addForm','noteForm','connectionForm','scheduleForm','absenceForm','pairInviteForm','megaUploadForm'].includes(form.id)) return;
    e.preventDefault(); if (form.id === 'megaUploadForm') return saveMega(form);
    const f = new FormData(form);
    if (form.id === 'pairInviteForm') {
      if (form.dataset.member !== identity) return toast('내 이름을 다시 선택해 주세요.');
      const members = [...new Set(f.getAll('to').map(String))];
      if (!members.length) return toast('함께 먹을 동료를 한 명 이상 선택해 주세요.');
      const submit = form.querySelector('button'); submit.disabled = true;
      const invites = members.map(to => ({ id: 'pair_' + uid(), to }));
      const existing = C.pairFor(identity, day(form.dataset.date));
      const result = invites.length === 1 && !existing
        ? await mutate('pairInvite', invites[0], form.dataset.date)
        : await mutate('groupInvite', { invites }, form.dataset.date);
      if (result) { closeDialog(); toast(`${members.length}명에게 따로 먹기 초대를 보냈어요. 각자 수락하면 모임에 합류합니다.`); }
      else submit.disabled = false;
    }
    else if (form.id === 'decisionForm') { toast('일반 점심은 메가존·런치타임·강남밥상 중 선택해 주세요.'); }
    else if (form.id === 'absenceForm') {
      if (form.dataset.member !== identity) return toast('내 이름을 다시 선택한 뒤 일정을 바꿔 주세요.');
      const targetDate = form.dataset.date, reason = f.get('reason') === 'custom' ? f.get('customReason') : f.get('reason'), submit = form.querySelector('button');
      submit.disabled = true;
      if (await mutate('availability', { value: 'out', reason }, targetDate)) { closeDialog(); toast(dateText(targetDate) + ' 불참으로 저장했어요.'); }
      else submit.disabled = false;
    }
    else if (form.id === 'addForm') { const p = { id: 'extra_' + uid(), name: f.get('name'), subtitle: f.get('subtitle'), url: f.get('url') }; if (await mutate('addPlace', p)) { closeDialog(); toast('오늘의 다른 식당을 추가했어요.'); } }
    else if (form.id === 'noteForm') { if (await mutate('note', { placeId: form.dataset.id, text: f.get('text') })) { closeDialog(); toast('메뉴 메모를 저장했어요.'); } }
    else if (form.id === 'connectionForm') { const submit = form.querySelector('button'); submit.disabled = true; if (await saveConnection({ url: String(f.get('url')).trim(), key: String(f.get('key')).trim() })) { closeDialog(); toast('공유 연결이 준비됐어요. 동료를 초대해 주세요.'); } else submit.disabled = false; }
    else if (form.id === 'scheduleForm') {
      if (connection && Number(form.dataset.configRevision) !== shared.configRevision) { showSettings(); return toast('다른 동료가 기본 일정을 바꿨어요. 새로 불러온 설정을 확인한 뒤 저장해 주세요.'); }
      const payload = { scheduleEnd: f.get('scheduleEnd'), meetingTime: f.get('meetingTime'), ceoDays: Object.fromEntries(MEMBERS.map(m => [m.id, f.getAll(m.id).map(Number)])) };
      if (!C.validDate(payload.scheduleEnd)) return toast('일정 적용 기간을 확인해 주세요.');
      if (await mutate('settings', payload)) { closeDialog(); toast('기본 일정을 저장했어요.'); }
    }
  });
  document.addEventListener('change', async e => {
    if (e.target.id === 'decisionPlace') selectedDecision = e.target.value;
    if (e.target.id === 'meetingTime') draftTime = e.target.value;
    if (e.target.id === 'absenceReason') $('customReasonLabel').hidden = e.target.value !== 'custom';
  });
  $('identitySelect').innerHTML += teamGroups(MEMBERS).map(group => `<optgroup label="${esc(group.team)}">${group.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</optgroup>`).join('');
  $('identitySelect').addEventListener('change', e => { if (e.target.value) setIdentity(e.target.value); else { identity = ''; try { localStorage.removeItem(KEYS.identity); } catch (_) {} render(); } });
  $('guideSearch').addEventListener('input', e => { guideQuery = e.target.value; guideLimit = 6; renderGuide(); });
  $('dateInput').addEventListener('change', e => changeDate(e.target.value));
  $('prevDate').onclick = () => changeDate(C.shiftDate(date, -1)); $('nextDate').onclick = () => changeDate(C.shiftDate(date, 1)); $('todayBtn').onclick = () => changeDate(C.today());
  $('settingsBtn').onclick = showSettings; $('refreshMenu').onclick = () => { sync(); loadMegaPhoto(true); loadKakaoProfile(true); loadGangnamMenu(date, true); };
  $('ceoCancelled').onchange = async e => {
    const checked = e.target.checked, targetDate = date;
    if (e.target.disabled) return;
    if (!identity) { renderMembers(); return showIdentity(); }
    if (await mutate('ceo', { cancelled: checked }, targetDate)) toast(dateText(targetDate) + (checked ? ' 기본 대표님과 점심을 취소했어요.' : ' 대표님과 점심 기본 일정을 복원했어요.'));
    else renderMembers();
  };
  $('copySummary').onclick = () => copy(summary(), '점심 공지를 복사했어요. 메신저에 붙여넣어 주세요.'); $('shareLink').onclick = shareLink;
  $('closeDialog').onclick = closeDialog;
  $('appDialog').addEventListener('click', e => { if (e.target === $('appDialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(); } });
  document.addEventListener('change', e => { if(e.target.id==='megaFile') prepareMega(e.target.files?.[0]); });
  document.addEventListener('error', e => {
    if(e.target.id==='megaPhotoFull'){e.target.hidden=true;if($('megaPhotoError'))$('megaPhotoError').hidden=false;}
    else if (e.target.id === 'kakaoProfilePhoto' && kakaoProfile && e.target.getAttribute('src') === kakaoProfile.imageUrl) {
      kakaoPhotoError = kakaoProfile.imageUrl; renderMenuCards();
    } else if (e.target.id === 'kakaoProfileFull') { e.target.hidden = true; if ($('kakaoFullError')) $('kakaoFullError').hidden = false; }
    else if (e.target.id === 'gangnamMenuPhoto') { gangnamPhotoErrors.add(e.target.getAttribute('src')); renderMenuCards(); }
    else if (e.target.id === 'gangnamMenuFull') { e.target.hidden = true; if ($('gangnamFullError')) $('gangnamFullError').hidden = false; }
    else if (e.target.classList?.contains('gangnam-menu-video')) {
      const wrap = e.target.closest('.gangnam-media-wrap');
      if (wrap && !wrap.querySelector('.gangnam-video-error')) {
        wrap.insertAdjacentHTML('beforeend', '<p class="inline-warning gangnam-video-error">Threads 동영상 주소가 만료됐거나 외부 사이트 재생이 제한됐습니다. 아래 원문 링크에서 확인해 주세요.</p>');
      }
    }
  }, true);
  // Only an explicitly caption-verified menu is eligible for playback/seek.
  // A short video duration alone never identifies a menu notice.
  document.addEventListener('loadedmetadata', e => {
    const video = e.target;
    if (!video?.classList?.contains('gangnam-menu-video') || video.dataset.previewAttempted) return;
    video.dataset.previewAttempted = '1';
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    try { video.currentTime = Math.min(Math.max(0.8, video.duration * .10), Math.max(0, video.duration - .2)); video.pause(); } catch (_) {}
  }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkMidnight(); sync(); loadMegaPhoto(); loadKakaoProfile(); loadGangnamMenu(date); } });
  function checkMidnight() { const now = C.today(); if (now !== lastToday) { lastToday = now; if (followsToday) changeDate(now); else renderMembers(); } }
  setInterval(() => { checkMidnight(); sync(); }, 30000);
  setInterval(() => { if (!document.hidden) { loadMegaPhoto(); loadKakaoProfile(); loadGangnamMenu(date); } }, 5 * 60000);
  render(); handleFragment(); sync();
})();
