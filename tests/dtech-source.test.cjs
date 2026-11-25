const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../dtech-source.js');
const L=require('../lunchtime-source.js');
const DIMAGE='https://k.kakaocdn.net/dn/dtech/menu/daily_xl.jpg';
function payload(source,image){return JSON.stringify({
 profile_id:source.PROFILE_ID, profile:{profile_id:source.PROFILE_ID,
 permalink:source.SOURCE_URL,profile_image:{type:'image',mimetype:'image/jpeg',xlarge_url:image}}});}
test('디테크 채널을 정확한 고유 ID로만 조회하고 런치타임과 다르게 검증한다',()=>{
 assert.equal(D.PROFILE_ID,'_nkwxeG');
 assert.equal(D.SOURCE_URL,'https://pf.kakao.com/_nkwxeG');
 assert.equal(D.HOME_ENDPOINT,'https://pf.kakao.com/rocket-web/web/profiles/_nkwxeG/home');
 assert.notEqual(D.PROFILE_ID,L.PROFILE_ID);
 assert.deepEqual(D.normalizeProfile(payload(D,DIMAGE)),{ok:true,sourceUrl:D.SOURCE_URL,imageUrl:DIMAGE});
 assert.throws(()=>D.normalizeProfile(payload(L,DIMAGE)),/다른 채널|확인/);
});
test('디테크 채널은 외부 이미지와 교차 채널 우회를 차단한다',()=>{
 assert.equal(D.validImageURL(DIMAGE),true);
 for(const bad of ['https://evil.example/dn/dtech/menu/daily_xl.jpg',
                   'https://k.kakaocdn.net.evil.example/dn/dtech/menu/daily_xl.jpg',
                   'http://k.kakaocdn.net/dn/dtech/menu/daily_xl.jpg',
                   'https://k.kakaocdn.net/dn/dtech/menu/daily.svg'])assert.equal(D.validImageURL(bad),false);
 assert.throws(()=>D.normalizeProfile(payload(D,'https://evil.example/x.jpg')));
});
