const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
const assert=require('node:assert/strict');
(async()=>{
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lumina-ui-'));
const server=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout')),10000);server.stdout.on('data',data=>{const m=String(data).match(/port (\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});server.on('error',reject);});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
await fs.mkdir(path.join(root,'.runtime/screenshots'),{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base);await page.getByRole('heading',{name:'지금, 주목할 영화'}).waitFor();
await page.screenshot({path:path.join(root,'.runtime/screenshots/desktop.png'),fullPage:true});
assert.equal(await page.locator('.poster-button img').evaluateAll(xs=>xs.every(x=>x.complete&&x.naturalWidth>0)),true);
await page.getByRole('button',{name:'로그인',exact:true}).click();await page.locator('#switch-auth').click();
await page.locator('[name=name]').fill('브라우저 감독');await page.locator('[name=email]').fill('browser@example.com');await page.locator('[name=password]').fill('browserpass123');await page.locator('#auth-form button[type=submit]').click();await page.locator('#modal').waitFor({state:'hidden'});
await page.locator('#submit-button').click();await page.locator('[name=title]').fill('브라우저로 출품한 영화');await page.locator('textarea[name=description]').fill('실제 브라우저에서 MP4 업로드와 출품 동작을 확인하는 영화입니다.');await page.locator('[name=tools]').fill('Blender, Runway');await page.locator('textarea[name=process]').fill('장면 기획과 편집 과정을 공유합니다.');await page.locator('[name=file]').setInputFiles(path.join(root,'public/assets/sample.mp4'));await page.locator('[name=rights]').check();await page.locator('#submit-form button[type=submit]').click();await page.getByRole('heading',{name:'브라우저로 출품한 영화',exact:true}).waitFor();await page.locator('#play-film').click();
const video=page.locator('video');await video.waitFor();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);await page.waitForFunction(()=>document.querySelector('video')?.currentTime>0);await page.locator('#close-modal').click();
await page.locator('[data-bookmark]').first().click();await page.locator('a[href="#festival"]').first().click();await page.locator('[data-vote]').first().click();await page.waitForFunction(()=>document.querySelector('[data-vote]')?.textContent.includes('투표 완료'));
await page.locator('a[href="#cinema"]').first().click();await page.locator('#film-search').fill('도시의 잔상');assert.equal(await page.locator('#catalog-grid .film-card').count(),1);await page.locator('[data-detail]').first().click();await page.locator('#play-film').click();await page.locator('[name=consent]').check();await page.locator('#checkout-form button[type=submit]').click();await page.locator('#watch-now').click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>0);await page.locator('#close-modal').click();
await page.locator('#account-button').click();await page.getByRole('heading',{name:'브라우저 감독님의 상영관'}).waitFor();await page.locator('[data-tab=orders]').click();await page.locator('.order-list').waitFor();assert.match(await page.locator('.order-list').innerText(),/3,900원/);
await page.locator('[data-profile]').click();await page.locator('[name=bio]').fill('브라우저로 수정한 제작자 소개');await page.locator('#profile-form button[type=submit]').click();await page.locator('#modal').waitFor({state:'hidden'});assert.match(await page.locator('.page-head').innerText(),/브라우저로 수정한/);
await page.locator('a[href="#guides"]').first().click();await page.getByRole('heading',{name:'제작 자료실',exact:true}).waitFor();assert.equal(await page.locator('.guide-card').count(),9);await page.locator('#guide-search').fill('캐릭터');assert.equal(await page.locator('.guide-card').count(),1);await page.locator('.guide-card').click();await page.locator('#modal-content').getByRole('heading',{name:'캐릭터의 일관성 지키기'}).waitFor();await page.locator('#close-modal').click();
await page.locator('a[href="#creators"]').first().click();await page.locator('.creator-card').filter({hasText:'브라우저 감독'}).click();assert.match(await page.locator('#modal-content').innerText(),/브라우저로 수정한/);await page.locator('#close-modal').click();
await page.locator('a[href="#home"]').first().click();await page.setViewportSize({width:390,height:844});await page.getByRole('heading',{name:'지금, 주목할 영화'}).waitFor();await page.screenshot({path:path.join(root,'.runtime/screenshots/mobile.png'),fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile must not overflow horizontally');assert.deepEqual(errors,[]);console.log('UI PASS: desktop/mobile, images, signup, MP4 upload, submission, real playback, bookmarks, voting, search, demo ticket, order history, profile, creator pages and 9 searchable guides. No JS errors.');
}finally{await browser.close();server.kill();await new Promise(r=>server.once('exit',r));await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
