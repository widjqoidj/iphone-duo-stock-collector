import{readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync}from'node:fs';
import{execFileSync}from'node:child_process';
import{randomUUID,createHash}from'node:crypto';
import webpush from'web-push';
import{fetchPickup}from'./apple.mjs';
import{applyObservations,currentAlert}from'./stock.mjs';
import{STORES,VARIANTS,watchKey,emptySnapshot,POLL_MS}from'./config.mjs';
const github=process.env.GITHUB_ACTIONS==='true';
const config=JSON.parse(readFileSync('site-config.json','utf8'));
let state=existsSync('state.json')?JSON.parse(readFileSync('state.json','utf8')):{snapshot:emptySnapshot(),history:[],pending:[],lastPush:null};
const now=Date.now();
let observations;
try{observations=await fetchPickup();}catch(error){const message=error instanceof Error?error.message:'Source request failed';observations=STORES.flatMap(s=>VARIANTS.map(v=>({key:watchKey(s.id,v.id),status:'unknown',quote:'Check failed',pickup:'',error:message})));}
const{snapshot,alerts}=applyObservations(state.snapshot,observations,now);
state.snapshot=snapshot;state.history=[{at:now,verified:observations.filter(o=>o.status!=='unknown').length,error:snapshot.lastError},...state.history].slice(0,20);
for(const alert of alerts)state.pending.push({id:randomUUID(),alert,at:now,expiresAt:now+(alert.type==='stock'?POLL_MS:3600000),accepted:[]});
if(process.env.SEND_TEST==='true')state.pending.push({id:randomUUID(),alert:{type:'test',title:'Duo Watch is connected',body:'Test notification only. Your iPhone can receive pickup alerts from the free cloud tracker.',url:config.siteUrl,items:[]},at:now,expiresAt:now+POLL_MS,accepted:[]});
function persist(message){
  writeFileSync('state.json',JSON.stringify(state,null,2)+'\n');
  if(github){execFileSync('git',['config','user.name','github-actions[bot]']);execFileSync('git',['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);execFileSync('git',['add','state.json']);try{execFileSync('git',['diff','--cached','--quiet']);}catch{execFileSync('git',['commit','-m',message],{stdio:'ignore'});execFileSync('git',['push','origin','HEAD:main'],{stdio:'ignore'});}}
}
persist('Record pickup check and pending alerts');
let subscriptions=[];try{const value=JSON.parse(process.env.PUSH_SUBSCRIPTIONS||'[]');subscriptions=Array.isArray(value)?value:[value];}catch{throw new Error('PUSH_SUBSCRIPTIONS is not valid JSON.');}
let keys=null;try{keys=JSON.parse(process.env.VAPID_KEYS||'null');}catch{throw new Error('VAPID_KEYS is not valid JSON.');}
let accepted=0,failed=0;
if(keys&&keys.publicKey!==config.publicKey)throw new Error('VAPID public key differs from the installed app. Preserve the original keys.');
if(keys&&subscriptions.length&&!state.lastPush?.configured){
  const baseline=applyObservations(emptySnapshot(),observations,now).alerts.find(a=>a.type==='stock');
  if(baseline){state.pending=state.pending.filter(p=>p.alert.type!=='stock');state.pending.push({id:randomUUID(),alert:{...baseline,items:baseline.items.map(i=>({...i,version:state.snapshot.watches[i.key].version}))},at:now,expiresAt:now+POLL_MS,accepted:[]});persist('Queue current availability for newly connected iPhone');}
}
for(const sub of subscriptions){
  const u=new URL(sub.endpoint);if(u.protocol!=='https:'||u.port||u.username||u.password||!(u.hostname.endsWith('.push.apple.com')||u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'))throw new Error('Unsupported push endpoint.');
  if(!sub.keys?.p256dh||!sub.keys?.auth)throw new Error('Incomplete push subscription.');
}
for(const pending of state.pending){
  const alert=currentAlert(pending.alert,state.snapshot);if(!alert||pending.expiresAt<=Date.now())continue;
  if(!keys||!subscriptions.length)continue;
  for(const subscription of subscriptions){
    const id=createHash('sha256').update(subscription.endpoint).digest('hex').slice(0,24);if(pending.accepted.includes(id))continue;
    for(let attempt=0;attempt<3;attempt++){
      const ttl=Math.floor((pending.expiresAt-Date.now())/1000);if(ttl<=0)break;
      try{
        await webpush.sendNotification(subscription,JSON.stringify({title:alert.title,body:alert.body,url:alert.type==='stock'?alert.url:config.siteUrl,tag:pending.id}),{TTL:ttl,urgency:alert.type==='stock'?'high':'normal',timeout:5000,vapidDetails:{subject:config.siteUrl,publicKey:keys.publicKey,privateKey:keys.privateKey}});
        pending.accepted.push(id);accepted++;break;
      }catch(error){const status=Number(error.statusCode??0);if(attempt===2||[400,401,403,404,410].includes(status)){failed++;break;}await new Promise(resolve=>setTimeout(resolve,(attempt+1)*1000));}
    }
  }
}
state.pending=state.pending.filter(p=>p.expiresAt>Date.now()&&(!subscriptions.length||p.accepted.length<subscriptions.length)).slice(-24);
state.lastPush={at:Date.now(),accepted,failed,configured:!!keys&&subscriptions.length>0};
persist('Record notification delivery results');
mkdirSync('public',{recursive:true});
for(const file of['index.html','app.js','styles.css','sw.js','manifest.webmanifest','icon-192.png','icon-512.png','site-config.json'])copyFileSync(file,`public/${file}`);
writeFileSync('public/status.json',JSON.stringify({snapshot:state.snapshot,history:state.history,lastPush:state.lastPush,generatedAt:Date.now()},null,2));
console.log(JSON.stringify({verifiedResults:observations.filter(o=>o.status!=='unknown').length,sourceError:snapshot.lastError,pushAccepted:accepted,pushFailed:failed,pushConfigured:state.lastPush.configured}));
if(snapshot.lastError)process.exitCode=1;
