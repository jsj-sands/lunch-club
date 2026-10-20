const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const KEY='a'.repeat(48), DAY='2026-10-20';
function server(owner='owner@example.com') {
  const store={}, notifications=[], files=[], logs=[], emails=[]; let locked=false, count=0, shareStatus=200, folder=null, slackEvents=[];
  const properties={getProperties:()=>({...store}),getProperty:k=>store[k]||null,setProperty(k,v){store[k]=v;return this;},setProperties(v){Object.entries(v).forEach(([k,val])=>this.setProperty(k,val));return this;},deleteProperty(k){delete store[k];return this;}};
  const fakeFolder=()=>({
    id:'private-folder',desc:'',sharing:'PRIVATE',trashed:false,
    getId(){return this.id;},setDescription(d){this.desc=d;},getDescription(){return this.desc;},
    setSharing(v){this.sharing=v;return this;},getSharingAccess(){return this.sharing;},isTrashed(){return this.trashed;},
    createFile(name,body,mime){
      const f={id:'file-'+(files.length+1),name,body,mime,trashed:false,created:new Date(),
        getId(){return this.id;},setSharing(){return this;},setTrashed(v){this.trashed=v;return this;},
        isTrashed(){return this.trashed;},getDateCreated(){return this.created;}};
      files.push(f); return f;
    },
    getFiles(){let i=0;return {hasNext(){return i<files.length;},next(){return files[i++];}};}
  });
  const ctx={MailApp:{sendEmail(message){emails.push(message);}},console:{log:(...xs)=>logs.push(xs.join(' '))},Date,Intl,URL,Set,
    Utilities:{newBlob:s=>({getBytes:()=>Buffer.from(s)}),getUuid:()=>crypto.randomUUID(),formatDate:()=>DAY},
    PropertiesService:{getScriptProperties:()=>properties},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:s=>({text:s,setMimeType(){return this;}})},
    CacheService:{getScriptCache:()=>({get(){return null;},put(){}})},
    LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},hasLock:()=>locked,releaseLock(){locked=false;}})},
    MimeType:{PLAIN_TEXT:'text/plain'},DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{VIEW:'VIEW'},
      createFolder(){folder=fakeFolder();return folder;},getFolderById(id){if(!folder||id!==folder.id)throw Error('missing folder');return folder;}},
    Session:{getEffectiveUser:()=>({getEmail:()=>owner})},ScriptApp:{getOAuthToken:()=> 'secret-access-token'},
    UrlFetchApp:{fetch(url,options){assert.equal(locked,false,'External API must not hold the write lock');
      if(url.startsWith('https://www.googleapis.com/drive/v3/files/')) {
        notifications.push({url,options});return {getResponseCode:()=>shareStatus,getContentText:()=>'{"id":"permission"}'};
      }
      if(url.startsWith('https://slack.com/api/')) {
        slackEvents.push({url,options});return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.endsWith('conversations.open')?{ok:true,channel:{id:'D1234567890'}}:{ok:true})};
      }
      return {getResponseCode:()=>200,getContentText:()=>'- Vendor: test'};
    }}
  };
  vm.createContext(ctx);
  const source=fs.readFileSync(path.join(__dirname,'../core.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../backend/server.js'),'utf8');
  vm.runInContext(source.replace("'__TEAM_KEY__'",`'${KEY}'`),ctx);
  const post=(type,actor,payload,id=(++count).toString(16).padStart(24,'0'))=>{
    const body={key:KEY,date:DAY,op:{type,actor,payload,id}};
    const response=JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}}).text);return {body,response};
  };
  const state=()=>JSON.parse(ctx.doGet({parameter:{key:KEY,date:DAY,action:'state'}}).text);
  return {ctx,store,post,state,files,notifications,slackEvents,emails,logs,locked:()=>locked,shareStatus:n=>shareStatus=n,folder:()=>folder};
}
test('별도 Slack 봇 없이 사내 Google 이메일로 신규 알림 파일을 공유하고 Google API 공유 알림을 켠다',()=>{
  const s=server();s.store.LUNCH_DRIVE_MEMBER_EMAILS=JSON.stringify({juri:'juri@example.com',hyunsu:'hyunsu@example.com'});
  s.store.LUNCH_DRIVE_ALLOWED_DOMAIN='example.com';
  const op=s.post('groupInvite','seongjun',{invites:[{id:'pair_'+'1'.repeat(24),to:'juri'},{id:'pair_'+'2'.repeat(24),to:'hyunsu'}]});
  assert.equal(op.response.ok,true);assert.equal(s.notifications.length,2);assert.equal(s.files.length,2);
  assert.equal(s.slackEvents.length,0);
  assert.match(s.files[0].name,/조성준님이/);assert.match(s.files[0].body,/점심판에서/);
  assert.ok(s.files.every(f=>f.mime==='text/plain'&&!f.trashed));
  assert.ok(s.notifications.every(n=>n.url.includes('sendNotificationEmail=true')));
  assert.ok(s.notifications.every(n=>n.options.method==='post'));
  assert.deepEqual(s.notifications.map(n=>JSON.parse(n.options.payload).emailAddress),['juri@example.com','hyunsu@example.com']);
  assert.ok(s.notifications.every(n=>JSON.parse(n.options.payload).role==='reader'));
  assert.equal(s.folder().sharing,'PRIVATE');assert.equal(s.locked(),false);
  assert.ok(!JSON.stringify(s.state()).includes('juri@example.com'));
  const duplicate=JSON.parse(s.ctx.doPost({postData:{contents:JSON.stringify(op.body)}}).text);
  assert.equal(duplicate.duplicate,true);assert.equal(s.notifications.length,2);
});
test('모임 참여 요청·수락 알림도 올바른 사람에게만 공유되며 폴더를 재사용한다',()=>{
  const s=server();s.store.LUNCH_DRIVE_MEMBER_EMAILS=JSON.stringify({seongjun:'seongjun@example.com',juri:'juri@example.com'});
  s.post('availability','seongjun',{value:'separate'});
  s.post('joinRequest','juri',{id:'join_'+'c'.repeat(24),to:'seongjun'});
  assert.equal(s.notifications.length,1);assert.equal(JSON.parse(s.notifications[0].options.payload).emailAddress,'seongjun@example.com');
  s.post('joinApprove','seongjun',{requestId:'join_'+'c'.repeat(24)});
  assert.equal(s.notifications.length,2);assert.equal(JSON.parse(s.notifications[1].options.payload).emailAddress,'juri@example.com');
  assert.match(s.files[1].body,/승인/);assert.equal(s.store.LUNCH_DRIVE_NOTICE_FOLDER_ID,'private-folder');
});
test('파일 공유 실패에도 점심 기록은 보존되고 불필요한 파일은 휴지통으로 이동한다',()=>{
  const s=server();s.store.LUNCH_DRIVE_MEMBER_EMAILS=JSON.stringify({juri:'juri@example.com'});s.shareStatus(403);
  const r=s.post('pairInvite','seongjun',{id:'pair_'+'a'.repeat(24),to:'juri'});
  assert.equal(s.state().days[DAY].pairs.length,1);assert.equal(s.state().days[DAY].pairs[0].status,'pending');
  assert.equal(s.files[0].trashed,true);assert.equal(s.notifications.length,1);assert.ok(s.logs.some(l=>l.includes('failed')));
  assert.equal(s.locked(),false);assert.equal(s.state().receipt,null);
});
test('Apps Script 본인 계정에 파일 공유로 알림을 보낼 수 없다는 예외를 감지한다',()=>{
  const s=server('seongjun@example.com');s.store.LUNCH_DRIVE_MEMBER_EMAILS=JSON.stringify({seongjun:'seongjun@example.com'});
  s.post('availability','seongjun',{value:'separate'});
  s.post('joinRequest','juri',{id:'join_'+'b'.repeat(24),to:'seongjun'});
  assert.equal(s.notifications.length,0);assert.ok(s.logs.some(l=>l.includes('same-as-script-owner')));
  assert.equal(s.state().days[DAY].joinRequests.length,1);
});
test('허용 도메인에 해당하지 않는 주소에는 파일 공유하지 않으며 기존 Slack 설정은 유지한다',()=>{
  const s=server();s.store.LUNCH_DRIVE_MEMBER_EMAILS=JSON.stringify({juri:'juri@outside.com'});
  s.store.LUNCH_DRIVE_ALLOWED_DOMAIN='example.com';
  s.store.LUNCH_SLACK_BOT_TOKEN='xoxb-not-for-github-real-secret';
  s.store.LUNCH_SLACK_MEMBER_IDS=JSON.stringify({juri:'U2234567890'});
  s.post('pairInvite','seongjun',{id:'pair_'+'b'.repeat(24),to:'juri'});
  assert.equal(s.notifications.length,0);assert.equal(s.slackEvents.length,2);
  assert.equal(s.state().days[DAY].pairs.length,1);
});
test('편집기에서 명시적으로 시험 발송할 때 유효한 수신자가 필요하고 테스트 성공도 Slack 수신을 확정하지 않는다',()=>{
  const s=server();s.store.LUNCH_DRIVE_MEMBER_EMAILS=JSON.stringify({juri:'juri@example.com'});
  assert.throws(()=>s.ctx.testLunchDriveNotification(),/LUNCH_DRIVE_TEST_MEMBER/);
  s.store.LUNCH_DRIVE_TEST_MEMBER='juri';s.ctx.testLunchDriveNotification();
  assert.equal(s.notifications.length,1);assert.match(s.files[0].body,/테스트/);
  assert.ok(s.logs.some(l=>l.includes('실제 수신되는지는 수신자가 직접 확인')));
});

test('Slackbot 개인 이메일 전달 주소가 등록되면 Drive 공유·기존 Slack 봇보다 우선하며 본인 계정도 수신할 수 있다',()=>{
  const s=server('seongjun@example.com');
  s.store.LUNCH_SLACKBOT_FORWARD_EMAILS=JSON.stringify({seongjun:'seongjun-forward@slack.example',juri:'juri-forward@slack.example'});
  s.store.LUNCH_DRIVE_MEMBER_EMAILS=JSON.stringify({seongjun:'seongjun@example.com',juri:'juri@example.com'});
  s.store.LUNCH_SLACK_BOT_TOKEN='xoxb-test-token';
  s.store.LUNCH_SLACK_MEMBER_IDS=JSON.stringify({seongjun:'U1234567890',juri:'U2234567890'});
  s.post('pairInvite','seongjun',{id:'pair_'+'a'.repeat(24),to:'juri'});
  assert.equal(s.emails.length,1);assert.match(s.emails[0].subject,/초대/);assert.match(s.emails[0].body,/2026-10-20/);
  assert.equal(s.notifications.length,0);assert.equal(s.slackEvents.length,0);
  s.post('pairAccept','juri',{pairId:'pair_'+'a'.repeat(24)});
  assert.equal(s.emails.length,2);assert.equal(s.emails[1].to,'seongjun-forward@slack.example');
  assert.equal(s.notifications.length,0);assert.equal(s.slackEvents.length,0);
});
test('Slackbot 메일 API가 오류를 내면 Google Drive 알림으로 대체하고 식사 데이터는 유지한다',()=>{
  const s=server();s.store.LUNCH_SLACKBOT_FORWARD_EMAILS=JSON.stringify({juri:'juri-forward@slack.example'});
  s.store.LUNCH_DRIVE_MEMBER_EMAILS=JSON.stringify({juri:'juri@example.com'});
  s.ctx.MailApp.sendEmail=()=>{throw Error('mail quota exceeded');};
  s.post('pairInvite','seongjun',{id:'pair_'+'c'.repeat(24),to:'juri'});
  assert.equal(s.notifications.length,1);assert.equal(s.state().days[DAY].pairs.length,1);
  assert.ok(s.logs.some(l=>l.includes('mail quota exceeded')));assert.equal(s.locked(),false);
});
test('Slackbot 전송 테스트는 명시적으로 대상자가 지정된 경우에만 발송한다',()=>{
  const s=server();s.store.LUNCH_SLACKBOT_FORWARD_EMAILS=JSON.stringify({seongjun:'mine@slack.example'});
  assert.throws(()=>s.ctx.testLunchSlackbotForwarding(),/LUNCH_SLACKBOT_TEST_MEMBER/);
  s.store.LUNCH_SLACKBOT_TEST_MEMBER='seongjun';s.ctx.testLunchSlackbotForwarding();
  assert.equal(s.emails.length,1);assert.match(s.emails[0].body,/알림 테스트/);
  assert.ok(s.logs.some(l=>l.includes('Slack 메시지 수신은 직원이 직접 확인')));
});
