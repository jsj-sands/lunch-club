const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../ocr-choice.js');
const day = '2026-11-25', now = Date.parse('2026-11-25T05:15:00Z');
const selected='https://www.threads.com/@gangnambab/post/LunchMenuA';
const posts={ok:false,version:'20261125-gangnam-review',date:day,reason:'unverified_menu',
  alternatives:[{postUrl:selected,kind:'video',publishedAt:'2026-11-25T01:05:00.000Z',
    videoUrl:'https://video.cdninstagram.com/clip/menu.mp4',posterUrl:'',promotion:false}]};
const verdict={version:1,date:day,status:'verified',checked_at:'2026-11-25T02:00:00Z',
  selected_post_url:selected,evidence:{menu_frames:3,sampled_frames:6,score:29}};
test('OCR has repeated menu-frame evidence, post URL matches, selects exactly that team candidate',()=>{
 const choice=O.pick(posts,verdict,day,now);
 assert.equal(choice?.ok,true);assert.equal(choice?.confidence,'ocr');
 assert.equal(choice?.postUrl,selected);assert.equal(choice?.ocrFrames,3);
});
test('manual or caption verified result is never replaced by automatic OCR',()=>{
 assert.equal(O.pick({...posts,ok:true,confidence:'manual'},verdict,day,now),null);
});
test('stale, future, missing or low-confidence OCR cannot select a clip',()=>{
 assert.equal(O.pick(posts,{...verdict,date:'2026-11-24'},day,now),null);
 assert.equal(O.pick(posts,{...verdict,checked_at:'2026-11-22T00:00:00Z'},day,now),null);
 assert.equal(O.pick(posts,{...verdict,evidence:{menu_frames:1,sampled_frames:6,score:30}},day,now),null);
 assert.equal(O.pick(posts,{...verdict,status:'unavailable'},day,now),null);
 assert.equal(O.pick(posts,{...verdict,selected_post_url:'https://evil.example/phish'},day,now),null);
});
test('OCR post must match one approved non-promotion candidate',()=>{
 assert.equal(O.pick(posts,{...verdict,selected_post_url:'https://www.threads.com/@gangnambab/post/Other'},day,now),null);
 assert.equal(O.pick({...posts,alternatives:[{...posts.alternatives[0],promotion:true}]},verdict,day,now),null);
});
