import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('production HTTP persistence, administrator isolation, sales confirmation and payout reservation',async()=>{
const dir=await mkdtemp(path.join(tmpdir(),'lumina-business-'));let child,base;
async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_USER_IDS:'2'},stdio:['ignore','pipe','pipe']});base=await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{const m=String(d).match(/port (\d+)/);if(m)resolve('http://127.0.0.1:'+m[1]);});child.on('error',reject);child.on('exit',code=>reject(Error('Server exited '+code)));});}
async function stop(){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}
async function req(p,b,cookie){const r=await fetch(base+p,{method:b?'POST':'GET',headers:{...(b?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{})},body:b?JSON.stringify(b):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
try{await start();const writer=(await req('/api/auth/register',{name:'Writer',email:'writer@business.test',password:'testpassword123'})).cookie,admin=(await req('/api/auth/register',{name:'Manager',email:'admin@business.test',password:'testpassword123'})).cookie,viewer=(await req('/api/auth/register',{name:'Viewer',email:'viewer@business.test',password:'testpassword123'})).cookie;
assert.equal((await req('/api/business/config',null,writer)).body.admin,false);assert.equal((await req('/api/business/config',null,admin)).body.admin,true);assert.equal((await req('/api/business/admin',null,viewer)).status,403);
const project=(await req('/api/studio/projects',{title:'Managed film',source:'Private original text',intent:'Hope',style:'Cinema',mood:'calm',scenes:[{text:'Morning light',visual:'Forest',seconds:4}]},writer)).body.project;
const p=(await req('/api/business/productions',{projectId:project.id,rights:true,managementConsent:true},writer)).body.production,url='/api/business/productions/'+p.id;
for(const [action,extra,cookie] of [['select',{},admin],['trailer',{video:'https://example.com/trailer.mp4',seconds:8},admin],['approve_trailer',{approved:true},writer],['quote',{amount:30000,price:5000},admin],['pay',{demoConsent:true,quoteConsent:true},writer],['start',{},admin],['deliver',{video:'https://example.com/full.mp4',seconds:60},admin]])assert.equal((await req(url,{action,...extra},cookie)).status,200,action);
assert.equal((await req('/api/films')).body.films.length,6);assert.equal((await req(url,{action:'approve_full',approved:true,rights:true},admin)).status,403);assert.equal((await req(url,{action:'approve_full',approved:true,rights:true},writer)).status,200);
const films=(await req('/api/films')).body.films,f=films.find(f=>f.title==='Managed film');assert.equal(f.price,5000);assert.equal(f.creator_id,1);assert.equal(JSON.stringify(f).includes('Private original text'),false);
const ticket=await req('/api/films/'+f.id+'/checkout',{type:'ticket',demoConsent:true},viewer);assert.equal(ticket.body.amount,5000);
const support=await req('/api/films/'+f.id+'/checkout',{type:'support',amount:100000,demoConsent:true},viewer);assert.equal((await req('/api/business/home',null,writer)).body.wallet.available,0);assert.equal((await req('/api/business/admin/orders/'+support.body.orderId,{action:'confirm'},admin)).status,200);
const payout=(await req('/api/business/payouts',{amount:50000,demoConsent:true},writer)).body.payout;assert.equal((await req('/api/business/home',null,writer)).body.wallet.available,30000);assert.equal((await req('/api/business/admin/orders/'+support.body.orderId,{action:'refund'},admin)).status,409);
await stop();await start();assert.equal((await req('/api/business/home',null,writer)).body.wallet.reserved,50000);assert.equal((await req('/api/films')).body.films.length,7);assert.equal((await req('/api/business/admin/payouts/'+payout.id,{action:'demo_paid',demoConsent:true},admin)).status,200);assert.equal((await req('/api/business/home',null,writer)).body.wallet.paid,50000);
}finally{if(child&&child.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
