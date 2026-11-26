/* ============================================================
   MAKNAZUL 'IRFAN ACADEMY - Admin editing + PDF records
   Adds: edit any person, edit any attendance record, school
   identity settings, and PDF exports (profile + records).
   ============================================================ */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const LS_USERS='mia_users_v1', LS_ATT='mia_attendance_v1', LS_SETTINGS='mia_settings_v1';

function loadJSON(k,d){ try{ const v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
function saveJSON(k,v){ localStorage.setItem(k,JSON.stringify(v)); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function isAdmin(){ return document.body.classList.contains('is-admin'); }
function needAdmin(){ if(!isAdmin()){ toast('Admin login required.',true); return true; } return false; }
function toast(msg,err){ const box=$('toasts'); if(!box) return; const t=document.createElement('div'); t.className='toast'+(err?' err':''); t.textContent=msg; box.appendChild(t); setTimeout(()=>t.remove(),4200); }
function fmtDate(iso){ if(!iso) return '-'; return new Date(iso).toLocaleDateString([], {weekday:'short',day:'2-digit',month:'short',year:'numeric'}); }
function fmtTime(iso){ if(!iso) return '-'; return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:true}); }
function dur(a,b){ if(!a||!b) return '-'; const s=Math.max(0,Math.round((new Date(b)-new Date(a))/1000)); return Math.floor(s/3600)+'h '+Math.floor(s%3600/60)+'m'; }
function settings(){ return loadJSON(LS_SETTINGS,{}); }
function schoolName(){ const s=settings(); return s.schoolName||"MAKNAZUL 'IRFAN ACADEMY"; }

/* ---------------------------------------------------------------- modal */
function ensureModal(){
  let m=$('miaEditModal');
  if(!m){
    m=document.createElement('div'); m.className='modal'; m.id='miaEditModal';
    m.addEventListener('click',e=>{ if(e.target===m) closeEdit(); });
    document.body.appendChild(m);
  }
  return m;
}
window.closeEdit=function(){ const m=$('miaEditModal'); if(m) m.classList.remove('show'); };
function openModal(html){ const m=ensureModal(); m.innerHTML='<div class="modal-box edit-box">'+html+'</div>'; m.classList.add('show'); }

/* ------------------------------------------------------------ edit user */
let pendingPhoto=undefined; // undefined = unchanged, null = removed, string = new dataURL

window.editUser=function(id){
  if(needAdmin()) return;
  const u=loadJSON(LS_USERS,[]).find(x=>x.id===id);
  if(!u){ toast('Person not found.',true); return; }
  pendingPhoto=undefined;
  const roles=['Student','Staff','Teacher','Admin','Other'];
  openModal(
    '<h3>✏️ Edit ' + esc(u.name) + '</h3>'
    +'<p class="small">ID <b>'+esc(u.id)+'</b> — changes save to this device and re-sync to Google Sheets.</p>'
    +'<div class="form-grid" style="margin-top:12px">'
    +'<div class="field"><label>Full name</label><input id="euName" value="'+esc(u.name)+'"></div>'
    +'<div class="field"><label>Role</label><select id="euRole">'+roles.map(r=>'<option'+(r===u.role?' selected':'')+'>'+r+'</option>').join('')+'</select></div>'
    +'<div class="field"><label>Class / Department</label><input id="euClass" value="'+esc(u.classDept||'')+'"></div>'
    +'<div class="field"><label>Gender</label><select id="euGender"><option'+(u.gender==='Male'?' selected':'')+'>Male</option><option'+(u.gender==='Female'?' selected':'')+'>Female</option></select></div>'
    +'<div class="field"><label>Phone</label><input id="euPhone" value="'+esc(u.phone||'')+'"></div>'
    +'<div class="field"><label>Parent / Guardian phone</label><input id="euParentPhone" value="'+esc(u.parentPhone||'')+'"></div>'
    +'<div class="field"><label>Email</label><input id="euEmail" value="'+esc(u.email||'')+'"></div>'
    +'<div class="field"><label>Parent / Guardian email</label><input id="euParentEmail" value="'+esc(u.parentEmail||'')+'"></div>'
    +'<div class="field"><label>PIN (4 digits)</label><input id="euPin" maxlength="4" value="'+esc(u.pin||'')+'"></div>'
    +'<div class="field"><label>Thumbprint enrolment ID</label><input id="euThumb" value="'+esc(u.thumbId||'')+'"></div>'
    +'</div>'
    +'<div class="divider"></div>'
    +'<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">'
      +'<img id="euPhoto" src="'+(u.faceThumb||'')+'" alt="" style="width:74px;height:74px;border-radius:12px;object-fit:cover;border:2px solid var(--line);background:#eee">'
      +'<div><div class="field" style="margin:0"><label>Face photo</label><input type="file" accept="image/*" id="euPhotoFile"></div>'
      +'<button class="mini-btn" style="margin-top:6px" onclick="removeUserPhoto()">Remove photo</button></div>'
    +'</div>'
    +'<div class="divider"></div>'
    +'<div class="field" style="margin:0"><label>Fingerprint on this device</label>'
      +'<p class="small" style="margin:0 0 6px">Status: <b id="euBioState">'+(u.thumbCred?'verified reader bound ✓':(u.thumbId?'enrolled (old, not verified)':'not enrolled'))+'</b></p>'
      +'<button class="mini-btn green" onclick="bindFingerprint(\''+u.id+'\')">👆 Bind fingerprint on this device</button>'
      +'</div>'
    +'<div class="btn-row" style="margin-top:16px">'
      +'<button class="btn btn-green" onclick="saveUserEdit(\''+u.id+'\')">💾 Save changes</button>'
      +'<button class="btn btn-gold" onclick="pdfProfile(\''+u.id+'\')">📄 PDF profile</button>'
      +'<button class="btn btn-ghost" onclick="closeEdit()">Cancel</button>'
    +'</div>'
  );
  const file=$('euPhotoFile');
  if(file) file.addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{ pendingPhoto=r.result; const img=$('euPhoto'); if(img) img.src=pendingPhoto; toast('New photo ready — save to apply.'); };
    r.readAsDataURL(f);
  });
};

window.removeUserPhoto=function(){
  pendingPhoto=null;
  const img=$('euPhoto'); if(img) img.src='';
  toast('Photo will be removed on save.');
};

window.bindFingerprint=function(id){
  if(needAdmin()) return;
  const bio=window.MIABio;
  if(!bio){ toast('Fingerprint engine not loaded.',true); return; }
  if(!bio.supported()){ toast('This browser cannot read fingerprints.',true); return; }
  const users=loadJSON(LS_USERS,[]);
  const u=users.find(x=>x.id===id);
  if(!u){ toast('Person not found.',true); return; }
  bio.available().then(function(ok){
    if(!ok){ toast('No fingerprint sensor or FIDO2 reader on this device.',true); return; }
    toast('Ask '+u.name+' to place the finger on the sensor…');
    return bio.enrol(u.name).then(function(credId){
      if(!credId){ toast('Fingerprint capture cancelled or failed.',true); return; }
      u.thumbCred=credId;
      u.thumbId='THUMB-'+String(credId).slice(0,8).replace(/[^a-z0-9]/gi,'');
      u.updatedAt=new Date().toISOString();
      saveJSON(LS_USERS,users);
      const st=$('euBioState'); if(st){ st.textContent='verified reader bound ✓'; }
      const th=$('euThumb'); if(th){ th.value=u.thumbId; }
      toast('Fingerprint verified and bound for '+u.name+'.');
      resyncSoon();
    });
  });
};
window.saveUserEdit=function(id){
  if(needAdmin()) return;
  const users=loadJSON(LS_USERS,[]);
  const u=users.find(x=>x.id===id);
  if(!u){ toast('Person not found.',true); return; }
  const name=($('euName').value||'').trim();
  if(!name){ toast('Name cannot be empty.',true); return; }
  const pin=($('euPin').value||'').trim();
  if(pin && !/^\d{4}$/.test(pin)){ toast('PIN must be 4 digits.',true); return; }

  u.name=name;
  u.role=$('euRole').value;
  u.classDept=($('euClass').value||'').trim();
  u.gender=$('euGender').value;
  u.phone=($('euPhone').value||'').trim();
  u.parentPhone=($('euParentPhone').value||'').trim();
  u.email=($('euEmail').value||'').trim();
  u.parentEmail=($('euParentEmail').value||'').trim();
  u.pin=pin;
  const newThumb=($('euThumb').value||'').trim();
  if(newThumb!==(u.thumbId||'')){ u.thumbCred=null; }   /* id changed -> verification must be re-bound */
  u.thumbId=newThumb;
  if(pendingPhoto!==undefined) u.faceThumb=pendingPhoto;
  u.updatedAt=new Date().toISOString();

  saveJSON(LS_USERS,users);
  pendingPhoto=undefined;
  closeEdit();
  toast('Saved: '+u.name);
  if(typeof renderAll==='function') renderAll();
  resyncSoon();
};

/* -------------------------------------------------------- edit record */
function toTimeVal(iso){
  if(!iso) return '';
  const d=new Date(iso);
  if(isNaN(d)) return '';
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function fromDateAndTime(dateStr,timeStr){
  if(!dateStr||!timeStr) return null;
  const d=new Date(dateStr+'T'+timeStr+':00');
  return isNaN(d)?null:d.toISOString();
}

window.editRecord=function(recId){
  if(needAdmin()) return;
  const att=loadJSON(LS_ATT,[]);
  const r=att.find(x=>x.id===recId);
  if(!r){ toast('Record not found.',true); return; }
  const users=loadJSON(LS_USERS,[]);
  const u=users.find(x=>x.id===r.userId)||{name:'(removed)'};
  openModal(
    '<h3>✏️ Edit attendance record</h3>'
    +'<p class="small"><b>'+esc(u.name)+'</b> — '+esc(r.userId)+'</p>'
    +'<div class="form-grid" style="margin-top:12px">'
    +'<div class="field"><label>Date</label><input type="date" id="erDate" value="'+esc(r.date)+'"></div>'
    +'<div class="field"><label>Clock in</label><input type="time" id="erIn" value="'+toTimeVal(r.clockIn)+'"></div>'
    +'<div class="field"><label>Clock out</label><input type="time" id="erOut" value="'+toTimeVal(r.clockOut)+'"></div>'
    +'<div class="field"><label>Status</label><select id="erStatus">'
      +['Present','Late','Very Late'].map(s=>'<option'+(s===r.status?' selected':'')+'>'+s+'</option>').join('')
    +'</select></div>'
    +'<div class="field"><label>Method</label><input id="erMethod" value="'+esc(r.method||'')+'"></div>'
    +'</div>'
    +'<div class="btn-row" style="margin-top:16px">'
      +'<button class="btn btn-green" onclick="saveRecordEdit(\''+r.id+'\')">💾 Save</button>'
      +'<button class="btn btn-ghost" onclick="deleteRecord(\''+r.id+'\');closeEdit()">🗑 Delete record</button>'
      +'<button class="btn btn-ghost" onclick="closeEdit()">Cancel</button>'
    +'</div>'
  );
};

window.saveRecordEdit=function(recId){
  if(needAdmin()) return;
  const att=loadJSON(LS_ATT,[]);
  const r=att.find(x=>x.id===recId);
  if(!r){ toast('Record not found.',true); return; }
  const date=$('erDate').value;
  if(!date){ toast('Date is required.',true); return; }
  const inTime=$('erIn').value, outTime=$('erOut').value;
  r.date=date;
  r.clockIn=inTime?fromDateAndTime(date,inTime):null;
  r.clockOut=outTime?fromDateAndTime(date,outTime):null;
  if(r.clockIn && r.clockOut && new Date(r.clockOut)<new Date(r.clockIn)){
    toast('Clock out is before clock in — please check.',true); return;
  }
  r.status=$('erStatus').value;
  r.method=($('erMethod').value||'').trim();
  r.editedAt=new Date().toISOString();
  saveJSON(LS_ATT,att);
  closeEdit();
  toast('Record updated.');
  if(typeof renderAll==='function') renderAll();
  resyncSoon();
};

/* ------------------------------------------------------------ re-sync */
let syncTimer=null;
function resyncSoon(){
  if(typeof window.syncNow!=='function') return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{ try{ window.syncNow(); }catch(e){} },1200);
}

/* --------------------------------------------------- school identity */
function applyBranding(){
  const s=settings();
  const name=s.schoolName||"MAKNAZUL 'IRFAN ACADEMY";
  const motto=s.schoolMotto||'Know Me Before You Worship Me';
  const h=$('brandTitle'); if(h) h.textContent=name;
  const sub=$('brandSub'); if(sub) sub.textContent=s.schoolTagline||'Smart Clock In / Out System • Students & Staff';
  const fn=$('footerNote'); if(fn) fn.textContent=motto+(s.schoolAddress?' • '+s.schoolAddress:'');
  document.title=name+' — Smart Clock In / Out System';
}
window.applyBranding=applyBranding;

function buildIdentityCard(){
  const sub=$('sub-settings'); if(!sub || $('identityCard')) return;
  const s=settings();
  const card=document.createElement('div');
  card.className='admin-card'; card.id='identityCard';
  card.innerHTML='<h4>🏫 School identity</h4>'
    +'<p class="small">Shown in the header, the footer and on every PDF.</p>'
    +'<div class="field"><label>School name</label><input id="idName" value="'+esc(s.schoolName||"MAKNAZUL 'IRFAN ACADEMY")+'"></div>'
    +'<div class="field" style="margin-top:8px"><label>Motto</label><input id="idMotto" value="'+esc(s.schoolMotto||'Know Me Before You Worship Me')+'"></div>'
    +'<div class="field" style="margin-top:8px"><label>Subtitle</label><input id="idTagline" value="'+esc(s.schoolTagline||'Smart Clock In / Out System • Students & Staff')+'"></div>'
    +'<div class="field" style="margin-top:8px"><label>Address (printed on PDFs)</label><input id="idAddress" value="'+esc(s.schoolAddress||'')+'" placeholder="e.g. 12 Ahmadu Bello Way, Lagos"></div>'
    +'<div class="field" style="margin-top:8px"><label>Phone (printed on PDFs)</label><input id="idPhone" value="'+esc(s.schoolPhone||'08084929862')+'"></div>'
    +'<div class="btn-row"><button class="btn btn-green" onclick="saveIdentity()">💾 Save identity</button></div>';
  sub.appendChild(card);
}
window.saveIdentity=function(){
  const s=settings();
  s.schoolName=($('idName').value||'').trim()||"MAKNAZUL 'IRFAN ACADEMY";
  s.schoolMotto=($('idMotto').value||'').trim();
  s.schoolTagline=($('idTagline').value||'').trim();
  s.schoolAddress=($('idAddress').value||'').trim();
  s.schoolPhone=($('idPhone').value||'').trim();
  saveJSON(LS_SETTINGS,s);
  applyBranding();
  toast('School identity saved.');
};

/* ============================== PDF CORE ==============================
   Pure model builders + doc drawing, so they can be tested outside the
   browser. No DOM access in here.                                     */
const GREEN=[10,61,42], GOLD=[201,162,39], GREY=[110,120,115], LIGHT=[245,241,230];

function buildProfileModel(user, records, cfg){
  const s=cfg||{};
  const mine=(records||[]).filter(r=>r.userId===user.id)
    .sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const present=mine.filter(r=>r.clockIn).length;
  const late=mine.filter(r=>r.status==='Late'||r.status==='Very Late').length;
  const out=mine.filter(r=>r.clockOut).length;
  return {
    school:{
      name:s.schoolName||"MAKNAZUL 'IRFAN ACADEMY",
      tagline:s.schoolTagline||'Smart Clock In / Out System',
      address:s.schoolAddress||'',
      phone:s.schoolPhone||''
    },
    person:{
      name:user.name||'', id:user.id||'', role:user.role||'',
      classDept:user.classDept||'', gender:user.gender||'',
      phone:user.phone||'', parentPhone:user.parentPhone||'',
      email:user.email||'', parentEmail:user.parentEmail||'',
      registered:user.createdAt?new Date(user.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'-',
      face:!!user.faceThumb, thumb:!!user.thumbId
    },
    summary:{ present, late, out, total:mine.length },
    rows:mine.slice(0,18).map(r=>({
      date:r.date||'', in:fmtTime(r.clockIn), out:r.clockOut?fmtTime(r.clockOut):'still in',
      duration:dur(r.clockIn,r.clockOut), status:r.status||'', method:r.method||''
    })),
    generated:new Date()
  };
}

function buildRecordsModel(records, users, filter, cfg){
  const s=cfg||{};
  const f=filter||{};
  const list=(records||[]).filter(r=>{
    const u=(users||[]).find(x=>x.id===r.userId)||{};
    if(f.from && String(r.date)<f.from) return false;
    if(f.to && String(r.date)>f.to) return false;
    if(f.role && (u.role||'')!==f.role) return false;
    if(f.status && r.status!==f.status) return false;
    if(f.search){
      const q=String(f.search).toLowerCase();
      if(!((u.name||'').toLowerCase().includes(q)||String(r.userId).toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a,b)=>String(b.date).localeCompare(String(a.date)));

  let present=0, late=0;
  const rows=list.map(r=>{
    const u=(users||[]).find(x=>x.id===r.userId)||{name:'(removed)',role:'-'};
    if(r.status==='Late'||r.status==='Very Late') late++;
    if(r.clockIn) present++;
    return {
      date:r.date||'', name:u.name||'', id:r.userId||'', role:u.role||'',
      in:fmtTime(r.clockIn), out:r.clockOut?fmtTime(r.clockOut):'-',
      status:r.status||'', method:r.method||''
    };
  });
  return {
    school:{
      name:s.schoolName||"MAKNAZUL 'IRFAN ACADEMY",
      tagline:s.schoolTagline||'Smart Clock In / Out System',
      address:s.schoolAddress||'', phone:s.schoolPhone||''
    },
    title:'Attendance Records',
    filter:f,
    rows, summary:{ total:rows.length, present, late },
    generated:new Date()
  };
}

function header(doc, school, subtitle){
  const W=210;
  doc.setFillColor(GREEN[0],GREEN[1],GREEN[2]);
  doc.rect(0,0,W,30,'F');
  doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]);
  doc.rect(0,30,W,1.2,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold'); doc.setFontSize(15);
  doc.text(school.name, 14, 14);
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.setTextColor(232,199,102);
  doc.text(subtitle, 14, 20.5);
  doc.setTextColor(255,255,255);
  const line=[school.address, school.phone].filter(Boolean).join('  •  ');
  if(line) doc.text(line, 14, 26);
  doc.setTextColor(30,30,30);
}

function footer(doc, page, totalPages){
  const W=210,H=297;
  doc.setDrawColor(220,215,200); doc.setLineWidth(0.3);
  doc.line(14,H-14,W-14,H-14);
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
  doc.text('MAKNAZUL attendance system - generated '+new Date().toLocaleString(), 14, H-9);
  doc.text('Page '+page+' of '+totalPages, W-14, H-9, {align:'right'});
}

function drawProfile(doc, M, img){
  const images=img||{};
  const W=210;
  header(doc, M.school, 'Student / Staff Profile');
  let y=40;

  // photo
  doc.setDrawColor(GOLD[0],GOLD[1],GOLD[2]); doc.setLineWidth(0.8);
  doc.rect(14, y, 32, 32);
  if(images.photo){
    try{ doc.addImage(images.photo, 'JPEG', 15, y+1, 30, 30); }catch(e){}
  } else {
    doc.setFontSize(7); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
    doc.text('no photo', 30, y+16, {align:'center'});
  }

  // QR
  if(images.qr){
    try{
      doc.addImage(images.qr, 'PNG', 168, y, 28, 28);
      doc.setFontSize(7); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
      doc.text('scan to clock in', 182, y+32, {align:'center'});
    }catch(e){}
  }

  // details
  const P=M.person;
  doc.setTextColor(30,30,30);
  doc.setFont('helvetica','bold'); doc.setFontSize(17);
  doc.text(P.name, 52, y+7);
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.setTextColor(GREEN[0],GREEN[1],GREEN[2]);
  doc.text(P.id+'   •   '+P.role+(P.classDept?'   •   '+P.classDept:''), 52, y+14);

  const pairs=[
    ['Gender', P.gender||'-'],
    ['Phone', P.phone||'-'],
    ['Guardian phone', P.parentPhone||'-'],
    ['Email', P.email||'-'],
    ['Guardian email', P.parentEmail||'-'],
    ['Registered', P.registered],
    ['Face enrolled', P.face?'Yes':'No'],
    ['Thumbprint', P.thumb?'Enrolled':'Not enrolled']
  ];
  let ly=y+22;
  doc.setFontSize(9);
  pairs.forEach(function(p){
    doc.setTextColor(GREY[0],GREY[1],GREY[2]);
    doc.text(p[0], 52, ly);
    doc.setTextColor(30,30,30);
    doc.text(String(p[1]), 86, ly);
    ly+=5.2;
  });

  // summary boxes (push below the details block so nothing overlaps)
  const boxY=Math.max(ly, y+32)+8, boxW=(W-28-6)/3;
  const items=[['Days present',M.summary.present],['Late arrivals',M.summary.late],['Total records',M.summary.total]];
  items.forEach(function(it,i){
    const x=14+i*(boxW+3);
    doc.setFillColor(LIGHT[0],LIGHT[1],LIGHT[2]);
    doc.roundedRect(x,boxY,boxW,17,2,2,'F');
    doc.setFontSize(7.5); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
    doc.text(it[0].toUpperCase(), x+3, boxY+6);
    doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(GREEN[0],GREEN[1],GREEN[2]);
    doc.text(String(it[1]), x+3, boxY+13.5);
    doc.setFont('helvetica','normal');
  });

  // table
  let ty=boxY+27;
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(30,30,30);
  doc.text('Recent attendance', 14, ty);
  ty+=4;
  const cols=[[14,'Date',30],[46,'Clock in',26],[74,'Clock out',26],[102,'Duration',26],[130,'Status',30],[162,'Method',34]];
  function head(){
    doc.setFillColor(GREEN[0],GREEN[1],GREEN[2]);
    doc.rect(14,ty,W-28,7,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica','bold');
    cols.forEach(function(c){ doc.text(c[1], c[0]+2, ty+4.8); });
    doc.setFont('helvetica','normal');
    ty+=7;
  }
  head();
  doc.setFontSize(8);
  if(!M.rows.length){
    doc.setTextColor(GREY[0],GREY[1],GREY[2]);
    doc.text('No attendance records yet.', 16, ty+5);
    ty+=10;
  }
  M.rows.forEach(function(r,i){
    if(ty>250){ doc.addPage(); footer(doc,2,2); ty=20; head(); doc.setFontSize(8); }
    if(i%2===0){ doc.setFillColor(250,248,240); doc.rect(14,ty,W-28,6.4,'F'); }
    doc.setTextColor(30,30,30);
    const vals=[r.date,r.in,r.out,r.duration,r.status,r.method];
    cols.forEach(function(c,j){ doc.text(String(vals[j]||''), c[0]+2, ty+4.4); });
    ty+=6.4;
  });

  doc.setDrawColor(220,215,200); doc.line(14,ty,W-14,ty);
  ty+=6;
  doc.setFontSize(7.5); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
  doc.text('This document is generated from the Academy attendance system. Times are recorded automatically.', 14, ty);

  footer(doc, 1, 1);
  return doc;
}

function drawRecords(doc, M, img){
  const images=img||{};
  const W=210;
  header(doc, M.school, 'Attendance Report');
  let y=40;

  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(30,30,30);
  doc.text(M.title, 14, y);
  y+=6;
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(GREY[0],GREY[1],GREY[2]);
  const bits=[];
  if(M.filter.from||M.filter.to) bits.push('Period: '+(M.filter.from||'start')+'  to  '+(M.filter.to||'today'));
  if(M.filter.role) bits.push('Role: '+M.filter.role);
  if(M.filter.status) bits.push('Status: '+M.filter.status);
  if(M.filter.search) bits.push('Search: '+M.filter.search);
  bits.push('Records: '+M.summary.total+'   Present: '+M.summary.present+'   Late: '+M.summary.late);
  doc.text(bits.join('     |     '), 14, y);
  y+=6;

  const cols=[[14,'Date',22],[36,'Name',40],[76,'User ID',28],[104,'Role',20],[124,'In',17],[141,'Out',17],[158,'Status',20],[178,'Method',18]];
  function head(){
    doc.setFillColor(GREEN[0],GREEN[1],GREEN[2]);
    doc.rect(14,y,W-28,7,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica','bold');
    cols.forEach(function(c){ doc.text(c[1], c[0]+1.5, y+4.8); });
    doc.setFont('helvetica','normal'); y+=7;
  }
  head();
  doc.setFontSize(7.6);

  if(!M.rows.length){
    doc.setTextColor(GREY[0],GREY[1],GREY[2]);
    doc.text('No records match these filters.', 16, y+6);
    y+=14;
  }

  let page=1;
  M.rows.forEach(function(r,i){
    if(y>262){
      footer(doc,page,0); doc.addPage(); page++;
      y=20; head(); doc.setFontSize(7.6);
    }
    if(i%2===0){ doc.setFillColor(250,248,240); doc.rect(14,y,W-28,6.2,'F'); }
    doc.setTextColor(30,30,30);
    const vals=[r.date,r.name,r.id,r.role,r.in,r.out,r.status,r.method];
    cols.forEach(function(c,j){
      let v=String(vals[j]==null?'':vals[j]);
      const maxChars=j===6?11:(j===7?8:(j===0?12:(j===1?26:14)));
      if(v.length>maxChars) v=v.slice(0,maxChars-1)+'.';
      doc.text(v, c[0]+1.5, y+4.2);
    });
    y+=6.2;
  });

  doc.setDrawColor(220,215,200); doc.line(14,y,W-14,y);
  y+=6;
  doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.setFont('helvetica','bold');
  doc.text('Total records: '+M.summary.total+'     Present: '+M.summary.present+'     Late: '+M.summary.late, 14, y);

  // fix page numbering
  const total=doc.getNumberOfPages();
  for(let p=1;p<=total;p++){ doc.setPage(p); footer(doc,p,total); }
  doc.setPage(1);
  return doc;
}

// expose for testing outside the browser
window.MIAPDF={ buildProfileModel, buildRecordsModel, drawProfile, drawRecords };

/* ------------------------------------------------------- PDF wrappers */
function getJsPDF(){
  if(window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if(window.jsPDF) return window.jsPDF;
  return null;
}

function loadDataURL(src){
  return new Promise(function(resolve){
    if(!src) return resolve(null);
    if(String(src).indexOf('data:')===0) return resolve(src);
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=function(){
      try{
        const c=document.createElement('canvas');
        c.width=img.width; c.height=img.height;
        c.getContext('2d').drawImage(img,0,0);
        resolve(c.toDataURL('image/jpeg',0.85));
      }catch(e){ resolve(null); }
    };
    img.onerror=function(){ resolve(null); };
    img.src=src;
  });
}

function qrDataURL(text,size){
  return new Promise(function(resolve){
    try{
      if(typeof QRCode==='undefined') return resolve(null);
      const holder=document.createElement('div');
      holder.style.cssText='position:fixed;left:-9999px;top:0';
      document.body.appendChild(holder);
      new QRCode(holder,{text:text,width:size,height:size,colorDark:'#0a3d2a',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
      setTimeout(function(){
        const cv=holder.querySelector('canvas');
        let url=null;
        if(cv) url=cv.toDataURL('image/png');
        else{
          const im=holder.querySelector('img');
          if(im && im.src) url=im.src;
        }
        holder.remove();
        resolve(url);
      },60);
    }catch(e){ resolve(null); }
  });
}

window.pdfProfile=async function(id){
  if(needAdmin()) return;
  const JsPDF=getJsPDF();
  if(!JsPDF){ toast('PDF library not loaded.',true); return; }
  const users=loadJSON(LS_USERS,[]);
  const u=users.find(x=>x.id===id);
  if(!u){ toast('Person not found.',true); return; }
  toast('Building PDF…');
  const att=loadJSON(LS_ATT,[]);
  const M=buildProfileModel(u,att,settings());
  const payload=(typeof qrPayloadFor==='function')?qrPayloadFor(u):('MIA|'+u.id);
  const imgs={
    photo: u.faceThumb?await loadDataURL(u.faceThumb):null,
    qr: await qrDataURL(payload,180)
  };
  const doc=new JsPDF({unit:'mm',format:'a4'});
  drawProfile(doc,M,imgs);
  const safe=String(u.name||'profile').replace(/[^a-z0-9]+/gi,'-').toLowerCase();
  doc.save('maknazul-'+safe+'-profile.pdf');
  toast('PDF generated.');
};

window.pdfRecords=async function(){
  if(needAdmin()) return;
  const JsPDF=getJsPDF();
  if(!JsPDF){ toast('PDF library not loaded.',true); return; }
  const att=loadJSON(LS_ATT,[]);
  if(!att.length){ toast('No attendance records yet.',true); return; }
  toast('Building PDF…');
  const users=loadJSON(LS_USERS,[]);
  const filter={
    from:$('pdfFrom')?$('pdfFrom').value:'',
    to:$('pdfTo')?$('pdfTo').value:'',
    role:$('pdfRole')?$('pdfRole').value:'',
    status:$('pdfStatus')?$('pdfStatus').value:'',
    search:$('pdfSearch')?$('pdfSearch').value:''
  };
  const M=buildRecordsModel(att,users,filter,settings());
  if(!M.rows.length){ toast('Nothing matches those filters.',true); return; }
  const doc=new JsPDF({unit:'mm',format:'a4'});
  drawRecords(doc,M,{});
  doc.save('maknazul-attendance-'+new Date().toISOString().slice(0,10)+'.pdf');
  toast('PDF generated: '+M.rows.length+' records.');
};

/* ------------------------------------------------------------ UI bits */
function buildPdfCard(){
  const sub=$('sub-settings'); if(!sub || $('pdfCard')) return;
  const card=document.createElement('div');
  card.className='admin-card'; card.id='pdfCard';
  card.innerHTML='<h4>📄 PDF exports</h4>'
    +'<p class="small">Generate a printable Attendance Records PDF. Leave the dates empty for everything.</p>'
    +'<div class="form-grid">'
    +'<div class="field"><label>From date</label><input type="date" id="pdfFrom"></div>'
    +'<div class="field"><label>To date</label><input type="date" id="pdfTo"></div>'
    +'<div class="field"><label>Role</label><select id="pdfRole"><option value="">All roles</option><option>Student</option><option>Teacher</option><option>Staff</option><option>Admin</option></select></div>'
    +'<div class="field"><label>Status</label><select id="pdfStatus"><option value="">All statuses</option><option>Present</option><option>Late</option><option>Very Late</option></select></div>'
    +'</div>'
    +'<div class="field" style="margin-top:8px"><label>Name or ID contains</label><input id="pdfSearch" placeholder="e.g. Aisha or MIA-2026"></div>'
    +'<div class="btn-row"><button class="btn btn-gold" onclick="pdfRecords()">📄 Attendance records PDF</button>'
    +'<button class="btn btn-green" onclick="pdfAllProfiles()">📚 All profiles PDF</button></div>';
  sub.appendChild(card);
}

window.pdfAllProfiles=async function(){
  if(needAdmin()) return;
  const JsPDF=getJsPDF();
  if(!JsPDF){ toast('PDF library not loaded.',true); return; }
  const users=loadJSON(LS_USERS,[]);
  if(!users.length){ toast('Nobody registered yet.',true); return; }
  toast('Building '+users.length+' profiles…');
  const att=loadJSON(LS_ATT,[]);
  const doc=new JsPDF({unit:'mm',format:'a4'});
  let first=true;
  for(const u of users){
    if(!first) doc.addPage();
    first=false;
    const M=buildProfileModel(u,att,settings());
    const payload=(typeof qrPayloadFor==='function')?qrPayloadFor(u):('MIA|'+u.id);
    const imgs={ photo:u.faceThumb?await loadDataURL(u.faceThumb):null, qr:await qrDataURL(payload,180) };
    drawProfile(doc,M,imgs);
  }
  doc.save('maknazul-all-profiles-'+new Date().toISOString().slice(0,10)+'.pdf');
  toast('All profiles exported.');
};

function addLogButton(){
  const bar=$('btnPrintLog');
  if(!bar || $('btnPdfLog')) return;
  const b=document.createElement('button');
  b.className='btn btn-gold admin-only-flex'; b.id='btnPdfLog';
  b.textContent='📄 PDF';
  b.style.cssText='padding:9px 14px;font-size:13px;margin-left:8px';
  b.onclick=function(){ pdfRecords(); };
  bar.parentNode.insertBefore(b, bar.nextSibling);
}

/* --------------------------------------------------------------- init */
function init(){
  applyBranding();
  buildIdentityCard();
  buildPdfCard();
  addLogButton();
  document.addEventListener('click',function(e){
    const tab=e.target.closest && e.target.closest('.admin-subtab');
    if(tab && tab.dataset.sub==='settings'){ setTimeout(function(){ buildIdentityCard(); buildPdfCard(); },50); }
    const panel=e.target.closest && e.target.closest('#tab-log, #btnAdminLogin');
    if(panel){ setTimeout(addLogButton,120); }
  });
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
