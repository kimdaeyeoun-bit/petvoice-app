import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir=await mkdtemp(path.join(tmpdir(),'lumina-preview-build-'));
const child=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
try{
const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Preview build server timeout')),10000);child.stdout.on('data',b=>{const m=String(b).match(/port (\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});child.on('error',reject);});
const films=(await (await fetch(base+'/api/films')).json()).films;
const asset=async(name,type)=>`data:${type};base64,${(await readFile(path.join(root,'public',name))).toString('base64')}`;
const video=await asset('assets/sample.mp4','video/mp4');
for(const f of films){f.video=video;f.poster=await asset(f.poster.slice(1),'image/svg+xml');}
let css=await readFile(path.join(root,'public/style.css'),'utf8');for(const name of ['poster-2.svg','mark.svg'])css=css.replaceAll('/assets/'+name,await asset('assets/'+name,'image/svg+xml'));
css+='\n'+await readFile(path.join(root,'public/premium.css'),'utf8');css=css.replaceAll('/assets/poster-2.svg',await asset('assets/poster-2.svg','image/svg+xml'));
let html=await readFile(path.join(root,'public/index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="/premium.css">','');
html=html.replace('<link rel="stylesheet" href="/style.css">',`<style>${css}</style>`).replace('<script src="/app.js" defer></script>','').replace('<script src="/sound.js" defer></script>','').replace('<script src="/studio.js" defer></script>','').replace('<script src="/business.js" defer></script>','');
html=html.replace('<script src="/install.js" defer></script>','').replace(/<link rel="(?:manifest|icon|apple-touch-icon)"[^>]*>/g,'').replace(/<div class="install-panel">[\s\S]*?<\/div>/,'');
html=html.replace('<body>','<body><aside class="preview-notice">다운로드 미리보기 · 데이터는 이 브라우저에만 저장됩니다 · 실제 개인정보·비밀번호를 입력하지 마세요 · 결제는 데모입니다</aside>');
html=html.replace('개발 데모 · 실제 결제 및 정산 없음','다운로드 미리보기 · 실제 결제 및 정산 없음');
const business=await readFile(path.join(root,'public/business.js'),'utf8');
const engine=await readFile(path.join(root,'business-core.mjs'),'utf8');
const previewBusiness=await readFile(path.join(root,'scripts/preview-business.js'),'utf8');
const studio=await readFile(path.join(root,'public/studio.js'),'utf8');
const sound=await readFile(path.join(root,'public/sound.js'),'utf8');
const js=await readFile(path.join(root,'public/app.js'),'utf8'),adapter=await readFile(path.join(root,'scripts/preview-adapter.js'),'utf8');
html=html.replace('</body>',`<style>.preview-notice{background:#d1ed83;color:#192219;padding:12px 20px;text-align:center;font-size:11px;line-height:1.8}</style><script>window.LUMINA_PREVIEW_FILMS=${JSON.stringify(films)};</script><script>${adapter.replaceAll('</script','<\\/script')}</script><script>window.LuminaBusinessEngine=(()=>{${engine.replace('export function','function')};return {businessAction};})();</script><script>${previewBusiness.replaceAll('</script','<\\/script')}</script><script>${business.replaceAll('</script','<\\/script')}</script><script>${studio.replaceAll('</script','<\\/script')}</script><script>${js.replaceAll('</script','<\\/script')}</script><script>${sound.replaceAll('</script','<\\/script')}</script></body>`);
// Store the sample once, rather than six embedded copies.
const single=html.replaceAll(video,'__LUMINA_SAMPLE__').replace('window.LUMINA_PREVIEW_FILMS=',`window.LUMINA_PREVIEW_VIDEO=${JSON.stringify(video)};window.LUMINA_PREVIEW_FILMS=`).replace(';</script><script>',`;window.LUMINA_PREVIEW_FILMS.forEach(f=>f.video=window.LUMINA_PREVIEW_VIDEO);</script><script>`);
await mkdir(path.join(root,'preview'),{recursive:true});await writeFile(path.join(root,'preview/LUMINA-preview.html'),single);console.log('Built preview/LUMINA-preview.html — one downloadable HTML file.');
}finally{child.kill();if(child.exitCode===null)await new Promise(r=>child.once('exit',r));await rm(dir,{recursive:true,force:true});}
