import {communityAction} from './community-core.mjs';
export function createCommunity({db,json,body,admin}){
db.exec("CREATE TABLE IF NOT EXISTS community_state(id INTEGER PRIMARY KEY,content TEXT NOT NULL);INSERT OR IGNORE INTO community_state VALUES(1,'{}');");
return async(req,res,url,u)=>{if(!url.pathname.startsWith('/api/community/'))return false;const b=req.method==='POST'?await body(req):{};const state=JSON.parse(db.prepare('SELECT content FROM community_state WHERE id=1').get().content);const result=communityAction({path:url.pathname,query:url.searchParams,method:req.method,body:b,state,u,admin:admin(u),users:db.prepare('SELECT id,name,bio FROM users').all(),films:db.prepare('SELECT * FROM films').all()});db.prepare('UPDATE community_state SET content=? WHERE id=1').run(JSON.stringify(state));json(res,200,result);return true;};
}
