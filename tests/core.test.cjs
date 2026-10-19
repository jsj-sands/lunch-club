const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const settings = C.settings();
const monday = '2026-10-19';
const op = (type, actor, payload) => ({ type, actor, payload });

test('천진기 추가 후 주간 기본 인원: 월3 화1 수4 목5 금2', () => {
  assert.deepEqual(C.weekDates(monday).map(d => C.participants(d, C.emptyDay(), settings).map(m => m.name)), [
    ['조성준','김윤철','천진기'], ['김윤철'], ['조성준','손주리','윤현수','천진기'], ['조성준','손주리','윤현수','김윤철','천진기'], ['김윤철','천진기']
  ]);
});
test('기존 네 사람의 저장된 설정을 유지하면서 천진기의 화요일 기본 일정을 추가한다', () => {
  const oldSettings = {
    scheduleEnd: '2027-06-30', meetingTime: '12:10',
    ceoDays: { seongjun: [1], juri: [2,4], hyunsu: [], yunchul: [3,5] }
  };
  const original = JSON.stringify(oldSettings), restored = C.settings(oldSettings);
  assert.deepEqual(restored.ceoDays, { ...oldSettings.ceoDays, jingi: [2] });
  assert.equal(restored.scheduleEnd, oldSettings.scheduleEnd);
  assert.equal(restored.meetingTime, oldSettings.meetingTime);
  assert.equal(JSON.stringify(oldSettings), original);
  assert.equal(C.MEMBERS.filter(m => m.id === 'jingi').length, 1);
  assert.equal(C.MEMBERS.find(m => m.id === 'jingi').team, '디자인팀');
  assert.deepEqual(C.settings({ ceoDays: { jingi: [] } }).ceoDays.jingi, []);
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
  assert.equal(C.participants(monday,d,settings).length,2);
  assert.equal(C.tally(monday,d,settings).megazone.length,0);
  assert.throws(()=>C.applyOperation(d,monday,settings,op('vote','seongjun',{placeId:'lunchtime'})),/함께 먹는 상태/);
  d = C.applyOperation(d,monday,settings,op('availability','seongjun',{value:'in'}));
  assert.equal(C.tally(monday,d,settings).megazone.length,1);
  assert.equal(d.absenceReasons.seongjun,undefined);
});
test('사유 미입력이 가능하고, 개인 불참을 대표님과 점심 취소가 되돌리지 않는다', () => {
  let d = C.applyOperation(C.emptyDay(),monday,settings,op('availability','seongjun',{value:'out'}));
  d = C.applyOperation(d,monday,settings,op('ceo','seongjun',{cancelled:true}));
  assert.equal(C.participants(monday,d,settings).length,4);
  assert.equal(C.memberStatus('seongjun',monday,d,settings).reason,'오늘 안 먹음');
  assert.equal(C.memberStatus('seongjun',monday,d,settings).detail,'');
  assert.equal(C.participants('2026-10-22',C.emptyDay(),settings).length,5);
});
test('대표님과 점심 취소와 한 사람의 참석 예외를 구분하고 기본 복원이 된다', () => {
  const tuesday='2026-10-20';
  let d=C.applyOperation(C.emptyDay(),tuesday,settings,op('availability','juri',{value:'in'}));
  assert.equal(C.participants(tuesday,d,settings).length,2);
  d=C.applyOperation(d,tuesday,settings,op('availability','juri',{value:'auto'}));
  assert.equal(C.participants(tuesday,d,settings).length,1);
  d=C.applyOperation(d,tuesday,settings,op('ceo','juri',{cancelled:true}));
  assert.equal(C.participants(tuesday,d,settings).length,5);
  d=C.applyOperation(d,tuesday,settings,op('availability','juri',{value:'ceo'}));
  assert.equal(C.participants(tuesday,d,settings).length,4);
});
test('일정 적용기한 이후에는 종료된 대표님과 점심 반복 규칙을 적용하지 않는다', () => {
  assert.equal(C.participants('2027-01-01',C.emptyDay(),settings).length,5);
  const extended=C.settings({...settings,scheduleEnd:'2027-12-31'});
  assert.equal(C.participants('2027-01-01',C.emptyDay(),extended).length,2);
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
