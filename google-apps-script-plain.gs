// ===========================================================================
// MAKNAZUL 'IRFAN ACADEMY - Attendance backend (cloud sync + alerts)
// Plain ASCII version: safe to copy on a phone. No emoji, no smart quotes.
// Works whether this script is attached to the sheet OR standalone.
// ===========================================================================
//
// DEPLOY:
//   1. Select all code here, delete it, paste this whole file.
//   2. Ctrl+S and wait for "Saved".
//   3. Deploy > New deployment > Web app
//        Execute as:      Me
//        Who has access:  Anyone
//      > Deploy > Authorize > copy the /exec URL.
// ===========================================================================

var SHEET_ID = '1a1FC3y98DgSqS4hwrxY-zvIjAhaOE-gDrz49f2qbOpE';

var CONFIG = {
  provider: 'termii',                      // termii | twilio | whatsapp | none
  termiiKey: 'PASTE_TERMII_KEY_HERE',
  termiiSender: 'MAKNAZUL',
  twilioSid: '',
  twilioToken: '',
  twilioFrom: '',
  waToken: '',
  waPhoneId: '',
  emailEnabled: true,
  emailFromName: "MAKNAZUL 'IRFAN ACADEMY",
  adminEmail: 'maknazulirfanacademy@gmail.com',
  adminPhone: '08084929862',
  absenceCutoffTime: '08:30',
  sendAbsentDirect: true,
  sendAbsentSummary: true
};

var SHEET_ATTENDANCE = 'Attendance';
var SHEET_USERS = 'Users';
var SHEET_ALERTS = 'Alerts';

// ------------------------------ router -------------------------------------
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'absent') return json_(runAbsentDigest_());
  if (action === 'diagnose') return json_(diagnose_());
  return json_({
    ok: true,
    service: "MAKNAZUL 'IRFAN ACADEMY attendance backend",
    provider: CONFIG.provider,
    smsReady: smsReady_(),
    emailEnabled: CONFIG.emailEnabled,
    adminEmail: CONFIG.adminEmail,
    adminPhone: CONFIG.adminPhone,
    time: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.type === 'attendance') { appendRow_(SHEET_ATTENDANCE, body.row); return json_({ ok: true }); }
    if (body.type === 'user') { appendRow_(SHEET_USERS, body.row); return json_({ ok: true }); }
    if (body.type === 'alert') { appendRow_(SHEET_ALERTS, body.row); return json_({ ok: true }); }
    if (body.type === 'bulk') {
      if (body.attendance && body.attendance.length) writeBlock_(SHEET_ATTENDANCE, body.attendance, 9);
      if (body.users && body.users.length) writeBlock_(SHEET_USERS, body.users, 8);
      return json_({ ok: true, users: (body.users || []).length, attendance: (body.attendance || []).length });
    }
    if (body.type === 'send') return json_(sendAlert_(body.to, body.message || '', body.channel || 'auto', body.name || ''));
    if (body.type === 'test') return json_(sendAlert_(body.to, body.message || "Test message from MAKNAZUL 'IRFAN ACADEMY", body.channel || 'auto', 'TEST'));
    if (body.type === 'absent') return json_(runAbsentDigest_());
    return json_({ ok: false, error: 'Unknown type: ' + body.type });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------ sheets -------------------------------------
// Uses the bound spreadsheet when available, otherwise opens by ID so this
// works from a standalone project too.
function book_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  return SpreadsheetApp.openById(SHEET_ID);
}

function sheet_(name) {
  var ss = book_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    var headers = {
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
  var sh = sheet_(name);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(cols, sh.getLastColumn())).clearContent();
  if (!rows.length) return;
  var padded = rows.map(function (r) {
    var out = r.slice(0, cols);
    while (out.length < cols) out.push('');
    return out;
  });
  sh.getRange(2, 1, padded.length, cols).setValues(padded);
}

function readSheet_(name) {
  var sh = sheet_(name);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

// ------------------------------ phone --------------------------------------
function e164_(phone) {
  var p = String(phone || '').replace(/[^\d+]/g, '');
  if (!p) return '';
  if (p.indexOf('+') === 0) return p;
  if (p.indexOf('234') === 0) return '+' + p;
  if (p.charAt(0) === '0') return '+234' + p.slice(1);
  if (p.length === 10) return '+234' + p;
  return '+' + p;
}

// ------------------------------ alerts -------------------------------------
function smsReady_() {
  if (CONFIG.provider === 'termii') return !!CONFIG.termiiKey && CONFIG.termiiKey.indexOf('PASTE_') !== 0;
  if (CONFIG.provider === 'twilio') return !!(CONFIG.twilioSid && CONFIG.twilioToken && CONFIG.twilioFrom);
  if (CONFIG.provider === 'whatsapp') return !!(CONFIG.waToken && CONFIG.waPhoneId);
  return false;
}

function sendAlert_(to, message, channel, who) {
  var recipient = String(to || '').trim();
  if (!recipient) return { ok: false, status: 'failed', note: 'No recipient supplied' };

  var results = [];
  var isEmail = recipient.indexOf('@') > -1;
  var wantSms = !isEmail && (channel === 'auto' || channel === 'sms');
  var wantWa = !isEmail && (channel === 'auto' || channel === 'whatsapp');
  var wantMail = (channel === 'auto' || channel === 'email') && CONFIG.emailEnabled;

  if (wantSms) results.push(trySend_('sms', recipient, message));
  if (wantWa) results.push(trySend_('whatsapp', recipient, message));

  if (wantMail) {
    if (isEmail) results.push(trySend_('email', recipient, message));
    if (CONFIG.adminEmail && CONFIG.adminEmail.toLowerCase() !== recipient.toLowerCase())
      results.push(trySend_('email', CONFIG.adminEmail, message));
    if (!isEmail && !CONFIG.adminEmail)
      results.push({ channel: 'email', status: 'failed', note: 'no admin email configured' });
  }

  if (!results.length) results.push({ channel: 'none', status: 'failed', note: 'No channel enabled in CONFIG' });

  var lastSent = results.filter(function (r) { return r.status === 'sent'; });
  var overall = lastSent.length ? 'sent' : 'failed';
  try {
    appendRow_(SHEET_ALERTS, [
      new Date(),
      (who || 'System') + ' to ' + recipient,
      'ALERT',
      results.map(function (r) { return r.channel; }).join('+'),
      recipient,
      overall + (lastSent.length ? '' : ' (' + (results[0].note || '') + ')')
    ]);
  } catch (err) { }

  return {
    ok: overall === 'sent',
    status: overall,
    channel: results.map(function (r) { return r.channel; }).join('+'),
    note: results.map(function (r) { return r.channel + ':' + r.status + (r.note ? ' (' + r.note + ')' : ''); }).join(' | ')
  };
}

function trySend_(channel, to, message) {
  try {
    if (channel === 'sms') return sendSms_(to, message);
    if (channel === 'whatsapp') return sendWhatsApp_(to, message);
    if (channel === 'email') return sendEmail_(to, message);
  } catch (err) {
    return { channel: channel, status: 'failed', note: String(err) };
  }
  return { channel: channel, status: 'failed', note: 'unsupported channel' };
}

function sendSms_(to, message) {
  var num = e164_(to);
  if (!num) return { channel: 'sms', status: 'failed', note: 'bad number' };

  if (CONFIG.provider === 'termii') {
    if (!CONFIG.termiiKey || CONFIG.termiiKey.indexOf('PASTE_') === 0)
      return { channel: 'sms', status: 'failed', note: 'Paste your Termii API key into CONFIG.termiiKey' };
    var res = UrlFetchApp.fetch('https://api.termii.com/api/sms/send', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        to: num,
        from: CONFIG.termiiSender || 'MAKNAZUL',
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: CONFIG.termiiKey
      })
    });
    var bodyText = res.getContentText();
    var ok = res.getResponseCode() === 200 && bodyText.indexOf('"message_id"') > -1;
    return { channel: 'sms', status: ok ? 'sent' : 'failed', note: ok ? 'Termii' : bodyText.slice(0, 160) };
  }

  if (CONFIG.provider === 'twilio') {
    if (!CONFIG.twilioSid) return { channel: 'sms', status: 'failed', note: 'Twilio creds missing in CONFIG' };
    var rs = UrlFetchApp.fetch('https://api.twilio.com/2010-04-01/Accounts/' + CONFIG.twilioSid + '/Messages.json', {
      method: 'post',
      muteHttpExceptions: true,
      headers: { Authorization: 'Basic ' + Utilities.base64Encode(CONFIG.twilioSid + ':' + CONFIG.twilioToken) },
      payload: { To: num, From: CONFIG.twilioFrom, Body: message }
    });
    var okT = rs.getResponseCode() >= 200 && rs.getResponseCode() < 300;
    return { channel: 'sms', status: okT ? 'sent' : 'failed', note: okT ? 'Twilio' : rs.getContentText().slice(0, 160) };
  }

  return { channel: 'sms', status: 'failed', note: 'provider is ' + CONFIG.provider };
}

function sendWhatsApp_(to, message) {
  var num = e164_(to).replace('+', '');
  if (!CONFIG.waToken || !CONFIG.waPhoneId)
    return { channel: 'whatsapp', status: 'failed', note: 'WhatsApp token/phone-id missing in CONFIG' };
  var res = UrlFetchApp.fetch('https://graph.facebook.com/v21.0/' + CONFIG.waPhoneId + '/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + CONFIG.waToken },
    payload: JSON.stringify({ messaging_product: 'whatsapp', to: num, type: 'text', text: { body: message } })
  });
  var ok = res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  return { channel: 'whatsapp', status: ok ? 'sent' : 'failed', note: ok ? 'Meta Cloud API' : res.getContentText().slice(0, 160) };
}

function sendEmail_(to, message) {
  if (!to || to.indexOf('@') === -1) return { channel: 'email', status: 'failed', note: 'not an email address' };
  try {
    MailApp.sendEmail({
      to: to,
      subject: "MAKNAZUL 'IRFAN ACADEMY - Attendance Notice",
      name: CONFIG.emailFromName,
      body: message + "\n\n-- MAKNAZUL 'IRFAN ACADEMY attendance system"
    });
    return { channel: 'email', status: 'sent', note: 'MailApp' };
  } catch (err) {
    return { channel: 'email', status: 'failed', note: String(err) };
  }
}

// --------------------------- absent digest ---------------------------------
function runAbsentDigest_() {
  var users = readSheet_(SHEET_USERS);
  var att = readSheet_(SHEET_ATTENDANCE);
  if (!users.length) return { ok: false, error: 'No users in the Users sheet yet' };

  var tz = Session.getScriptTimeZone() || 'Africa/Lagos';
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var presentIds = {};
  att.forEach(function (r) {
    var d = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0] || '').slice(0, 10);
    if (d === today && r[2]) presentIds[String(r[2]).trim()] = true;
  });

  var absent = users.filter(function (u) {
    var id = String(u[0] || '').trim();
    return id && !presentIds[id];
  });
  if (!absent.length) return { ok: true, absent: 0, note: 'Everyone clocked in today' };

  var sent = [];
  absent.forEach(function (u) {
    var name = u[1] || 'Student', phone = u[5] || '', email = u[6] || '';
    var msg = 'Assalamu Alaikum. ' + name + ' (' + u[0] + ') has not clocked in today, '
      + Utilities.formatDate(new Date(), tz, 'dd MMM yyyy')
      + " at MAKNAZUL 'IRFAN ACADEMY. Please contact the school office if this is unexpected.";
    if (CONFIG.sendAbsentDirect) {
      if (phone) sendAlert_(phone, msg, 'auto', 'Absent/' + name);
      else if (email) sendAlert_(email, msg, 'email', 'Absent/' + name);
    }
    sent.push(name);
  });

  if (CONFIG.sendAbsentSummary && CONFIG.adminEmail) {
    var summary = absent.length + ' student(s) did not clock in today (' + today + '):\n\n'
      + absent.map(function (u, i) {
        return (i + 1) + '. ' + (u[1] || '?') + ' - ' + (u[0] || '?') + ' - '
          + (u[2] || '') + ' ' + (u[3] || '') + (u[5] ? ' - ' + u[5] : '');
      }).join('\n')
      + "\n\n-- MAKNAZUL 'IRFAN ACADEMY attendance system";
    sendEmail_(CONFIG.adminEmail, summary);
  }

  return { ok: true, absent: absent.length, names: sent };
}

function dailyAbsentJob() {
  var now = new Date();
  var cutoff = CONFIG.absenceCutoffTime || '08:30';
  var parts = cutoff.split(':');
  var h = Number(parts[0]), m = Number(parts[1]);
  var limit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if (now < limit) return;
  runAbsentDigest_();
}

function installDailyAbsentTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyAbsentJob') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyAbsentJob').timeBased().everyDays(1).atHour(8).nearMinute(30)
    .inTimezone('Africa/Lagos').create();
  return 'Daily absent trigger installed for 08:30 Africa/Lagos.';
}

// ------------------------------ self test ----------------------------------
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
      smsReady_() ? '[OK] SMS provider credential found' : '[X] SMS credential missing - paste your Termii key into CONFIG.termiiKey',
      CONFIG.emailEnabled ? '[OK] Email alerts enabled' : '[X] Email disabled',
      CONFIG.adminEmail ? '[OK] Admin email set: ' + CONFIG.adminEmail : '[X] No admin email',
      CONFIG.adminPhone ? '[OK] Admin phone set: ' + CONFIG.adminPhone : '[X] No admin phone',
      '[i] Run installDailyAbsentTrigger() once for automatic 08:30 absence alerts'
    ]
  };
}

function testSend() {
  var target = CONFIG.adminPhone || CONFIG.adminEmail;
  var out = sendAlert_(target, 'Test alert from your MAKNAZUL attendance backend. If you got this, alerts are LIVE.', 'auto', 'SELF TEST');
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
