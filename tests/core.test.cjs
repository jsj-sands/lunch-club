const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const settings = C.settings();
const monday = '2026-10-19';
const op = (type, actor, payload) => ({ type, actor, payload });
const newMembers = [
  { id: 'minjun', name: '최민준', team: '연구기획팀', days: [1,4] },
  { id: 'seongeun', name: '오성은', team: '경영지원팀', days: [3] },
  { id: 'yunseok', name: '장윤석', team: '경영지원팀', days: [3] },
  { id: 'jiwoo', name: '서지우', team: '디자인팀', days: [2] },
  { id: 'hyunju', name: '조현주', team: '영업팀', days: [1,5] }
];

test('총 열 명의 주간 기본 인원: 월6 화5 수7 목9 금6', () => {
  assert.deepEqual(C.weekDates(monday).map(d => C.participants(d, C.emptyDay(), settings).map(m => m.name)), [
    ['조성준','김윤철','천진기','오성은','장윤석','서지우'],
    ['김윤철','최민준','오성은','장윤석','조현주'],
    ['조성준','손주리','윤현수','천진기','최민준','서지우','조현주'],
    ['조성준','손주리','윤현수','김윤철','천진기','오성은','장윤석','서지우','조현주'],
    ['김윤철','천진기','최민준','오성은','장윤석','서지우']
  ]);
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
      day = C.applyOperation(day,'2026-10-22',settings,op('availability',member.id,{value:'in'}));
    }
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
    assert.equal(status.in, !withPresident);
    if (withPresident) assert.equal(status.reason, '대표님과 점심');
  }
  const saved = C.settings({ ceoDays: { minjun: [3] } });
  assert.deepEqual(C.settings(JSON.parse(JSON.stringify(saved))).ceoDays.minjun, [3]);
  assert.equal(C.memberStatus('minjun','2026-10-21',C.emptyDay(),saved).reason, '대표님과 점심');
  assert.equal(C.memberStatus('minjun',monday,C.emptyDay(),saved).in, true);
  assert.equal(C.memberStatus('minjun','2026-10-22',C.emptyDay(),saved).in, true);
});
test('새 멤버 천진기도 투표와 참석 변경을 저장하고 다시 불러올 수 있다', () => {
  let d = C.applyOperation(C.emptyDay(), monday, settings, op('vote','jingi',{placeId:'lunchtime'}));
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
  assert.deepEqual(C.weekDates('2026-10-25'), C.weekDates(monday));
});
test('오늘 안 먹음은 이유를 보관하고 인원과 투표 집계에서 제외한다', () => {
  let d = C.applyOperation(C.emptyDay(), monday, settings, op('vote','seongjun',{placeId:'megazone'}));
  d = C.applyOperation(d,monday,settings,op('availability','seongjun',{value:'out',reason:'병원에 가요'}));
  assert.equal(C.memberStatus('seongjun',monday,d,settings).detail,'병원에 가요');
  assert.equal(C.participants(monday,d,settings).length,5);
  assert.equal(C.tally(monday,d,settings).megazone.length,0);
  assert.throws(()=>C.applyOperation(d,monday,settings,op('vote','seongjun',{placeId:'lunchtime'})),/함께 먹는 상태/);
  d = C.applyOperation(d,monday,settings,op('availability','seongjun',{value:'in'}));
  assert.equal(C.tally(monday,d,settings).megazone.length,1);
  assert.equal(d.absenceReasons.seongjun,undefined);
});
test('사유 미입력이 가능하고, 개인 불참을 대표님과 점심 취소가 되돌리지 않는다', () => {
  let d = C.applyOperation(C.emptyDay(),monday,settings,op('availability','seongjun',{value:'out'}));
  d = C.applyOperation(d,monday,settings,op('ceo','seongjun',{cancelled:true}));
  assert.equal(C.participants(monday,d,settings).length,9);
  assert.equal(C.memberStatus('seongjun',monday,d,settings).reason,'오늘 안 먹음');
  assert.equal(C.memberStatus('seongjun',monday,d,settings).detail,'');
  assert.equal(C.participants('2026-10-22',C.emptyDay(),settings).length,9);
});
test('대표님과 점심 취소와 한 사람의 참석 예외를 구분하고 기본 복원이 된다', () => {
  const tuesday='2026-10-20';
  let d=C.applyOperation(C.emptyDay(),tuesday,settings,op('availability','juri',{value:'in'}));
  assert.equal(C.participants(tuesday,d,settings).length,6);
  d=C.applyOperation(d,tuesday,settings,op('availability','juri',{value:'auto'}));
  assert.equal(C.participants(tuesday,d,settings).length,5);
  d=C.applyOperation(d,tuesday,settings,op('ceo','juri',{cancelled:true}));
  assert.equal(C.participants(tuesday,d,settings).length,10);
  d=C.applyOperation(d,tuesday,settings,op('availability','juri',{value:'ceo'}));
  assert.equal(C.participants(tuesday,d,settings).length,9);
});
test('화요일 대표님과 점심 취소·복원은 자동 일정만 바꾸고 수동 예외와 불참 사유를 보존한다', () => {
  const tuesday = '2026-10-20';
  let d = C.applyOperation(C.emptyDay(),tuesday,settings,op('availability','yunchul',{value:'out',reason:'병원에 가요'}));
  d = C.applyOperation(d,tuesday,settings,op('availability','juri',{value:'ceo'}));
  const originalOverrides = C.clone(d.overrides), originalReasons = C.clone(d.absenceReasons);
  for (const id of ['jingi','jiwoo']) assert.equal(C.memberStatus(id,tuesday,d,settings).reason, '대표님과 점심');
  d = C.applyOperation(d,tuesday,settings,op('ceo','jingi',{cancelled:true}));
  assert.equal(C.participants(tuesday,d,settings).length, 8);
  for (const id of ['jingi','jiwoo']) assert.equal(C.memberStatus(id,tuesday,d,settings).in, true);
  assert.equal(C.memberStatus('yunchul',tuesday,d,settings).reason, '오늘 안 먹음');
  assert.equal(C.memberStatus('juri',tuesday,d,settings).reason, '대표님과 점심');
  assert.deepEqual(d.overrides, originalOverrides);
  assert.deepEqual(d.absenceReasons, originalReasons);
  d = C.applyOperation(d,tuesday,settings,op('ceo','jingi',{cancelled:false}));
  assert.equal(C.participants(tuesday,d,settings).length, 4);
  for (const id of ['jingi','jiwoo']) assert.equal(C.memberStatus(id,tuesday,d,settings).reason, '대표님과 점심');
  assert.deepEqual(d.overrides, originalOverrides);
  assert.deepEqual(d.absenceReasons, originalReasons);
});
test('일정 적용기한 이후에는 종료된 대표님과 점심 반복 규칙을 적용하지 않는다', () => {
  assert.equal(C.participants('2027-01-01',C.emptyDay(),settings).length,10);
  const extended=C.settings({...settings,scheduleEnd:'2027-12-31'});
  assert.equal(C.participants('2027-01-01',C.emptyDay(),extended).length,6);
});
test('다른 식당 추가, 한 사람 한 표, 삭제 시 연관 투표와 확정을 정리한다', () => {
  let d=C.applyOperation(C.emptyDay(),monday,settings,op('addPlace','seongjun',{id:'extra_test',name:'국수집',url:'https://naver.me/test'}));
  d=C.applyOperation(d,monday,settings,op('vote','seongjun',{placeId:'megazone'}));
  d=C.applyOperation(d,monday,settings,op('vote','seongjun',{placeId:'extra_test'}));
  assert.equal(C.tally(monday,d,settings).megazone.length,0);
  d=C.applyOperation(d,monday,settings,op('decision','seongjun',{placeId:'extra_test',time:'12:15'}));
  assert.equal(d.decision.placeId,'extra_test');
  d=C.applyOperation(d,monday,settings,op('removePlace','seongjun',{placeId:'extra_test'}));
  assert.equal(d.decision,null);assert.equal(d.votes.seongjun,undefined);
});
test('허용된 멤버, 식당, 링크, 시간만 처리한다', () => {
  assert.throws(()=>C.applyOperation(C.emptyDay(),monday,settings,op('vote','other',{placeId:'megazone'})),/이름/);
  assert.throws(()=>C.applyOperation(C.emptyDay(),monday,settings,op('vote','seongjun',{placeId:'does-not-exist'})),/식당/);
  assert.equal(C.safeUrl('javascript:alert(1)'), '');
  assert.equal(C.safeUrl('https://example.com/\n<script>'), '');
  assert.throws(()=>C.applyOperation(C.emptyDay(),monday,settings,op('decision','seongjun',{placeId:'megazone',time:'25:00'})),/시간/);
});
test('메가존 Markdown에서 점심 주메뉴만 추출한다', () => {
  const input='# 메뉴\n## 아침\n- 토스트\n## 점심\n\n- 나주곰탕\n  - Nutrition: 817 kcal\n  - Components: 나주곰탕\n- 치즈볶음밥\n## 저녁\n- 카레\n';
  assert.deepEqual(C.parseMenuMarkdown(input),['나주곰탕','치즈볶음밥']);
  assert.deepEqual(C.parseMenuMarkdown('# 메뉴\n## 아침\n- 토스트'),[]);
});
