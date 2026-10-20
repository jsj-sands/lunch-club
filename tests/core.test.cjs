const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const settings = C.settings();
const monday = '2026-10-19';
const op = (type, actor, payload) => ({ type, actor, payload });
const apply = (day, type, actor, payload, date = monday) => C.applyOperation(day, date, settings, op(type, actor, payload));
const choose = (day, actor, value) => apply(day, 'availability', actor, { value });
const pairId = n => 'pair_' + n.toString(16).padStart(24, '0');
const invite = (day, from = 'seongjun', to = 'jingi', n = 1) => apply(day, 'pairInvite', from, { id: pairId(n), to });
const accept = (day, to = 'jingi', n = 1) => apply(day, 'pairAccept', to, { pairId: pairId(n) });
const newMembers = [
  { id: 'minjun', name: '최민준', team: '연구기획팀', days: [1,4] },
  { id: 'seongeun', name: '오성은', team: '경영지원팀', days: [3] },
  { id: 'yunseok', name: '장윤석', team: '경영지원팀', days: [3] },
  { id: 'jiwoo', name: '서지우', team: '디자인팀', days: [2] },
  { id: 'hyunju', name: '조현주', team: '영업팀', days: [1,5] }
];

test('새 날짜에는 대표님과 점심만 자동 적용하고 그 외 멤버는 미선택에서 시작한다', () => {
  const days = C.weekDates(monday);
  const statuses = days.map(date => C.MEMBERS.map(m => C.memberStatus(m.id, date, C.emptyDay(), settings)));
  assert.deepEqual(statuses.map(items => items.filter(s => s.kind === 'ceo').length), [4,5,3,1,4]);
  assert.deepEqual(statuses.map(items => items.filter(s => s.kind === 'pending').length), [6,5,7,9,6]);
  assert.deepEqual(days.map(date => C.participants(date, C.emptyDay(), settings).length), [0,0,0,0,0]);
  assert.ok(statuses.flat().every(s => !s.in && !s.manual));
  assert.deepEqual(C.emptyDay().pairs, []);
});
test('기존 다섯 사람의 저장된 설정을 유지하면서 새 다섯 명의 기본 일정을 추가한다', () => {
  const oldSettings = {
    scheduleEnd: '2027-06-30', meetingTime: '12:10',
    ceoDays: { seongjun: [1], juri: [2,4], hyunsu: [], yunchul: [3,5], jingi: [1,4] }
  };
  const original = JSON.stringify(oldSettings), restored = C.settings(oldSettings);
  assert.deepEqual(restored.ceoDays, { ...oldSettings.ceoDays, minjun: [1,4], seongeun: [3], yunseok: [3], jiwoo: [2], hyunju: [1,5] });
  assert.equal(restored.scheduleEnd, oldSettings.scheduleEnd);
  assert.equal(restored.meetingTime, oldSettings.meetingTime);
  assert.equal(JSON.stringify(oldSettings), original);
  assert.equal(C.MEMBERS.filter(m => m.id === 'jingi').length, 1);
  assert.equal(C.MEMBERS.find(m => m.id === 'jingi').team, '디자인팀');
  assert.deepEqual(C.settings({ ceoDays: { jingi: [] } }).ceoDays.jingi, []);
});
test('새 다섯 명의 이름·팀·기본 일정이 정확하며 모두 이름을 선택하고 투표할 수 있다', () => {
  assert.equal(C.MEMBERS.length, 10);
  let day = C.emptyDay();
  for (const member of newMembers) {
    const matches = C.MEMBERS.filter(m => m.id === member.id);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].name, member.name);
    assert.equal(matches[0].team, member.team);
    assert.deepEqual(settings.ceoDays[member.id], member.days);
    if (member.id === 'minjun') {
      assert.equal(C.memberStatus(member.id,'2026-10-22',day,settings).reason, '대표님과 점심');
      assert.throws(() => C.applyOperation(day,'2026-10-22',settings,op('vote',member.id,{placeId:'lunchtime'})), /함께 먹는 상태/);
    }
    day = C.applyOperation(day,'2026-10-22',settings,op('availability',member.id,{value:'in'}));
    day = C.applyOperation(day,'2026-10-22',settings,op('vote',member.id,{placeId:'lunchtime'}));
  }
  const restored = C.cleanDay(JSON.parse(JSON.stringify(day)));
  assert.deepEqual(C.tally('2026-10-22',restored,settings).lunchtime, newMembers.map(m => m.id));
  assert.deepEqual(restored.votes, Object.fromEntries(newMembers.map(m => [m.id, 'lunchtime'])));
  assert.equal(restored.overrides.minjun, 'in');
});
test('최민준의 대표님과 점심은 월·목이며 사용자 지정 요일은 다시 불러와도 유지된다', () => {
  for (const date of C.weekDates(monday)) {
    const status = C.memberStatus('minjun',date,C.emptyDay(),settings);
    const withPresident = [1,4].includes(C.weekday(date));
    assert.equal(status.in, false);
    assert.equal(status.kind, withPresident ? 'ceo' : 'pending');
    if (withPresident) assert.equal(status.reason, '대표님과 점심');
  }
  const saved = C.settings({ ceoDays: { minjun: [3] } });
  assert.deepEqual(C.settings(JSON.parse(JSON.stringify(saved))).ceoDays.minjun, [3]);
  assert.equal(C.memberStatus('minjun','2026-10-21',C.emptyDay(),saved).reason, '대표님과 점심');
  assert.equal(C.memberStatus('minjun',monday,C.emptyDay(),saved).kind, 'pending');
  assert.equal(C.memberStatus('minjun','2026-10-22',C.emptyDay(),saved).kind, 'pending');
});
test('새 멤버 천진기도 투표와 참석 변경을 저장하고 다시 불러올 수 있다', () => {
  let d = choose(C.emptyDay(), 'jingi', 'in');
  d = C.applyOperation(d, monday, settings, op('vote','jingi',{placeId:'lunchtime'}));
  d = C.cleanDay(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(C.tally(monday,d,settings).lunchtime, ['jingi']);
  assert.equal(d.votes.jingi, 'lunchtime');
  assert.throws(() => C.applyOperation(C.emptyDay(),'2026-10-20',settings,op('vote','jingi',{placeId:'megazone'})), /함께 먹는 상태/);
  d = C.applyOperation(C.emptyDay(),'2026-10-20',settings,op('availability','jingi',{value:'in'}));
  d = C.applyOperation(d,'2026-10-20',settings,op('vote','jingi',{placeId:'megazone'}));
  assert.deepEqual(C.tally('2026-10-20',C.cleanDay(d),settings).megazone, ['jingi']);
});
test('기본 일정과 수동 예외 모두 대표님과 점심 문구를 표시한다', () => {
  assert.equal(C.memberStatus('jingi','2026-10-20',C.emptyDay(),settings).reason,'대표님과 점심');
  const d = C.applyOperation(C.emptyDay(),monday,settings,op('availability','jingi',{value:'ceo'}));
  assert.equal(C.memberStatus('jingi',monday,d,settings).reason,'대표님과 점심');
});
test('서울 자정, 주말, 달력 날짜를 일관되게 처리한다', () => {
  assert.equal(C.today(new Date('2026-10-18T15:00:01Z')), monday);
  assert.equal(C.today(new Date('2026-10-18T14:59:59Z')), '2026-10-18');
  assert.equal(C.validDate('2026-02-29'), false);
  assert.equal(C.validDate('2024-02-29'), true);
  assert.equal(C.validDate('2026-10-40'), false);
  assert.equal(C.participants('2026-10-24', C.emptyDay(), settings).length, 0);
  for (const date of ['2026-10-24', '2026-10-25']) {
    assert.ok(C.MEMBERS.every(m => C.memberStatus(m.id,date,C.emptyDay(),settings).kind === 'pending'));
  }
  assert.deepEqual(C.participants('2026-10-24',choose(C.emptyDay(),'jingi','in'),settings).map(m => m.id), ['jingi']);
  assert.deepEqual(C.weekDates('2026-10-25'), C.weekDates(monday));
});
test('오늘 안 먹음은 이유를 보관하고 인원과 투표 집계에서 제외한다', () => {
  let d = choose(C.emptyDay(), 'seongjun', 'in');
  d = C.applyOperation(d, monday, settings, op('vote','seongjun',{placeId:'megazone'}));
  d = C.applyOperation(d,monday,settings,op('availability','seongjun',{value:'out',reason:'병원에 가요'}));
  assert.equal(C.memberStatus('seongjun',monday,d,settings).detail,'병원에 가요');
  assert.equal(C.participants(monday,d,settings).length,0);
  assert.equal(C.tally(monday,d,settings).megazone.length,0);
  assert.throws(()=>C.applyOperation(d,monday,settings,op('vote','seongjun',{placeId:'lunchtime'})),/함께 먹는 상태/);
  d = C.applyOperation(d,monday,settings,op('availability','seongjun',{value:'in'}));
  assert.equal(C.tally(monday,d,settings).megazone.length,1);
  assert.equal(d.absenceReasons.seongjun,undefined);
});
test('사유 미입력이 가능하고, 개인 불참을 대표님과 점심 취소가 되돌리지 않는다', () => {
  let d = C.applyOperation(C.emptyDay(),monday,settings,op('availability','seongjun',{value:'out'}));
  d = C.applyOperation(d,monday,settings,op('ceo','seongjun',{cancelled:true}));
  assert.equal(C.participants(monday,d,settings).length,0);
  assert.equal(C.memberStatus('seongjun',monday,d,settings).reason,'오늘 안 먹음');
  assert.equal(C.memberStatus('seongjun',monday,d,settings).detail,'');
  assert.equal(C.participants('2026-10-22',C.emptyDay(),settings).length,0);
});
test('대표님과 점심 취소와 한 사람의 참석 예외를 구분하고 기본 복원이 된다', () => {
  const tuesday='2026-10-20';
  let d=C.applyOperation(C.emptyDay(),tuesday,settings,op('availability','juri',{value:'in'}));
  assert.equal(C.participants(tuesday,d,settings).length,1);
  d=C.applyOperation(d,tuesday,settings,op('availability','juri',{value:'auto'}));
  assert.equal(C.participants(tuesday,d,settings).length,0);
  assert.equal(C.memberStatus('juri',tuesday,d,settings).kind,'ceo');
  d=C.applyOperation(d,tuesday,settings,op('availability','juri',{value:'pending'}));
  assert.equal(C.memberStatus('juri',tuesday,d,settings).kind,'pending');
  assert.equal(C.memberStatus('hyunsu',tuesday,d,settings).kind,'ceo');
  d=C.applyOperation(d,tuesday,settings,op('ceo','juri',{cancelled:true}));
  assert.equal(C.participants(tuesday,d,settings).length,0);
  assert.equal(C.memberStatus('hyunsu',tuesday,d,settings).kind,'pending');
  d=C.applyOperation(d,tuesday,settings,op('availability','juri',{value:'auto'}));
  assert.equal(d.overrides.juri,undefined);
  assert.equal(C.memberStatus('juri',tuesday,d,settings).kind,'pending');
  d=C.applyOperation(d,tuesday,settings,op('availability','juri',{value:'ceo'}));
  assert.equal(C.memberStatus('juri',tuesday,d,settings).kind,'ceo');
  assert.equal(C.participants(tuesday,d,settings).length,0);
  const plain = choose(choose(C.emptyDay(),'seongjun','in'),'seongjun','auto');
  assert.equal(C.memberStatus('seongjun',monday,plain,settings).kind,'pending');
});
test('화요일 대표님과 점심 취소·복원은 자동 일정만 바꾸고 수동 예외와 불참 사유를 보존한다', () => {
  const tuesday = '2026-10-20';
  let d = C.applyOperation(C.emptyDay(),tuesday,settings,op('availability','yunchul',{value:'out',reason:'병원에 가요'}));
  d = C.applyOperation(d,tuesday,settings,op('availability','juri',{value:'ceo'}));
  d = C.applyOperation(d,tuesday,settings,op('availability','hyunsu',{value:'in'}));
  d = C.applyOperation(d,tuesday,settings,op('availability','minjun',{value:'separate'}));
  d = C.applyOperation(d,tuesday,settings,op('availability','hyunju',{value:'pending'}));
  const originalOverrides = C.clone(d.overrides), originalReasons = C.clone(d.absenceReasons);
  for (const id of ['jingi','jiwoo']) assert.equal(C.memberStatus(id,tuesday,d,settings).reason, '대표님과 점심');
  d = C.applyOperation(d,tuesday,settings,op('ceo','jingi',{cancelled:true}));
  assert.equal(C.participants(tuesday,d,settings).length, 1);
  for (const id of ['jingi','jiwoo']) assert.equal(C.memberStatus(id,tuesday,d,settings).kind, 'pending');
  assert.equal(C.memberStatus('yunchul',tuesday,d,settings).reason, '오늘 안 먹음');
  assert.equal(C.memberStatus('juri',tuesday,d,settings).reason, '대표님과 점심');
  assert.deepEqual(d.overrides, originalOverrides);
  assert.deepEqual(d.absenceReasons, originalReasons);
  d = C.applyOperation(d,tuesday,settings,op('ceo','jingi',{cancelled:false}));
  assert.equal(C.participants(tuesday,d,settings).length, 1);
  for (const id of ['jingi','jiwoo']) assert.equal(C.memberStatus(id,tuesday,d,settings).reason, '대표님과 점심');
  assert.deepEqual(d.overrides, originalOverrides);
  assert.deepEqual(d.absenceReasons, originalReasons);
});
test('일정 적용기한 이후에는 종료된 대표님과 점심 반복 규칙을 적용하지 않는다', () => {
  assert.equal(C.participants('2027-01-01',C.emptyDay(),settings).length,0);
  assert.equal(C.memberStatus('juri','2027-01-01',C.emptyDay(),settings).kind,'pending');
  const extended=C.settings({...settings,scheduleEnd:'2027-12-31'});
  assert.equal(C.participants('2027-01-01',C.emptyDay(),extended).length,0);
  assert.equal(C.memberStatus('juri','2027-01-01',C.emptyDay(),extended).kind,'ceo');
});
test('일반 점심은 메가존과 런치타임만 선택할 수 있고 재선택은 한 사람 한 표로 변경된다', () => {
  let d=choose(C.emptyDay(),'seongjun','in');
  d=C.applyOperation(d,monday,settings,op('vote','seongjun',{placeId:'megazone'}));
  assert.deepEqual(C.tally(monday,d,settings),{megazone:['seongjun'],lunchtime:[]});
  d=C.applyOperation(d,monday,settings,op('vote','seongjun',{placeId:'lunchtime'}));
  assert.deepEqual(C.tally(monday,d,settings),{megazone:[],lunchtime:['seongjun']});
  assert.throws(()=>C.applyOperation(d,monday,settings,op('vote','seongjun',{placeId:null})),/메가존 또는 런치타임/);
  assert.throws(()=>C.applyOperation(d,monday,settings,op('vote','seongjun',{placeId:'extra_test'})),/메가존 또는 런치타임/);
});
test('허용된 멤버, 식당, 링크, 시간만 처리한다', () => {
  const day = choose(C.emptyDay(),'seongjun','in');
  assert.throws(()=>C.applyOperation(C.emptyDay(),monday,settings,op('vote','other',{placeId:'megazone'})),/이름/);
  assert.throws(()=>C.applyOperation(day,monday,settings,op('vote','seongjun',{placeId:'does-not-exist'})),/메가존 또는 런치타임/);
  assert.equal(C.safeUrl('javascript:alert(1)'), '');
  assert.equal(C.safeUrl('https://example.com/\n<script>'), '');
  assert.throws(()=>C.applyOperation(day,monday,settings,op('decision','seongjun',{placeId:'megazone',time:'25:00'})),/시간/);
});
test('명시적으로 함께 먹기를 고른 멤버만 투표하고 확정하며 다른 상태는 집계하지 않는다', () => {
  for (const value of ['auto','pending','out','ceo','separate','in']) {
    let day = choose(choose(C.emptyDay(),'yunchul','in'),'seongjun',value);
    const before = JSON.stringify(day), status = C.memberStatus('seongjun',monday,day,settings);
    assert.equal(status.kind, value === 'auto' ? 'pending' : value);
    assert.equal(status.in, value === 'in');
    assert.equal(status.manual, value !== 'auto');
    if (value === 'in') {
      day = apply(day,'vote','seongjun',{placeId:'megazone'});
      day = apply(day,'decision','seongjun',{placeId:'megazone',time:'12:00'});
      assert.deepEqual(C.tally(monday,day,settings).megazone,['seongjun']);
      assert.equal(day.decision.actor,'seongjun');
    } else {
      assert.throws(() => apply(day,'vote','seongjun',{placeId:'megazone'}),/함께 먹는 상태/);
      assert.throws(() => apply(day,'decision','seongjun',{placeId:'megazone',time:'12:00'}),/함께 먹는 상태/);
      assert.equal(JSON.stringify(day),before);
    }
  }
});
test('이전 날짜 기록의 직접 참석·불참·투표·확정·설명은 새 기본값과 함께 복원된다', () => {
  const legacy = {
    ceoCancelled: true, overrides: { seongjun:'in', jingi:'out', juri:'ceo' },
    absenceReasons: { jingi:'외부 미팅' }, votes: { seongjun:'extra_old', yunchul:'megazone', jingi:'lunchtime' },
    extras: [{ id:'extra_old', name:'국수집', subtitle:'전에 추가한 곳', url:'https://example.com/' }],
    notes: { extra_old:'기존 메모' }, decision: { placeId:'extra_old', time:'12:10', actor:'yunchul', at:'2026-10-19T02:00:00Z' },
    revision:42, updatedAt:'2026-10-19T02:00:00Z'
  };
  const before = JSON.stringify(legacy), restored = C.cleanDay(legacy);
  assert.deepEqual(restored,{...legacy,ceoDecision:null,pairs:[]});
  assert.equal(JSON.stringify(legacy),before);
  assert.deepEqual(C.participants(monday,restored,settings).map(m => m.id),['seongjun']);
  assert.deepEqual(C.tally(monday,restored,settings),{megazone:[],lunchtime:[]});
  const returned = choose(restored,'yunchul','in');
  assert.deepEqual(C.tally(monday,returned,settings).megazone,['yunchul']);
  assert.deepEqual(returned.decision,legacy.decision);
});
test('짝 초대는 초대한 본인만 따로 먹기로 바꾸고 수신자의 이전 선택과 투표를 보존한다', () => {
  for (const value of ['auto','in','out','ceo','pending','separate']) {
    let day = choose(C.emptyDay(),'jingi',value);
    day.absenceReasons.jingi = value === 'out' ? '약속이 있어요' : undefined;
    day.votes.jingi = 'megazone';
    const before = JSON.stringify(day), previousStatus = C.memberStatus('jingi',monday,day,settings);
    const next = invite(day);
    assert.equal(JSON.stringify(day),before);
    assert.equal(next.overrides.seongjun,'separate');
    assert.deepEqual(C.memberStatus('jingi',monday,next,settings),previousStatus);
    assert.equal(next.votes.jingi,'megazone');
    assert.equal(next.absenceReasons.jingi,day.absenceReasons.jingi);
    assert.deepEqual(next.pairs,[{id:pairId(1),from:'seongjun',to:'jingi',status:'pending'}]);
    assert.deepEqual(C.pairFor('seongjun',next),next.pairs[0]);
    assert.deepEqual(C.pairFor('jingi',next),next.pairs[0]);
    assert.deepEqual(C.incomingPairs('jingi',next),next.pairs);
    assert.deepEqual(C.incomingPairs('seongjun',next),[]);
    assert.equal(C.pairFor('yunchul',next),null);
  }
});
test('수신자의 수락 뒤에만 둘이 따로 먹으며 기존 투표는 보관하되 함께 먹는 집계에서 뺀다', () => {
  let day = choose(choose(C.emptyDay(),'seongjun','in'),'jingi','in');
  day = apply(apply(day,'vote','seongjun',{placeId:'megazone'}),'vote','jingi',{placeId:'megazone'});
  day = invite(day);
  assert.deepEqual(C.tally(monday,day,settings).megazone,['jingi']);
  const before = JSON.stringify(day), next = accept(day);
  assert.equal(JSON.stringify(day),before);
  assert.equal(next.pairs[0].status,'accepted');
  assert.equal(next.overrides.seongjun,'separate');
  assert.equal(next.overrides.jingi,'separate');
  assert.deepEqual(next.votes,{seongjun:'megazone',jingi:'megazone'});
  assert.deepEqual(C.tally(monday,next,settings).megazone,[]);
  assert.deepEqual(C.incomingPairs('jingi',next),[]);
  assert.deepEqual(C.cleanDay(JSON.parse(JSON.stringify(next))),next);
});
test('수신자 거절과 발신자 취소는 초대만 없애고 두 사람의 선택을 바꾸지 않는다', () => {
  for (const [type,actor] of [['pairDecline','jingi'],['pairCancel','seongjun']]) {
    const day = invite(choose(C.emptyDay(),'jingi','in'));
    const next = apply(day,type,actor,{pairId:pairId(1)});
    assert.deepEqual(next.pairs,[]);
    assert.deepEqual(next.overrides,day.overrides);
    assert.equal(next.overrides.seongjun,'separate');
    assert.equal(next.overrides.jingi,'in');
    assert.throws(() => accept(next),/이미 변경/);
  }
});
test('수락한 짝에서 나간 본인은 미선택이며 상대는 따로 먹기를 유지한다', () => {
  for (const [leaving,staying] of [['seongjun','jingi'],['jingi','seongjun']]) {
    const day = accept(invite(C.emptyDay()));
    const next = apply(day,'pairLeave',leaving,{pairId:pairId(1)});
    assert.deepEqual(next.pairs,[]);
    assert.equal(C.memberStatus(leaving,monday,next,settings).kind,'pending');
    assert.equal(C.memberStatus(staying,monday,next,settings).kind,'separate');
    assert.throws(() => apply(next,'pairLeave',staying,{pairId:pairId(1)}),/이미 변경/);
  }
});
test('개인이 상태를 다시 선택하면 자신의 초대나 짝만 해제하고 상대 상태는 보존한다', () => {
  for (const accepted of [false,true]) {
    for (const actor of ['seongjun','jingi']) {
      for (const value of ['auto','pending','in','out','ceo','separate']) {
        let day = invite(choose(C.emptyDay(),'jingi','in'));
        if (accepted) day = accept(day);
        day = invite(day,'yunchul','jiwoo',2);
        const partner = actor === 'seongjun' ? 'jingi' : 'seongjun';
        const partnerStatus = C.memberStatus(partner,monday,day,settings);
        const next = choose(day,actor,value);
        assert.equal(C.pairFor(actor,next),null);
        assert.deepEqual(C.memberStatus(partner,monday,next,settings),partnerStatus);
        assert.deepEqual(C.pairFor('yunchul',next),C.pairFor('yunchul',day));
        assert.throws(() => accept(next),/이미 변경/);
      }
    }
  }
});
test('초대 예약 중이거나 이미 수락한 사람을 다른 짝으로 강제 이동시키지 않는다', () => {
  for (const accepted of [false,true]) {
    const day = accepted ? accept(invite(C.emptyDay())) : invite(C.emptyDay());
    const before = JSON.stringify(day);
    for (const from of ['seongjun','jingi']) assert.throws(() => invite(day,from,'yunchul',2),/진행 중/);
    for (const to of ['seongjun','jingi']) assert.throws(() => invite(day,'yunchul',to,2),/진행 중/);
    assert.throws(() => invite(day,'yunchul','jiwoo',1),/이미 사용 중/);
    assert.equal(JSON.stringify(day),before);
    const second = invite(day,'yunchul','jiwoo',2);
    assert.equal(second.pairs.length,2);
  }
});
test('페어링 요청의 역할·상태·멤버·초대 번호를 검증하고 실패는 원본을 수정하지 않는다', () => {
  const pending = invite(C.emptyDay()), accepted = accept(pending);
  const bad = [
    [pending,'pairAccept','seongjun',{pairId:pairId(1)},/초대받은 본인/],
    [pending,'pairDecline','yunchul',{pairId:pairId(1)},/초대받은 본인/],
    [pending,'pairCancel','jingi',{pairId:pairId(1)},/초대한 본인/],
    [pending,'pairLeave','jingi',{pairId:pairId(1)},/수락한 짝/],
    [accepted,'pairAccept','jingi',{pairId:pairId(1)},/이미 처리/],
    [accepted,'pairDecline','jingi',{pairId:pairId(1)},/이미 처리/],
    [accepted,'pairCancel','seongjun',{pairId:pairId(1)},/이미 처리/],
    [accepted,'pairLeave','yunchul',{pairId:pairId(1)},/본인이 속한/],
    [pending,'pairAccept','jingi',{pairId:pairId(2)},/이미 변경/],
    [C.emptyDay(),'pairInvite','jingi',{id:pairId(1),to:'jingi'},/다른 멤버/],
    [C.emptyDay(),'pairInvite','jingi',{id:pairId(1),to:'__proto__'},/다른 멤버/]
  ];
  for (const id of ['bad', 'pair_'+ 'a'.repeat(25), '__proto__', {}, null]) {
    bad.push([pending,'pairAccept','jingi',{pairId:id},/초대 번호/]);
    bad.push([C.emptyDay(),'pairInvite','jingi',{id,to:'seongjun'},/초대 번호/]);
  }
  for (const [day,type,actor,payload,pattern] of bad) {
    const before = JSON.stringify(day);
    assert.throws(() => apply(day,type,actor,payload),pattern);
    assert.equal(JSON.stringify(day),before);
  }
});
test('저장된 쌍은 유효한 두 멤버·동의 상태·개인 선택이 맞는 것만 중복 없이 복구한다', () => {
  const day = C.emptyDay();
  day.overrides = {seongjun:'separate',jingi:'separate',yunchul:'separate',jiwoo:'in',hyunsu:'separate',minjun:'separate'};
  const accepted = {id:pairId(1),from:'seongjun',to:'jingi',status:'accepted'};
  const pending = {id:pairId(2),from:'yunchul',to:'jiwoo',status:'pending'};
  day.pairs = [
    {id:pairId(3),from:'jingi',to:'hyunsu',status:'pending'},
    {...accepted,extra:'ignored'}, accepted,
    {id:pairId(1),from:'hyunsu',to:'minjun',status:'accepted'},
    {id:pairId(4),from:'jiwoo',to:'minjun',status:'accepted'},
    {id:pairId(5),from:'hyunsu',to:'hyunsu',status:'accepted'},
    {id:pairId(6),from:'hyunsu',to:'__proto__',status:'pending'},
    {id:pairId(7),from:'hyunsu',to:'minjun',status:'rejected'},
    {id:'__proto__',from:'hyunsu',to:'minjun',status:'pending'},
    {id:pairId(8),from:{id:'hyunsu'},to:'minjun',status:'pending'}, null, 'unsafe', [], pending
  ];
  const before = JSON.stringify(day), restored = C.cleanDay(day);
  assert.deepEqual(restored.pairs,[accepted,pending]);
  assert.deepEqual(restored.overrides,day.overrides);
  assert.equal(JSON.stringify(day),before);
  assert.deepEqual(C.cleanDay({pairs:{from:'seongjun'}}).pairs,[]);
  assert.equal(C.pairFor('unknown',day),null);
  assert.deepEqual(C.incomingPairs('unknown',day),[]);
  const detached = C.pairFor('seongjun',restored); detached.status = 'pending';
  assert.equal(restored.pairs[0].status,'accepted');
});
test('메가존 Markdown에서 점심 주메뉴만 추출한다', () => {
  const input='# 메뉴\n## 아침\n- 토스트\n## 점심\n\n- 나주곰탕\n  - Nutrition: 817 kcal\n  - Components: 나주곰탕\n- 치즈볶음밥\n## 저녁\n- 카레\n';
  assert.deepEqual(C.parseMenuMarkdown(input),['나주곰탕','치즈볶음밥']);
  assert.deepEqual(C.parseMenuMarkdown('# 메뉴\n## 아침\n- 토스트'),[]);
});

// 2026-10-20: CEO venue is date-wide while regular cafeteria choices stay person-wide.
test('대표님 점심은 식당 하나를 그 날짜에만 공유하고 일반 점심 선택과 서로 침범하지 않는다', () => {
  const tuesday='2026-10-20', other='2026-10-21';
  let d=C.applyOperation(C.emptyDay(), tuesday, settings, op('availability','yunchul',{value:'in'}));
  d=C.applyOperation(d,tuesday,settings,op('vote','yunchul',{placeId:'megazone'}));
  const payload={placeId:'guide_1764937561',name:'만보성',url:'https://m.place.naver.com/place/1764937561/home',time:'12:00',category:'중식'};
  d=C.applyOperation(d,tuesday,settings,op('ceoDecision','jingi',payload));
  assert.equal(d.ceoDecision.name,'만보성');
  assert.equal(d.ceoDecision.actor,'jingi');
  assert.deepEqual(C.tally(tuesday,d,settings),{megazone:['yunchul'],lunchtime:[]});
  assert.equal(C.cleanDay(JSON.parse(JSON.stringify(d))).ceoDecision.url,payload.url);
  assert.equal(C.cleanDay(C.emptyDay()).ceoDecision,null);
  assert.equal(C.memberStatus('jingi',other,C.emptyDay(),settings).kind,'pending');
  const next=C.applyOperation(d,tuesday,settings,op('ceoDecision','jiwoo',{...payload,placeId:'guide_2046292975',name:'코다리명가',url:'https://m.place.naver.com/place/2046292975/home'}));
  assert.equal(next.ceoDecision.actor,'jiwoo');
  assert.deepEqual(next.votes,d.votes);
  assert.equal(d.ceoDecision.name,'만보성','원래 날짜 데이터는 불변');
  const reset=C.applyOperation(next,tuesday,settings,op('ceoUnconfirm','jingi',{}));
  assert.equal(reset.ceoDecision,null);
  assert.deepEqual(reset.votes,d.votes);
});

test('대표님 점심 확정·취소 권한과 식당/시간 형식을 검증한다', () => {
  const tuesday='2026-10-20';
  const payload={placeId:'guide_1764937561',name:'만보성',url:'https://m.place.naver.com/place/1764937561/home',time:'12:00',category:'중식'};
  const d=C.emptyDay();
  for(const actor of ['yunchul','minjun']){
    assert.throws(()=>C.applyOperation(d,tuesday,settings,op('ceoDecision',actor,payload)),/대표님 점심 참석자만/);
    assert.throws(()=>C.applyOperation(d,tuesday,settings,op('ceoUnconfirm',actor,{})),/대표님 점심 참석자만/);
  }
  for(const [changes,regex] of [
    [{placeId:'extra_1764937561'},/맛집 목록/],
    [{placeId:'guide_123',url:'https://m.place.naver.com/place/123/home'},/맛집 목록/],
    [{url:'https://example.org/'},/맛집 목록/],
    [{name:'   '},/맛집 목록/],
    [{time:'25:30'},/시간/],
  ]) assert.throws(()=>C.applyOperation(d,tuesday,settings,op('ceoDecision','jingi',{...payload,...changes})),regex);
  assert.equal(d.ceoDecision,null);
});
