/* ============================================================
   MAKNAZUL 'IRFAN ACADEMY — Admin Login + Cloud Sync (Google Sheets)
   + SMS/WhatsApp/Email Alerts via Google Apps Script backend
   (v3 add-on, plugs into index.html)
   ============================================================ */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const LS_ADMIN='mia_admin_v1', LS_SETTINGS='mia_settings_v1', LS_ALERTS='mia_alerts_v1', LS_QUEUE='mia_sync_queue_v1', LS_SESSION='mia_admin_session';
const SHEET_URL='https://docs.google.com/spreadsheets/d/1a1FC3y98DgSqS4hwrxY-zvIjAhaOE-gDrz49f2qbOpE/edit';
const SHEET_ID='1a1FC3y98DgSqS4hwrxY-zvIjAhaOE-gDrz49f2qbOpE';
/* Live Apps Script backend for the Academy. Public by design (Anyone access);
   baked in so every device the gate uses is connected with zero setup. */
const DEFAULT_WEBHOOK='https://script.google.com/macros/s/AKfycbyWazVEm3M58y5CRhczhKiIRLdPGRUr7Rr4hxMA0Go-7gIQoaiaJVXl88Ile85s6bxWwQ/exec';

/* ---------- helpers ---------- */
function loadJSON(k,def){ try{ const v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?def:v; }catch(e){ return def; } }
function saveJSON(k,v){ localStorage.setItem(k,JSON.stringify(v)); }
function loadUsers(){ return loadJSON('mia_users_v1',[]); }
function loadAtt(){ return loadJSON('mia_attendance_v1',[]); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(msg,err){ const box=$('toasts'); if(!box) return; const t=document.createElement('div'); t.className='toast'+(err?' err':''); t.textContent=msg; box.appendChild(t); setTimeout(()=>t.remove(),4500); }
function hashPw(s){ let h=0; for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i);h|=0;} return 'h'+Math.abs(h).toString(36); }
function fmtTime(iso){ if(!iso) return '—'; return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
function fmtDate(iso){ if(!iso) return '—'; return new Date(iso).toLocaleDateString([], {weekday:'short',day:'2-digit',month:'short',year:'numeric'}); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function durationStr(a,b){ if(!a||!b) return '—'; let s=Math.max(0,Math.round((new Date(b)-new Date(a))/1000)); const h=Math.floor(s/3600),m=Math.floor(s%3600/60); return (h?h+'h ':'')+m+'m'; }

/* ---------- settings ---------- */
function defaultSettings(){
  return {
    schoolStart:'07:30', lateAfter:'07:45',
    sheetsWebhook:DEFAULT_WEBHOOK, sheetsEnabled:true,
    /* apps_script = server-side sending (recommended, keys never in browser) */
    smsProvider:'apps_script', // apps_script | manual | twilio | termii | whatsapp | webhook
    alertChannel:'auto',       // auto | sms | whatsapp | email
    twilioSid:'', twilioToken:'', twilioFrom:'', termiiKey:'', termiiFrom:'', waToken:'', waPhoneId:'', webhookUrl:'',
    alertOnIn:true, alertOnOut:true, alertOnLate:true, alertOnAbsent:true, alertAdminSummary:true,
    adminPhone:'08084929862', adminEmail:'maknazulirfanacademy@gmail.com', parentAlerts:true, emailStudents:true,
    tplIn:'Assalamu Alaikum {name}! You clocked IN at {time} on {date} at MAKNAZUL \'IRFAN ACADEMY. Status: {status}.',
    tplOut:'Assalamu Alaikum {name}! You clocked OUT at {time} on {date}. Jazakumullahu khairan.',
    tplLate:'Assalamu Alaikum {name}, you arrived LATE at {time} on {date} (school starts {start}). Please try to come earlier tomorrow.',
    tplAbsent:'Assalamu Alaikum, {name} did not clock in today ({date}) at MAKNAZUL \'IRFAN ACADEMY. Please check.'
  };
}
function getSettings(){
  const stored=loadJSON(LS_SETTINGS,{});
  const s=Object.assign(defaultSettings(), stored);
  // adopt the live endpoint on devices that saved a blank or retired URL
  if(!stored.sheetsWebhook || String(stored.sheetsWebhook).indexOf('AKfycbzG3Uz')>-1)
    s.sheetsWebhook=DEFAULT_WEBHOOK;
  if(stored.sheetsEnabled===undefined) s.sheetsEnabled=true;
  return s;
}
function saveSettings(s){ saveJSON(LS_SETTINGS,s); }

/* ---------- admin auth ---------- */
function getAdmin(){
  let a=loadJSON(LS_ADMIN,null);
  if(!a){ a={email:'maknazulirfanacademy@gmail.com', pwHash:hashPw('admin123'), name:'Academy Admin', mustChange:true, createdAt:new Date().toISOString()}; saveJSON(LS_ADMIN,a); }
  return a;
}
function isAdmin(){ try{ const s=JSON.parse(localStorage.getItem(LS_SESSION)||'null'); return !!(s && s.email && (Date.now()-s.at)<8*60*60*1000); }catch(e){ return false; } }
function setSession(email){ localStorage.setItem(LS_SESSION,JSON.stringify({email,at:Date.now()})); applyAdminUI(); }
function clearSession(){ localStorage.removeItem(LS_SESSION); applyAdminUI(); }
function applyAdminUI(){
  const admin=isAdmin();
  document.body.classList.toggle('is-admin',admin);
  const btn=$('btnAdminLogin');
  if(btn){ btn.textContent=admin?'🔓 Admin Panel (Logged In)':'🔐 Admin Login'; btn.classList.toggle('logged',admin); }
  renderAdminOverview(); renderAdminUsers(); renderAdminAlerts(); renderSettingsForm(); updateSyncPill();
  /* re-render the public tabs so admin-only edit buttons show/hide */
  if(typeof renderAll==='function'){ try{ renderAll(); }catch(e){} }
}
window.openAdminLogin=function(){
  if(isAdmin()){ switchTab('admin'); return; }
  $('adminLoginModal').classList.add('show');
  setTimeout(()=>{ const e=$('adminEmail'); if(e) e.focus(); },100);
};
window.closeAdminLogin=function(){ $('adminLoginModal').classList.remove('show'); };
window.doAdminLogin=function(){
  const email=$('adminEmail').value.trim().toLowerCase(), pw=$('adminPw').value;
  const a=getAdmin();
  if(email===a.email && hashPw(pw)===a.pwHash){
    setSession(email); closeAdminLogin(); toast('Welcome, Admin! You are logged in.');
    if(a.mustChange){ toast('⚠️ Security: please change the default admin password in Admin → Settings.'); }
    switchTab('admin');
  } else { toast('Invalid admin email or password.',true); }
};
window.doAdminLogout=function(){ clearSession(); toast('Admin logged out.'); switchTab('register'); };

/* ---------- tabs ---------- */
function switchTab(name){
  ['register','log','people','admin'].forEach(n=>{
    const b=$('tab-'+n), p=$('panel-'+n);
    if(b) b.classList.toggle('active',n===name);
    if(p) p.classList.toggle('active',n===name);
  });
  if(name==='admin'){ renderAdminOverview(); renderAdminUsers(); renderAdminAlerts(); renderSettingsForm(); }
}
window.switchTab=switchTab;

/* Backend capabilities, refreshed from the live endpoint. When SMS is not
   available (no approved sender ID), phone recipients are skipped so the
   Alert Log stays clean instead of filling with failures. */
let BACKEND={smsReady:false,emailEnabled:true,checked:false};
async function checkBackend(){
  const s=getSettings();
  if(!s.sheetsWebhook) return BACKEND;
  try{
    const res=await fetch(s.sheetsWebhook);
    const d=await readBackendJSON(res);
    BACKEND={smsReady:!!d.smsReady,emailEnabled:d.emailEnabled!==false,checked:true,provider:d.provider||''};
  }catch(e){ BACKEND.checked=true; }
  renderSmsBadge();
  return BACKEND;
}
function renderSmsBadge(){
  const el=$('smsBadge'); if(!el) return;
  el.className='alert-status '+(BACKEND.smsReady?'sent':'manual');
  el.textContent=BACKEND.smsReady?'SMS: ON':'SMS: OFF (email + WhatsApp)';
}

/* ---------- cloud sync (Google Sheets via Apps Script webhook) ---------- */
function updateSyncPill(){
  const pill=$('syncPill'); if(!pill) return;
  const s=getSettings(); const q=loadJSON(LS_QUEUE,[]);
  pill.className='sync-pill '+(q.length?'pending':(s.sheetsEnabled&&s.sheetsWebhook?'synced':''));
  pill.innerHTML='<span class="dot"></span>'+(q.length?('☁️ '+q.length+' pending'):(s.sheetsEnabled&&s.sheetsWebhook?'☁️ Sheets Synced':'☁️ Local Only'));
}
/* Apps Script returns an HTML error page when the deployed code throws.
   Turn that into a message a human can act on. */
async function readBackendJSON(res){
  const text=await res.text();
  try{ return JSON.parse(text); }
  catch(e){
    const m=text.match(/<div style="text-align:center[^>]*>([^<]{5,200})<\/div>/);
    const err=m?m[1]:'';
    if(err.indexOf('google is not defined')>-1 || err.indexOf('ReferenceError')>-1)
      throw new Error('the deployed script is still running old sample code - redeploy a NEW VERSION');
    if(err.indexOf('Script function not found')>-1)
      throw new Error('doGet/doPost missing - check the code was pasted and saved');
    if(err) throw new Error(err.replace(/&quot;/g,'"').slice(0,160));
    throw new Error('backend returned a web page, not JSON - check the deployment');
  }
}

async function pushToSheets(type,row){
  const s=getSettings();
  if(!s.sheetsEnabled||!s.sheetsWebhook) return {skipped:true};
  try{
    const res=await fetch(s.sheetsWebhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,row})});
    const data=await readBackendJSON(res);
    if(data.ok){ updateSyncPill(); return {ok:true}; }
    throw new Error(data.error||'Sheets webhook error');
  }catch(e){
    const q=loadJSON(LS_QUEUE,[]); q.push({type,row,at:new Date().toISOString()}); saveJSON(LS_QUEUE,q); updateSyncPill();
    return {queued:true,error:e.message};
  }
}
async function flushQueue(){
  const q=loadJSON(LS_QUEUE,[]); if(!q.length) return;
  const s=getSettings(); if(!s.sheetsEnabled||!s.sheetsWebhook) return;
  const remaining=[];
  for(const item of q){
    try{ const res=await fetch(s.sheetsWebhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)}); const d=await res.json().catch(()=>({})); if(!d.ok) remaining.push(item); }
    catch(e){ remaining.push(item); }
  }
  saveJSON(LS_QUEUE,remaining); updateSyncPill();
  if(!remaining.length) toast('☁️ All pending records synced to Google Sheets.');
}
/* One-click: paste the /exec URL, then this saves it, enables sync,
   verifies the backend, pushes everything and reports the result. */
window.connectBackend=async function(){
  const el=$('setSheetsWebhook');
  const url=(el?el.value:'').trim();
  if(!url){ toast('Paste your Apps Script Web App URL first (it ends in /exec).',true); return; }
  if(url.indexOf('/exec')===-1){ toast('That does not look like a Web App URL - it should end in /exec.',true); return; }
  const s=getSettings(); s.sheetsWebhook=url; s.sheetsEnabled=true; saveSettings(s);
  const cb=$('setSheetsEnabled'); if(cb) cb.checked=true;
  updateSyncPill();
  toast('Connecting to your Apps Script backend...');
  try{
    const res=await fetch(url);
    const d=await readBackendJSON(res);
    if(!d || !d.ok){ toast('Backend responded but not as expected: '+JSON.stringify(d).slice(0,120),true); return; }
    BACKEND={smsReady:!!d.smsReady,emailEnabled:d.emailEnabled!==false,checked:true,provider:d.provider||''};
    renderSmsBadge();
    toast('✅ Connected — Email alerts: '+(d.emailEnabled?'ON':'OFF')+' | SMS: '+(d.smsReady?'ON':'off (email + WhatsApp)'));
    await syncNow();
  }catch(e){
    toast('Could not reach the backend: '+e.message+' — check "Who has access: Anyone".',true);
  }
};

window.syncNow=async function(){
  const s=getSettings();
  if(!s.sheetsWebhook){ toast('Paste your Apps Script Web App URL in Cloud Sync first.',true); return; }
  toast('Syncing to Google Sheets…');
  const users=loadUsers(), att=loadAtt();
  const userRows=users.map(u=>[u.id,u.name,u.role,u.classDept||'',u.gender||'',u.phone||'',u.email||'',u.createdAt||'']);
  const attRows=att.map(r=>[r.date,r.name||'',r.userId,r.role||'',r.clockIn||'',r.clockOut||'',durationStr(r.clockIn,r.clockOut),r.status,r.method]);
  try{
    const res=await fetch(s.sheetsWebhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'bulk',users:userRows,attendance:attRows})});
    const d=await readBackendJSON(res);
    if(d.ok){ saveJSON(LS_QUEUE,[]); updateSyncPill(); toast('✅ Synced '+users.length+' users + '+att.length+' attendance rows to Google Sheets.'); }
    else throw new Error(d.error||'Sync failed');
  }catch(e){ toast('Sync failed: '+e.message+' — records queued for retry.',true); }
};
window.testSheets=async function(){
  const s=getSettings();
  if(!s.sheetsWebhook){ toast('Paste the Web App URL first.',true); return; }
  try{
    const res=await fetch(s.sheetsWebhook); const d=await readBackendJSON(res);
    toast(d.ok?('✅ Backend OK — provider: '+(d.provider||'n/a')+' • email: '+(d.emailEnabled?'on':'off')):('Backend responded: '+JSON.stringify(d)));
  }
  catch(e){ toast('Connection failed: '+e.message,true); }
};

/* ---------- SMS / WhatsApp / Email alerts ---------- */
function logAlert(entry){
  const log=loadJSON(LS_ALERTS,[]); log.unshift(entry); saveJSON(LS_ALERTS,log.slice(0,200)); renderAdminAlerts();
  pushToSheets('alert',[entry.at,entry.user,entry.event,entry.channel,entry.recipient,entry.status]);
}
function fillTpl(tpl,vars){ let out=tpl; for(const k in vars) out=out.split('{'+k+'}').join(vars[k]); return out; }
function normalizePhone(p){ return String(p||'').replace(/[^\d+]/g,''); }

async function sendViaProvider(channel,phone,message){
  const s=getSettings();
  const isEmail = String(phone||'').indexOf('@')>-1;
  const to = isEmail ? String(phone).trim() : normalizePhone(phone);
  if(!to) return {status:'failed',note:'No recipient'};
  const ch = isEmail ? 'email' : (s.alertChannel||'auto');

  /* ===== RECOMMENDED: Google Apps Script backend =====
     The script holds the Termii / Twilio / WhatsApp keys and sends server-side,
     so nothing secret is exposed and there is no CORS problem. */
  if(s.smsProvider==='apps_script'){
    if(!s.sheetsWebhook) return {status:'failed',note:'Add your Apps Script Web App URL in Cloud Sync first'};
    try{
      const res=await fetch(s.sheetsWebhook,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type:'send',to:to,message:message,channel:ch})});
      const d=await res.json().catch(()=>({}));
      if(d && d.status==='sent') return {status:'sent',note:d.note||'Sent by Apps Script backend'};
      return {status:'failed',note:(d&&(d.note||d.error))||'Backend did not send'};
    }catch(e){ return {status:'failed',note:'Backend unreachable: '+e.message}; }
  }

  if(s.smsProvider==='twilio' && s.twilioSid && s.twilioToken && s.twilioFrom){
    try{
      const body=new URLSearchParams({To:to,From:s.twilioFrom,Body:message});
      const res=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+s.twilioSid+'/Messages.json',{method:'POST',headers:{'Authorization':'Basic '+btoa(s.twilioSid+':'+s.twilioToken),'Content-Type':'application/x-www-form-urlencoded'},body});
      if(res.ok) return {status:'sent',note:'Twilio SMS'};
      return {status:'failed',note:'Twilio HTTP '+res.status+' (CORS/key issue — use the Apps Script backend)'};
    }catch(e){ return {status:'failed',note:'Twilio: '+e.message}; }
  }
  if(s.smsProvider==='termii' && s.termiiKey){
    try{
      const res=await fetch('https://api.termii.com/api/sms/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:s.termiiKey,to:to,from:s.termiiFrom||'MAKNAZUL',sms:message,type:'plain'})});
      const d=await res.json().catch(()=>({}));
      if(res.ok && d.message) return {status:'sent',note:'Termii SMS'};
      return {status:'failed',note:'Termii: '+(d.message||res.status)};
    }catch(e){ return {status:'failed',note:'Termii: '+e.message}; }
  }
  if(s.smsProvider==='whatsapp' && s.waToken && s.waPhoneId){
    try{
      const res=await fetch('https://graph.facebook.com/v21.0/'+s.waPhoneId+'/messages',{method:'POST',headers:{'Authorization':'Bearer '+s.waToken,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:to.replace('+',''),type:'text',text:{body:message}})});
      if(res.ok) return {status:'sent',note:'WhatsApp Cloud API'};
      return {status:'failed',note:'WhatsApp HTTP '+res.status};
    }catch(e){ return {status:'failed',note:'WhatsApp: '+e.message}; }
  }
  if(s.smsProvider==='webhook' && s.webhookUrl){
    try{
      const res=await fetch(s.webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to,channel,message})});
      if(res.ok) return {status:'sent',note:'Webhook'};
      return {status:'failed',note:'Webhook HTTP '+res.status};
    }catch(e){ return {status:'failed',note:'Webhook: '+e.message}; }
  }
  return {status:'manual',note:'Manual mode — tap WhatsApp/SMS in the Alert Log to send'};
}

async function sendAlertFor(user,event,rec){
  const s=getSettings();
  const vars={name:user.name,time:rec?fmtTime(rec.clockIn||rec.clockOut):fmtTime(new Date().toISOString()),date:fmtDate(new Date().toISOString()),status:rec?rec.status:'',start:s.schoolStart};
  let tpl=null;
  if(event==='CLOCK_IN'){ if(!s.alertOnIn) return; tpl=s.tplIn; }
  else if(event==='CLOCK_OUT'){ if(!s.alertOnOut) return; tpl=s.tplOut; }
  else if(event==='LATE'){ if(!s.alertOnLate) return; tpl=s.tplLate; }
  else if(event==='ABSENT'){ if(!s.alertOnAbsent) return; tpl=s.tplAbsent; }
  if(!tpl) return;
  const message=fillTpl(tpl,vars);
  const smsOk=!!BACKEND.smsReady;
  const recipients=[];
  /* Email needs no account, no approval, no credit — always include it. */
  if(s.emailStudents && user.email && String(user.email).indexOf('@')>-1) recipients.push({phone:user.email,label:'Student email'});
  if(s.parentAlerts && user.parentEmail) recipients.push({phone:user.parentEmail,label:'Parent email'});
  if(s.alertAdminSummary && s.adminEmail) recipients.push({phone:s.adminEmail,label:'Admin email'});
  /* Phones only when the backend can actually deliver SMS. */
  if(smsOk){
    if(user.phone) recipients.push({phone:user.phone,label:'Self SMS'});
    if(s.parentAlerts && user.parentPhone) recipients.push({phone:user.parentPhone,label:'Parent SMS'});
    if(s.alertAdminSummary && s.adminPhone) recipients.push({phone:s.adminPhone,label:'Admin SMS'});
  }
  for(const r of recipients){
    const result=await sendViaProvider('SMS',r.phone,message);
    logAlert({at:new Date().toISOString(),user:user.name+' ('+r.label+')',event,channel:String(r.phone).indexOf('@')>-1?'email':(s.smsProvider==='apps_script'?'backend':s.smsProvider),recipient:r.phone,status:result.status,message,note:result.note});
  }
  /* Give the guardian row a one-tap WhatsApp button when SMS is off. */
  if(!smsOk && (user.parentPhone||user.phone)){
    logAlert({at:new Date().toISOString(),user:user.name+' (Guardian)',event,channel:'whatsapp-link',recipient:(user.parentPhone||user.phone),status:'manual',message,note:'SMS off — tap WhatsApp to notify this guardian',uid:user.id});
  }
  if(!recipients.length && smsOk){
    logAlert({at:new Date().toISOString(),user:user.name,event,channel:'—',recipient:'—',status:'failed',message,note:'No email or phone on record'});
  }
}
window.sendTestAlert=async function(){
  const phone=$('testPhone').value.trim(); const msg=$('testMsg').value.trim()||'Test alert from MAKNAZUL \'IRFAN ACADEMY clock system.';
  if(!phone){ toast('Enter a test phone number or email.',true); return; }
  toast('Sending test…');
  const result=await sendViaProvider('SMS',phone,msg);
  logAlert({at:new Date().toISOString(),user:'TEST',event:'TEST',channel:'SMS',recipient:phone,status:result.status,message:msg,note:result.note});
  if(result.status==='sent') toast('✅ Test message sent — check the phone/email.');
  else toast('Not sent: '+(result.note||result.status)+' — see Alert Log for manual buttons.',true);
};
window.manualSend=function(idx,channel){
  const log=loadJSON(LS_ALERTS,[]); const entry=log[idx]; if(!entry) return;
  const phone=normalizePhone(entry.recipient); const text=encodeURIComponent(entry.message);
  const url=channel==='whatsapp'?('https://wa.me/'+phone.replace('+','')+'?text='+text):('sms:'+phone+'?&body='+text);
  window.open(url,'_blank');
  entry.status='sent'; entry.note='Sent manually via '+(channel==='whatsapp'?'WhatsApp':'SMS'); saveJSON(LS_ALERTS,log); renderAdminAlerts();
};
window.runAbsentDigest=async function(){
  const s=getSettings();
  if(!s.sheetsWebhook){ toast('Add your Apps Script Web App URL in Cloud Sync first.',true); return; }
  toast('Asking the backend to check absentees…');
  try{
    const res=await fetch(s.sheetsWebhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'absent'})});
    const d=await res.json().catch(()=>({}));
    if(d.error){ toast('Backend error: '+d.error,true); return; }
    if(d.absent===0){ toast('✅ Everyone is present today. Ma sha Allah!'); return; }
    toast('🔔 Absent digest sent for '+d.absent+' student(s).');
    logAlert({at:new Date().toISOString(),user:'SYSTEM',event:'ABSENT DIGEST',channel:'backend',recipient:'guardians + admin',status:'sent',message:(d.names||[]).join(', ')||d.absent+' absent'});
  }catch(e){ toast('Could not reach backend: '+e.message,true); }
};

/* ---------- hook into clock + registration ---------- */
function hookClock(){
  const orig=window.doClock;
  if(typeof orig!=='function') return;
  window.doClock=function(userId,method){
    const rec=orig(userId,method);
    if(!rec) return rec;
    const user=loadUsers().find(u=>u.id===userId);
    if(user){
      const isIn=!!rec.clockIn && !rec.clockOut;
      pushToSheets('attendance',[rec.date,user.name,user.id,user.role,rec.clockIn||'',rec.clockOut||'',durationStr(rec.clockIn,rec.clockOut),rec.status,rec.method]);
      sendAlertFor(user,isIn?'CLOCK_IN':'CLOCK_OUT',rec);
      if(isIn && (rec.status==='Late'||rec.status==='Very Late')) sendAlertFor(user,'LATE',rec);
    }
    return rec;
  };
}
function hookRegister(){
  const btn=$('btnRegisterFinish'); if(!btn) return;
  btn.addEventListener('click',()=>{
    setTimeout(()=>{
      const users=loadUsers(); const u=users[users.length-1];
      if(u && u.createdAt && (Date.now()-new Date(u.createdAt).getTime())<10000){
        pushToSheets('user',[u.id,u.name,u.role,u.classDept||'',u.gender||'',u.phone||'',u.email||'',u.createdAt]);
      }
    },300);
  });
}

/* ---------- admin rendering ---------- */
function renderAdminOverview(){
  const el=$('adminOverview'); if(!el) return;
  const users=loadUsers(), att=loadAtt(), t=todayStr();
  const today=att.filter(r=>r.date===t);
  const present=today.length, late=today.filter(r=>r.status!=='Present').length;
  const absent=Math.max(0,users.length-present);
  const rate=users.length?Math.round(present/users.length*100):0;
  const lateRate=present?Math.round(late/present*100):0;
  const absentList=users.filter(u=>!today.some(r=>r.userId===u.id));
  const s=getSettings();
  const setupBanner = (s.sheetsWebhook && s.sheetsEnabled) ? '' :
    '<div class="template-box" style="margin-bottom:14px">⚠️ <b>Backend not connected yet.</b> Alerts and cloud sync stay queued until you paste the Apps Script Web App URL in <b>Cloud Sync</b>. Admin alerts go to <b>'+esc(s.adminEmail||'—')+'</b> and <b>'+esc(s.adminPhone||'—')+'</b>.</div>';
  el.innerHTML=setupBanner+'<div class="kpi-row">'
    +'<div class="kpi"><div class="l">Attendance Today</div><div class="v">'+rate+'%</div><div class="s">'+present+' / '+users.length+' present</div><div class="bar"><i style="width:'+rate+'%"></i></div></div>'
    +'<div class="kpi"><div class="l">Late Today</div><div class="v">'+late+'</div><div class="s">'+lateRate+'% of present</div></div>'
    +'<div class="kpi"><div class="l">Absent Today</div><div class="v">'+absent+'</div><div class="s">Not clocked in</div></div>'
    +'<div class="kpi"><div class="l">Total Records</div><div class="v">'+att.length+'</div><div class="s">All time</div></div>'
    +'</div>'
    +'<div class="admin-card"><h4>📋 Absent Today ('+absent+')</h4>'
    +(absentList.length? absentList.map(u=>'<div class="alert-log-item"><b>'+esc(u.name)+'</b> <span class="small">'+esc(u.id)+' • '+esc(u.role)+'</span><span style="margin-left:auto;display:flex;gap:6px"><button class="mini-btn gold" onclick="waAbsent(\''+u.id+'\')">📱 WhatsApp</button><button class="mini-btn" onclick="manualSendAbsent(\''+u.id+'\')">📩 Absent Alert</button></span></div>').join('') : '<p class="small">Everyone has clocked in today. Ma sha Allah!</p>')
    +'</div>';
}
/* One-tap WhatsApp that needs no credit, no sender-ID approval, no API key.
   Used while SMS is pending and as a permanent free fallback. */
function waNumber_(p){
  let n=String(p||'').replace(/[^\d+]/g,'');
  if(!n) return '';
  if(n.indexOf('+')===0) return n.replace('+','');
  if(n.indexOf('234')===0) return n;
  if(n.charAt(0)==='0') return '234'+n.slice(1);
  return n;
}
window.waAbsent=function(userId){
  const u=loadUsers().find(x=>x.id===userId); if(!u) return;
  const s=getSettings();
  const raw=u.parentPhone||u.phone;
  const num=waNumber_(raw);
  if(!num){ toast('No phone number on record for '+u.name,true); return; }
  const msg=fillTpl(s.tplAbsent,{name:u.name,date:fmtDate(new Date().toISOString()),time:fmtTime(new Date().toISOString()),status:'Absent',start:s.schoolStart});
  window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank');
  logAlert({at:new Date().toISOString(),user:u.name+' (WhatsApp)',event:'ABSENT',channel:'whatsapp-link',recipient:raw,status:'sent',message:msg,note:'Opened WhatsApp with the message pre-filled'});
};
window.waMessage=function(userId,event){
  const u=loadUsers().find(x=>x.id===userId); if(!u) return;
  const s=getSettings();
  const raw=u.parentPhone||u.phone; const num=waNumber_(raw);
  if(!num){ toast('No phone number on record for '+u.name,true); return; }
  const tpl=event==='LATE'?s.tplLate:s.tplIn;
  const msg=fillTpl(tpl,{name:u.name,date:fmtDate(new Date().toISOString()),time:fmtTime(new Date().toISOString()),status:'',start:s.schoolStart});
  window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank');
};

window.manualSendAbsent=async function(userId){
  const u=loadUsers().find(x=>x.id===userId); if(!u) return;
  await sendAlertFor(u,'ABSENT',null); toast('Absent alert processed for '+u.name+'.');
};
function renderAdminUsers(){
  const el=$('adminUsers'); if(!el) return;
  const users=loadUsers();
  el.innerHTML='<div class="table-wrap"><table><thead><tr><th>Name</th><th>ID</th><th>Role</th><th>Class/Dept</th><th>Phone</th><th>Parent Phone</th><th>Face</th><th>Thumb</th><th>Actions</th></tr></thead><tbody>'
    +(users.length? users.map(u=>'<tr><td><b>'+esc(u.name)+'</b></td><td>'+esc(u.id)+'</td><td>'+esc(u.role)+'</td><td>'+esc(u.classDept||'')+'</td><td>'+esc(u.phone||'—')+'</td><td>'+esc(u.parentPhone||'—')+'</td><td>'+(u.faceThumb?'😊 ✓':'—')+'</td><td>'+(u.thumbId?'👆 ✓':'—')+'</td><td><button class="mini-btn gold" onclick="openQrModal(\''+u.id+'\')">QR</button> <button class="mini-btn" onclick="deleteUser(\''+u.id+'\')">🗑</button></td></tr>').join('') : '<tr><td colspan="9" style="text-align:center;padding:20px">No users yet.</td></tr>')
    +'</tbody></table></div><p class="small" style="margin-top:10px">Add a Parent/Guardian phone at registration so guardians receive alerts too.</p>';
}
function alertButtons(e,i){
  const isPhone = e.recipient && String(e.recipient).indexOf('@')===-1;
  if(!isPhone) return '';
  let out = '<button class="mini-btn gold" onclick="manualSend(' + i + ',\'whatsapp\')">WhatsApp</button>';
  if(e.status!=='sent') out += '<button class="mini-btn" onclick="manualSend(' + i + ',\'sms\')">SMS</button>';
  return '<span style="display:flex;gap:6px">' + out + '</span>';
}
function renderAdminAlerts(){
  const el=$('adminAlerts'); if(!el) return;
  const log=loadJSON(LS_ALERTS,[]);
  if(!log.length){
    el.innerHTML='<div class="empty"><div class="big">\uD83D\uDCAC</div>No alerts sent yet.<br>Clock-ins will appear here once alerts are enabled.</div>';
    return;
  }
  el.innerHTML=log.slice(0,30).map(function(e,i){
    const when=e.at?new Date(e.at).toLocaleString():'';
    return '<div class="alert-log-item"><div style="flex:1;min-width:0">'
      + '<b>'+esc(e.user)+'</b> \u2022 '+esc(e.event)+' \u2022 '+esc(e.channel)
      + '<br><span class="small">'+esc(when)+' \u2192 '+esc(e.recipient)+'</span>'
      + '<br><span class="small">'+esc(e.message||'')+'</span>'
      + (e.note?'<br><span class="small">'+esc(e.note)+'</span>':'')
      + '</div><span class="alert-status '+esc(e.status)+'">'+esc(e.status)+'</span>'
      + alertButtons(e,i) + '</div>';
  }).join('');
}
function renderSettingsForm(){
  const s=getSettings();
  const set=(id,val)=>{ const el=$(id); if(el) el.value=val==null?'':val; };
  const chk=(id,val)=>{ const el=$(id); if(el) el.checked=!!val; };
  set('setSchoolStart',s.schoolStart); set('setLateAfter',s.lateAfter);
  set('setSheetsWebhook',s.sheetsWebhook); chk('setSheetsEnabled',s.sheetsEnabled);
  set('setSmsProvider',s.smsProvider); set('setAlertChannel',s.alertChannel);
  set('setTwilioSid',s.twilioSid); set('setTwilioToken',s.twilioToken); set('setTwilioFrom',s.twilioFrom);
  set('setTermiiKey',s.termiiKey); set('setTermiiFrom',s.termiiFrom); set('setWaToken',s.waToken); set('setWaPhoneId',s.waPhoneId); set('setWebhookUrl',s.webhookUrl);
  set('setAdminPhone',s.adminPhone);
  chk('setAlertOnIn',s.alertOnIn); chk('setAlertOnOut',s.alertOnOut); chk('setAlertOnLate',s.alertOnLate); chk('setAlertOnAbsent',s.alertOnAbsent); chk('setAlertAdminSummary',s.alertAdminSummary); chk('setParentAlerts',s.parentAlerts); chk('setEmailStudents',s.emailStudents);
  set('setTplIn',s.tplIn); set('setTplOut',s.tplOut); set('setTplLate',s.tplLate); set('setTplAbsent',s.tplAbsent);
  set('adminEmailDisplay',getAdmin().email);
}
window.saveSettingsUI=function(){
  const s=getSettings();
  /* tolerant readers: a field may not exist on this build of the panel */
  const val=(id,def)=>{ const el=$(id); return el?String(el.value).trim():(def==null?'':def); };
  const on=(id,def)=>{ const el=$(id); return el?!!el.checked:!!def; };
  s.schoolStart=val('setSchoolStart',s.schoolStart); s.lateAfter=val('setLateAfter',s.lateAfter);
  s.sheetsWebhook=val('setSheetsWebhook',s.sheetsWebhook); s.sheetsEnabled=on('setSheetsEnabled',s.sheetsEnabled);
  s.smsProvider=val('setSmsProvider',s.smsProvider); s.alertChannel=val('setAlertChannel',s.alertChannel);
  s.twilioSid=val('setTwilioSid',s.twilioSid); s.twilioToken=val('setTwilioToken',s.twilioToken); s.twilioFrom=val('setTwilioFrom',s.twilioFrom);
  s.termiiKey=val('setTermiiKey',s.termiiKey); s.termiiFrom=val('setTermiiFrom',s.termiiFrom);
  s.waToken=val('setWaToken',s.waToken); s.waPhoneId=val('setWaPhoneId',s.waPhoneId); s.webhookUrl=val('setWebhookUrl',s.webhookUrl);
  s.adminPhone=val('setAdminPhone',s.adminPhone);
  s.alertOnIn=on('setAlertOnIn',s.alertOnIn); s.alertOnOut=on('setAlertOnOut',s.alertOnOut);
  s.alertOnLate=on('setAlertOnLate',s.alertOnLate); s.alertOnAbsent=on('setAlertOnAbsent',s.alertOnAbsent);
  s.alertAdminSummary=on('setAlertAdminSummary',s.alertAdminSummary); s.parentAlerts=on('setParentAlerts',s.parentAlerts); s.emailStudents=on('setEmailStudents',s.emailStudents);
  s.tplIn=val('setTplIn',s.tplIn); s.tplOut=val('setTplOut',s.tplOut); s.tplLate=val('setTplLate',s.tplLate); s.tplAbsent=val('setTplAbsent',s.tplAbsent);
  if(!s.tplIn) s.tplIn=defaultSettings().tplIn;
  if(!s.tplOut) s.tplOut=defaultSettings().tplOut;
  if(!s.tplLate) s.tplLate=defaultSettings().tplLate;
  if(!s.tplAbsent) s.tplAbsent=defaultSettings().tplAbsent;
  saveSettings(s); updateSyncPill(); toast('✅ Settings saved.'); flushQueue();
};
window.changeAdminPw=function(){
  const pw=$('newAdminPw').value.trim(), pw2=$('newAdminPw2').value.trim();
  if(pw.length<6){ toast('Password must be at least 6 characters.',true); return; }
  if(pw!==pw2){ toast('Passwords do not match.',true); return; }
  const a=getAdmin(); a.pwHash=hashPw(pw); a.mustChange=false; saveJSON(LS_ADMIN,a);
  $('newAdminPw').value=''; $('newAdminPw2').value=''; toast('✅ Admin password changed.');
};
window.backupData=function(){
  const data={users:loadUsers(),attendance:loadAtt(),alerts:loadJSON(LS_ALERTS,[]),settings:getSettings(),exportedAt:new Date().toISOString()};
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})); a.download='maknazul-backup-'+todayStr()+'.json'; a.click(); toast('Backup downloaded.');
};
window.restoreData=function(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{ try{ const d=JSON.parse(reader.result); if(d.users) localStorage.setItem('mia_users_v1',JSON.stringify(d.users)); if(d.attendance) localStorage.setItem('mia_attendance_v1',JSON.stringify(d.attendance)); if(d.alerts) saveJSON(LS_ALERTS,d.alerts); if(d.settings) saveSettings(d.settings); toast('✅ Data restored. Refreshing…'); setTimeout(()=>location.reload(),800); }catch(e){ toast('Restore failed: '+e.message,true); } };
  reader.readAsText(file);
};

/* ---------- admin subtabs ---------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('.admin-subtab'); if(!b) return;
  document.querySelectorAll('.admin-subtab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.admin-subpanel').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  const p=$('sub-'+b.dataset.sub); if(p) p.classList.add('active');
});

/* ---------- build UI ---------- */
function buildPanel(){
  const panel=document.createElement('section'); panel.className='card tab-panel admin-only'; panel.id='panel-admin';
  panel.innerHTML=''
   +'<div class="card-head"><h3>🛡️ Admin Panel</h3><span class="hint">Cloud Sync • SMS/WhatsApp Alerts • Settings</span><span style="margin-left:auto"><button class="btn btn-ghost" style="padding:9px 14px;font-size:13px" onclick="doAdminLogout()">🔒 Logout</button></span></div>'
   +'<div class="card-body">'
   +'<div class="admin-subtabs">'
     +'<button class="admin-subtab active" data-sub="overview">📊 Overview</button>'
     +'<button class="admin-subtab" data-sub="users">👥 Users</button>'
     +'<button class="admin-subtab" data-sub="sync">☁️ Cloud Sync</button>'
     +'<button class="admin-subtab" data-sub="alerts">💬 Alerts</button>'
     +'<button class="admin-subtab" data-sub="settings">⚙️ Settings</button>'
   +'</div>'
   /* OVERVIEW */
   +'<div class="admin-subpanel active" id="sub-overview"><div id="adminOverview"></div></div>'
   /* USERS */
   +'<div class="admin-subpanel" id="sub-users"><div id="adminUsers"></div></div>'
   /* SYNC */
   +'<div class="admin-subpanel" id="sub-sync">'
     +'<div class="admin-grid">'
       +'<div class="admin-card"><h4>☁️ Google Sheets (your cloud database)</h4>'
         +'<p class="small">Live sheet: <a href="'+SHEET_URL+'" target="_blank" rel="noopener">Open Attendance Sheet ↗</a><br>ID: <code>'+SHEET_ID+'</code></p>'
         +'<div class="switch-row"><input type="checkbox" id="setSheetsEnabled"> Enable Sheets sync</div>'
         +'<div class="field"><label>Apps Script Web App URL</label><input id="setSheetsWebhook" placeholder="https://script.google.com/macros/s/.../exec"></div>'
         +'<p class="small">Paste <code>google-apps-script.gs</code> into the sheet\'s Apps Script editor (Extensions → Apps Script), deploy as a Web App, then paste the /exec URL here.</p>'
         +'<div class="btn-row" style="margin-bottom:8px"><button class="btn btn-green" style="flex:1" onclick="connectBackend()">🔗 Connect &amp; Sync Everything</button></div>'
         +'<div class="btn-row"><button class="btn btn-ghost" onclick="saveSettingsUI()">💾 Save</button><button class="btn btn-gold" onclick="syncNow()">☁️ Sync Now</button><button class="btn btn-ghost" onclick="testSheets()">Test Connection</button></div>'
       +'</div>'
       +'<div class="admin-card"><h4>📋 How this works</h4><p class="small">Every clock in/out, registration and alert is POSTed to your Sheet automatically. Offline records queue and retry every 60s — the pill in the top bar shows the state.<br><br>✅ Free cloud database + free message sending. No Supabase, no Vercel.</p></div>'
     +'</div>'
   +'</div>'
   /* ALERTS */
   +'<div class="admin-subpanel" id="sub-alerts">'
     +'<div class="admin-grid">'
       +'<div class="admin-card"><h4>💬 Sending provider <span class="alert-status manual" id="smsBadge">SMS: checking…</span></h4>'
         +'<div class="field"><label>Provider</label><select id="setSmsProvider">'
           +'<option value="apps_script">⭐ Email + one-tap WhatsApp (recommended — no SMS account needed)</option>'
           +'<option value="manual">Manual (wa.me / sms: buttons — free, no key)</option>'
           +'<option value="twilio">Twilio SMS (direct from browser)</option>'
           +'<option value="termii">Termii SMS (direct from browser)</option>'
           +'<option value="whatsapp">WhatsApp Cloud API (direct from browser)</option>'
           +'<option value="webhook">Generic webhook</option>'
         +'</select></div>'
         +'<div class="field" style="margin-top:8px"><label>Send alerts as</label><select id="setAlertChannel">'
           +'<option value="auto">Auto (SMS + WhatsApp + email copy)</option>'
           +'<option value="sms">SMS only</option>'
           +'<option value="whatsapp">WhatsApp only</option>'
           +'<option value="email">Email only</option>'
         +'</select></div>'
         +'<div class="switch-row"><input type="checkbox" id="setAlertOnIn"> Alert on Clock In</div>'
         +'<div class="switch-row"><input type="checkbox" id="setAlertOnOut"> Alert on Clock Out</div>'
         +'<div class="switch-row"><input type="checkbox" id="setAlertOnLate"> Alert on Late arrival</div>'
         +'<div class="switch-row"><input type="checkbox" id="setAlertOnAbsent"> Alert on Absent</div>'
         +'<div class="switch-row"><input type="checkbox" id="setAlertAdminSummary"> Admin summary copy</div>'
         +'<div class="switch-row"><input type="checkbox" id="setParentAlerts"> Also alert Parent/Guardian</div>'
         +'<div class="switch-row"><input type="checkbox" id="setEmailStudents"> 📧 Email the student/staff too (no SMS key needed)</div>'
         +'<div class="field" style="margin-top:8px"><label>Admin phone (summary copy)</label><input id="setAdminPhone" placeholder="0803 000 0000"></div>'
         +'<div class="btn-row"><button class="btn btn-green" onclick="saveSettingsUI()">💾 Save Alerts Settings</button><button class="btn btn-gold" onclick="runAbsentDigest()">🔔 Run Absent Digest Now</button></div>'
         +'<div class="template-box" style="margin-top:10px">⭐ <b>Recommended:</b> choose <b>Google Apps Script backend</b> and put your Termii / Twilio / WhatsApp keys inside <code>CONFIG</code> in the Apps Script file. The script sends the messages from Google\'s servers — keys never touch this page and there is no CORS problem.</div>'
         +'<p class="small">Browser-direct providers often fail on CORS and expose your keys — use them only for quick tests. Manual mode always works via the WhatsApp/SMS buttons in the Alert Log.</p>'
       +'</div>'
       +'<div class="admin-card"><h4>✉️ Message templates</h4>'
         +'<div class="field"><label>Clock In</label><textarea id="setTplIn" rows="2"></textarea></div>'
         +'<div class="field" style="margin-top:8px"><label>Clock Out</label><textarea id="setTplOut" rows="2"></textarea></div>'
         +'<div class="field" style="margin-top:8px"><label>Late</label><textarea id="setTplLate" rows="2"></textarea></div>'
         +'<div class="field" style="margin-top:8px"><label>Absent</label><textarea id="setTplAbsent" rows="2"></textarea></div>'
         +'<p class="small">Variables: {name} {time} {date} {status} {start}</p>'
         +'<div class="divider"></div><h4>🧪 Test message</h4>'
         +'<div class="field"><label>Phone or email</label><input id="testPhone" placeholder="0803 000 0000 or name@mail.com"></div>'
         +'<div class="field" style="margin-top:8px"><label>Message</label><input id="testMsg" placeholder="Test alert…"></div>'
         +'<div class="btn-row"><button class="btn btn-gold" onclick="sendTestAlert()">Send Test</button></div>'
       +'</div>'
     +'</div>'
     +'<div class="admin-card" style="margin-top:12px"><h4>📜 Alert Log</h4><div id="adminAlerts"></div></div>'
   +'</div>'
   /* SETTINGS */
   +'<div class="admin-subpanel" id="sub-settings">'
     +'<div class="admin-grid">'
       +'<div class="admin-card"><h4>🏫 School times</h4><div class="form-grid"><div class="field"><label>School starts</label><input id="setSchoolStart" type="time"></div><div class="field"><label>Late after</label><input id="setLateAfter" type="time"></div></div><div class="btn-row"><button class="btn btn-green" onclick="saveSettingsUI()">💾 Save Times</button></div></div>'
       +'<div class="admin-card"><h4>🔑 Change admin password</h4><p class="small">Admin email: <b id="adminEmailDisplay"></b><br>Default: <code>maknazulirfanacademy@gmail.com / admin123</code> — change it now!</p><div class="field"><label>New password (min 6)</label><input id="newAdminPw" type="password"></div><div class="field" style="margin-top:8px"><label>Confirm</label><input id="newAdminPw2" type="password"></div><div class="btn-row"><button class="btn btn-gold" onclick="changeAdminPw()">Change Password</button></div></div>'
       +'<div class="admin-card"><h4>💾 Backup &amp; restore</h4><p class="small">Download a full JSON backup of users, attendance, alerts and settings.</p><div class="btn-row"><button class="btn btn-green" onclick="backupData()">⬇ Backup JSON</button><label class="btn btn-ghost" style="cursor:pointer">⬆ Restore<input type="file" accept=".json" style="display:none" onchange="restoreData(this)"></label></div></div>'
     +'</div>'
   +'</div>'
   +'</div>';
  const wrap=document.querySelector('.wrap');
  if(wrap) wrap.appendChild(panel);
}
function buildLoginModal(){
  const m=document.createElement('div'); m.className='modal'; m.id='adminLoginModal';
  m.innerHTML='<div class="modal-box login-box" style="text-align:center">'
    +'<div class="logo-badge"><img src="assets/logo.png" style="width:100%;height:100%;object-fit:contain" alt="logo"></div>'
    +'<h3>🛡️ Admin Login</h3><p class="small">Admins only — manage sync, alerts &amp; settings.</p>'
    +'<div class="field" style="text-align:left;margin-top:12px"><label>Admin email</label><input id="adminEmail" placeholder="maknazulirfanacademy@gmail.com"></div>'
    +'<div class="field" style="text-align:left;margin-top:10px"><label>Password</label><input id="adminPw" type="password" placeholder="••••••••" onkeydown="if(event.key===\'Enter\')doAdminLogin()"></div>'
    +'<div class="btn-row" style="justify-content:center"><button class="btn btn-green" onclick="doAdminLogin()">Login</button><button class="btn btn-ghost" onclick="closeAdminLogin()">Cancel</button></div>'
    +'<p class="small" style="margin-top:10px">Default: <code>maknazulirfanacademy@gmail.com / admin123</code><br>Change it in Admin → Settings after first login.</p>'
    +'</div>';
  m.addEventListener('click',e=>{ if(e.target===m) closeAdminLogin(); });
  document.body.appendChild(m);
}
function buildHeaderBits(){
  const inner=document.querySelector('.topbar-inner');
  if(inner && !$('btnAdminLogin')){
    const wrap=document.createElement('div'); wrap.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    wrap.innerHTML='<span class="sync-pill" id="syncPill"><span class="dot"></span>☁️ Local Only</span>'
      +'<button class="admin-btn" id="btnAdminLogin" onclick="openAdminLogin()">🔐 Admin Login</button>';
    inner.appendChild(wrap);
  }
}
function buildRegistrationField(){
  const phoneField=$('regPhone') ? $('regPhone').closest('.field') : null;
  if(phoneField && !$('regParentPhone')){
    const div=document.createElement('div'); div.className='field';
    div.innerHTML='<label>Parent / Guardian Phone (for alerts)</label><input id="regParentPhone" placeholder="0803 000 0000">';
    phoneField.after(div);
    const em=document.createElement('div'); em.className='field';
    em.innerHTML='<label>Parent / Guardian Email (optional)</label><input id="regParentEmail" type="email" placeholder="parent@email.com">';
    div.after(em);
  }
}

/* ---------- init ---------- */
function init(){
  const tabs=document.querySelector('.tabs');
  if(tabs && !$('tab-admin')){
    const btn=document.createElement('button'); btn.className='tab-btn admin-only'; btn.id='tab-admin'; btn.textContent='🛡️ Admin Panel';
    btn.addEventListener('click',()=>switchTab('admin')); tabs.appendChild(btn);
  }
  if(!$('panel-admin')) buildPanel();
  if(!$('adminLoginModal')) buildLoginModal();
  buildHeaderBits(); buildRegistrationField();
  hookClock(); hookRegister(); applyAdminUI(); flushQueue(); checkBackend();
  setInterval(flushQueue,60000);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
