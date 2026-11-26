/**
 * ============================================================================
 * MAKNAZUL 'IRFAN ACADEMY — Cloud Sync + Server-Side Alerts (NO Vercel needed)
 * ============================================================================
 * One Apps Script deployment does three jobs:
 *   1. CLOUD SYNC  — receives users / attendance / alert rows and appends them
 *                    to the Attendance, Users and Alerts tabs.
 *   2. ALERTS      — sends real SMS / WhatsApp / Email from the server, so your
 *                    API keys live here (private) and never in the browser.
 *   3. AUTO ABSENT — a daily trigger emails/SMSes guardians of students who
 *                    never clocked in, plus a summary to the admin.
 *
 * ---------------------------------------------------------------------------
 * DEPLOY (3 minutes, one time)
 * ---------------------------------------------------------------------------
 * 1. Open your sheet:
 *    https://docs.google.com/spreadsheets/d/1a1FC3y98DgSqS4hwrxY-zvIjAhaOE-gDrz49f2qbOpE/edit
 * 2. Extensions → Apps Script → delete the sample code → paste this whole file.
 * 3. Edit the CONFIG block below (pick provider, paste keys, admin email).
 * 4. Save. Then Deploy → New deployment → Type: Web app
 *      Execute as:      Me
 *      Who has access:  Anyone
 *    → Deploy → Authorize → copy the Web App URL (ends in /exec).
 * 5. Paste that URL into the Academy app: Admin Login → Cloud Sync → Web App URL
 *    → tick "Enable Sheets sync" → Save → Test Connection.
 * 6. Run installDailyAbsentTrigger() once (in the Apps Script editor) if you
 *    want automatic absent alerts at 08:30 Africa/Lagos.
 * ============================================================================
 */

/* ====================== EDIT THIS BLOCK ONLY ============================== */
const CONFIG = {
  // 'termii' | 'twilio' | 'whatsapp' | 'none'
  // Leave as 'none' until you paste a key below — email alerts still work meanwhile.
  provider: 'termii',

  // --- Termii (Nigeria SMS, easiest local option) ---
  termiiKey: 'PASTE_TERMII_KEY_HERE',   // ← from termii.com dashboard (free trial credit on signup)
  termiiSender: 'MAKNAZUL',

  // --- Twilio (international SMS) ---
  twilioSid: '',
  twilioToken: '',
  twilioFrom: '',                // e.g. +1234567890

  // --- WhatsApp Cloud API (Meta) ---
  waToken: '',
  waPhoneId: '',

  // --- Email (free, always available through your Google account) ---
  emailEnabled: true,            // send by email as well / as fallback
  emailFromName: "MAKNAZUL 'IRFAN ACADEMY",

  // --- Who hears about problems (pre-filled for the Academy) ---
  adminEmail: 'maknazulirfanacademy@gmail.com',
  adminPhone: '08084929862',     // ← school admin WhatsApp/SMS line

  // --- Daily absent digest ---
  absenceCutoffTime: '08:30',    // after this, absentees are flagged
  sendAbsentDirect: true,        // message guardians directly
  sendAbsentSummary: true        // one summary to the admin
};
/* ========================================================================== */


const SHEET_ATTENDANCE = 'Attendance';
const SHEET_USERS      = 'Users';
const SHEET_ALERTS     = 'Alerts';

/* ------------------------------- ROUTER ---------------------------------- */
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.type) {

      case 'attendance':
        appendRow_(SHEET_ATTENDANCE, body.row); return json_({ ok: true });
      case 'user':
        appendRow_(SHEET_USERS, body.row); return json_({ ok: true });
      case 'alert':
        appendRow_(SHEET_ALERTS, body.row);
        return json_({ ok: true });
      case 'bulk':
        if (body.attendance && body.attendance.length) writeBlock_(SHEET_ATTENDANCE, body.attendance, 9);
        if (body.users && body.users.length) writeBlock_(SHEET_USERS, body.users, 8);
        return json_({ ok: true, users: (body.users || []).length, attendance: (body.attendance || []).length });

      /* ---- the app asks the SERVER to send a message ---- */
      case 'send':
        return json_(sendAlert_(body.to, body.message || '', body.channel || 'auto', body.name || ''));

      /* ---- admin taps "Send Test" ---- */
      case 'test':
        return json_(sendAlert_(body.to, body.message || 'Test message from MAKNAZUL \'IRFAN ACADEMY clock system.', body.channel || 'auto', 'TEST'));

      case 'absent':
        return json_(runAbsentDigest_());

      default:
        return json_({ ok: false, error: 'Unknown type: ' + body.type });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'absent') return json_(runAbsentDigest_());
  if (action === 'diagnose') return json_(diagnose_());
  return json_({
    ok: true,
    service: "MAKNAZUL 'IRFAN ACADEMY — Sync + Alerts (server-side, no Vercel)",
    provider: CONFIG.provider,
    smsReady: smsReady_(),
    emailEnabled: CONFIG.emailEnabled,
    adminEmail: CONFIG.adminEmail,
    adminPhone: CONFIG.adminPhone,
    time: new Date().toISOString()
  });
}

/** True when a real SMS provider credential is present. */
function smsReady_() {
  if (CONFIG.provider === 'termii')   return !!CONFIG.termiiKey && CONFIG.termiiKey.indexOf('PASTE_') !== 0;
  if (CONFIG.provider === 'twilio')   return !!(CONFIG.twilioSid && CONFIG.twilioToken && CONFIG.twilioFrom);
  if (CONFIG.provider === 'whatsapp') return !!(CONFIG.waToken && CONFIG.waPhoneId);
  return false;
}

/** Run from the editor (or GET ?action=diagnose) to see exactly what is configured. */
function diagnose_() {
  return {
    ok: true,
    provider: CONFIG.provider,
    smsReady: smsReady_(),
    emailReady: CONFIG.emailEnabled,
    adminEmail: CONFIG.adminEmail || '(not set)',
    adminPhone: CONFIG.adminPhone || '(not set)',
    absentCutoff: CONFIG.absenceCutoffTime,
    sheets: {
      attendance: sheet_(SHEET_ATTENDANCE).getLastRow() - 1,
      users: sheet_(SHEET_USERS).getLastRow() - 1,
      alerts: sheet_(SHEET_ALERTS).getLastRow() - 1
    },
    checklist: [
      smsReady_() ? '✅ SMS provider credential found' : '❌ SMS credential missing — paste your Termii key into CONFIG.termiiKey',
      CONFIG.emailEnabled ? '✅ Email alerts enabled' : '❌ Email disabled',
      CONFIG.adminEmail ? '✅ Admin email set: ' + CONFIG.adminEmail : '❌ No admin email',
      CONFIG.adminPhone ? '✅ Admin phone set: ' + CONFIG.adminPhone : '❌ No admin phone',
      'ℹ️ Run installDailyAbsentTrigger() once for automatic 08:30 absence alerts'
    ]
  };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------ SHEET I/O -------------------------------- */
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const headers = {
      Attendance: ['Date', 'Name', 'User ID', 'Role', 'Clock In', 'Clock Out', 'Duration', 'Status', 'Method'],
      Users: ['User ID', 'Name', 'Role', 'Class/Dept', 'Gender', 'Phone', 'Email', 'Registered At'],
      Alerts: ['Date/Time', 'User', 'Event', 'Channel', 'Recipient', 'Status']
    }[name];
    if (headers) { sh.appendRow(headers); sh.setFrozenRows(1); }
  }
  return sh;
}
function appendRow_(name, row) {
  if (!row) return;
  sheet_(name).appendRow(row);
}
function writeBlock_(name, rows, cols) {
  const sh = sheet_(name);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(cols, sh.getLastColumn())).clearContent();
  if (!rows.length) return;
  const padded = rows.map(r => {
    const out = r.slice(0, cols);
    while (out.length < cols) out.push('');
    return out;
  });
  sh.getRange(2, 1, padded.length, cols).setValues(padded);
}

/* ----------------------------- PHONE UTILS ------------------------------- */
function e164_(phone) {
  let p = String(phone || '').replace(/[^\d+]/g, '');
  if (!p) return '';
  if (p.indexOf('+') === 0) return p;
  if (p.indexOf('234') === 0) return '+' + p;
  if (p.charAt(0) === '0') return '+234' + p.slice(1);          // Nigerian local
  if (p.length === 10) return '+234' + p;
  return '+' + p;
}

/* --------------------------- ALERT DISPATCHER ---------------------------- */
/**
 * Sends one message. Channel: 'sms' | 'whatsapp' | 'email' | 'auto'.
 * 'auto' = provider SMS/WhatsApp, and email too when emailEnabled.
 * Always writes a row to the Alerts tab and returns a status object.
 */
function sendAlert_(to, message, channel, who) {
  const recipient = String(to || '').trim();
  if (!recipient) return { ok: false, status: 'failed', note: 'No recipient supplied' };

  const results = [];
  const isEmail = recipient.indexOf('@') > -1;
  const wantSms  = !isEmail && (channel === 'auto' || channel === 'sms');
  const wantWa   = !isEmail && (channel === 'auto' || channel === 'whatsapp');
  const wantMail = (channel === 'auto' || channel === 'email') && CONFIG.emailEnabled;

  if (wantSms) results.push(trySend_('sms', recipient, message));
  if (wantWa)  results.push(trySend_('whatsapp', recipient, message));

  if (wantMail) {
    // the recipient really is an email address -> deliver straight to them
    if (isEmail) results.push(trySend_('email', recipient, message));
    // plus an audit copy to the admin inbox (skipped if that IS the recipient)
    if (CONFIG.adminEmail && CONFIG.adminEmail.toLowerCase() !== recipient.toLowerCase())
      results.push(trySend_('email', CONFIG.adminEmail, message));
    if (!isEmail && !CONFIG.adminEmail)
      results.push({ channel: 'email', status: 'failed', note: 'no admin email configured' });
  }

  if (!results.length) results.push({ channel: 'none', status: 'failed', note: 'No channel enabled in CONFIG' });

  // log every attempt in the Alerts tab
  const lastSent = results.filter(r => r.status === 'sent');
  const overall = lastSent.length ? 'sent' : 'failed';
  try {
    appendRow_(SHEET_ALERTS, [
      new Date(),
      (who || 'System') + ' → ' + recipient,
      'ALERT',
      results.map(r => r.channel).join('+'),
      recipient,
      overall + (lastSent.length ? '' : ' (' + (results[0].note || '') + ')')
    ]);
  } catch (err) { /* sheet logging must never break sending */ }

  return {
    ok: overall === 'sent',
    status: overall,
    channel: results.map(r => r.channel).join('+'),
    note: results.map(r => r.channel + ': ' + r.status + (r.note ? ' (' + r.note + ')' : '')).join(' | ')
  };
}

function trySend_(channel, to, message) {
  try {
    if (channel === 'sms')      return sendSms_(to, message);
    if (channel === 'whatsapp') return sendWhatsApp_(to, message);
    if (channel === 'email')    return sendEmail_(to, message);
  } catch (err) {
    return { channel: channel, status: 'failed', note: String(err) };
  }
  return { channel: channel, status: 'failed', note: 'unsupported channel' };
}

function sendSms_(to, message) {
  const num = e164_(to);
  if (!num) return { channel: 'sms', status: 'failed', note: 'bad number' };

  if (CONFIG.provider === 'termii') {
    if (!CONFIG.termiiKey || CONFIG.termiiKey.indexOf('PASTE_') === 0)
      return { channel: 'sms', status: 'failed', note: 'Paste your Termii API key into CONFIG.termiiKey (line 42)' };
    const res = UrlFetchApp.fetch('https://api.termii.com/api/sms/send', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({
        to: num, from: CONFIG.termiiSender || 'MAKNAZUL',
        sms: message, type: 'plain', channel: 'generic', api_key: CONFIG.termiiKey
      })
    });
    const body = res.getContentText();
    const ok = res.getResponseCode() === 200 && body.indexOf('"message_id"') > -1;
    return { channel: 'sms', status: ok ? 'sent' : 'failed', note: ok ? 'Termii' : body.slice(0, 160) };
  }

  if (CONFIG.provider === 'twilio') {
    if (!CONFIG.twilioSid) return { channel: 'sms', status: 'failed', note: 'Twilio creds missing in CONFIG' };
    const res = UrlFetchApp.fetch(
      'https://api.twilio.com/2010-04-01/Accounts/' + CONFIG.twilioSid + '/Messages.json', {
        method: 'post', muteHttpExceptions: true,
        headers: { Authorization: 'Basic ' + Utilities.base64Encode(CONFIG.twilioSid + ':' + CONFIG.twilioToken) },
        payload: { To: num, From: CONFIG.twilioFrom, Body: message }
      });
    const ok = res.getResponseCode() >= 200 && res.getResponseCode() < 300;
    return { channel: 'sms', status: ok ? 'sent' : 'failed', note: ok ? 'Twilio' : res.getContentText().slice(0, 160) };
  }

  return { channel: 'sms', status: 'failed', note: 'provider is "' + CONFIG.provider + '" (set CONFIG.provider to termii or twilio)' };
}

function sendWhatsApp_(to, message) {
  const num = e164_(to).replace('+', '');
  if (!CONFIG.waToken || !CONFIG.waPhoneId)
    return { channel: 'whatsapp', status: 'failed', note: 'WhatsApp token/phone-id missing in CONFIG' };

  const res = UrlFetchApp.fetch('https://graph.facebook.com/v21.0/' + CONFIG.waPhoneId + '/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + CONFIG.waToken },
    payload: JSON.stringify({ messaging_product: 'whatsapp', to: num, type: 'text', text: { body: message } })
  });
  const ok = res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  const body = res.getContentText();
  // NOTE: business-initiated WhatsApp needs an approved template after 24h of silence.
  return { channel: 'whatsapp', status: ok ? 'sent' : 'failed', note: ok ? 'Meta Cloud API' : body.slice(0, 160) };
}

function sendEmail_(to, message) {
  if (!to || to.indexOf('@') === -1) return { channel: 'email', status: 'failed', note: 'not an email address' };
  try {
    MailApp.sendEmail({
      to: to,
      subject: "MAKNAZUL 'IRFAN ACADEMY — Attendance Notice",
      name: CONFIG.emailFromName,
      body: message + '\n\n— MAKNAZUL \'IRFAN ACADEMY attendance system'
    });
    return { channel: 'email', status: 'sent', note: 'MailApp' };
  } catch (err) {
    return { channel: 'email', status: 'failed', note: String(err) };
  }
}

/* ------------------------- DAILY ABSENT DIGEST --------------------------- */
function runAbsentDigest_() {
  const users = readSheet_(SHEET_USERS);
  const att   = readSheet_(SHEET_ATTENDANCE);
  if (!users.length) return { ok: false, error: 'No users in the Users sheet yet' };

  const tz = Session.getScriptTimeZone() || 'Africa/Lagos';
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const presentIds = {};
  att.forEach(r => {
    const d = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0] || '').slice(0, 10);
    if (d === today && r[2]) presentIds[String(r[2]).trim()] = true;
  });

  const absent = users.filter(u => {
    const id = String(u[0] || '').trim();
    return id && !presentIds[id];
  });
  if (!absent.length) return { ok: true, absent: 0, note: 'Everyone clocked in today — ma sha Allah.' };

  const sent = [];
  absent.forEach(u => {
    const name = u[1] || 'Student', phone = u[5] || '', email = u[6] || '';
    const msg = "Assalamu Alaikum. " + name + " (" + u[0] + ") has not clocked in today, "
      + Utilities.formatDate(new Date(), tz, 'dd MMM yyyy')
      + " at MAKNAZUL 'IRFAN ACADEMY. Please contact the school office if this is unexpected.";
    if (CONFIG.sendAbsentDirect) {
      if (phone) sendAlert_(phone, msg, 'auto', 'Absent/' + name);
      else if (email) sendAlert_(email, msg, 'email', 'Absent/' + name);
    }
    sent.push(name);
  });

  if (CONFIG.sendAbsentSummary && CONFIG.adminEmail) {
    const summary = absent.length + " student(s) did not clock in today (" + today + "):\n\n"
      + absent.map((u, i) => (i + 1) + '. ' + (u[1] || '?') + ' — ' + (u[0] || '?') + ' — '
        + (u[2] || '') + ' ' + (u[3] || '') + (u[5] ? ' — ' + u[5] : '')).join('\n')
      + "\n\n— MAKNAZUL 'IRFAN ACADEMY attendance system";
    sendEmail_(CONFIG.adminEmail, summary);
  }

  return { ok: true, absent: absent.length, names: sent };
}

/** Called by the daily trigger (or manually). */
function dailyAbsentJob() {
  const now = new Date();
  const tz = Session.getScriptTimeZone() || 'Africa/Lagos';
  const cutoff = CONFIG.absenceCutoffTime || '08:30';
  const [h, m] = cutoff.split(':').map(Number);
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if (now < limit) return;                       // too early — do nothing
  runAbsentDigest_();
}

/** Run ONCE from the editor to schedule the 08:30 job. */
function installDailyAbsentTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'dailyAbsentJob') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyAbsentJob').timeBased().everyDays(1).atHour(8).nearMinute(30)
    .inTimezone('Africa/Lagos').create();
  return 'Daily absent trigger installed for ~08:30 Africa/Lagos.';
}

/* Read a sheet into a 2D array (values only). */
function readSheet_(name) {
  const sh = sheet_(name);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

/* ------------------------------ SELF TEST -------------------------------- */
/** Run from the editor: sends a test message to CONFIG.adminEmail / adminPhone. */
function testSend() {
  const target = CONFIG.adminPhone || CONFIG.adminEmail;
  const out = sendAlert_(target, 'Test alert from your MAKNAZUL attendance backend. If you got this, alerts are LIVE.', 'auto', 'SELF TEST');
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
