# MAKNAZUL 'IRFAN ACADEMY — Smart Clock In / Out System (v3)

> **Configured for the Academy**
> Admin login: `maknazulirfanacademy@gmail.com` / `admin123`
> Alerts to: `maknazulirfanacademy@gmail.com` and `08084929862` (WhatsApp: https://wa.me/2348084929862)
> All alert defaults are already switched on — Clock In, Clock Out, Late, Absent, parent copy, admin summary.

Islamic-styled attendance terminal for students and staff: face detection, thumbprint enrollment, QR codes, Google Sheets cloud sync, and **automatic** SMS / WhatsApp / email alerts — all hosted free, with **no Vercel and no Supabase**.

Architecture:

```
Student/Staff device (browser)          Google Apps Script (server)         Providers
──────────────────────────────          ───────────────────────────         ─────────
clock in/out ──► localStorage           doPost()
                   │                      ├─ append row  ──► Google Sheet (Attendance/Users/Alerts)
                   └─ fetch POST ────────►├─ type:"send" ──► Termii SMS / Twilio / WhatsApp / Email
                                          └─ type:"absent" ─► daily absentee digest
```

Only the public Web App URL ever reaches the browser. **API keys live inside the Apps Script**, never in the page.

---

## ▶ Run locally
```bash
cd maknazul-irfan-clockin
python3 -m http.server 8000
# open http://localhost:8000
```
Camera features (face scan, QR scan) need `http://localhost` or HTTPS.

## 🔐 Admin login
Click **🔐 Admin Login** (top-right).

| Field | Value |
|---|---|
| Email | `maknazulirfanacademy@gmail.com` |
| Password | `admin123` |

Change it immediately in **Admin Panel → Settings → Change admin password** (default is flagged until you do). The Admin tab, panel and all sync/alert controls stay invisible to students until an admin logs in. Sessions last 8 hours; **Logout** ends one.

## ✅ Backend is LIVE (verified 25 Nov 2026)

`https://script.google.com/macros/s/AKfycbyWazVEm3M58y5CRhczhKiIRLdPGRUr7Rr4hxMA0Go-7gIQoaiaJVXl88Ile85s6bxWwQ/exec`

This URL is baked into the app, so every device connects with no setup. Verified by real round-trips:
- `GET` returns `{"ok":true,...,"emailEnabled":true}`
- a real email arrived at maknazulirfanacademy@gmail.com (`status: sent`, `note: email:sent (MailApp)`)
- attendance and user rows landed in the correct sheet tabs
- `smsReady: false` until a Termii key is added

## ☁️ Step 1 — Cloud sync + alert backend (one setup, ~4 min)

Your sheet is already created:
**https://docs.google.com/spreadsheets/d/1a1FC3y98DgSqS4hwrxY-zvIjAhaOE-gDrz49f2qbOpE/edit**

Tabs: **Attendance** (date, name, ID, role, in, out, duration, status, method) · **Users** · **Alerts**.

1. Open the sheet → **Extensions → Apps Script**.
2. Delete the sample code, paste the entire contents of **`google-apps-script.gs`**.
3. At the top, edit the `CONFIG` block — set `provider` to `termii` / `twilio` / `whatsapp`, paste your key(s), and set `adminEmail` + `adminPhone`.
4. **Save** → **Deploy → New deployment → Web app**
   *Execute as:* **Me** · *Who has access:* **Anyone** → **Deploy** → authorise → copy the URL ending in `/exec`.
5. In the app: **Admin Login → Admin Panel → Cloud Sync** → paste that URL → tick **Enable Sheets sync** → **Save** → **Test Connection** (should report your provider) → **Sync Now** to push existing records.
6. *(Optional, for hands-off absent alerts)* In the Apps Script editor run **`installDailyAbsentTrigger()`** once — creates a daily job at **08:30 Africa/Lagos**. Run **`testSend()`** any time to prove sending works.

After step 5, every clock in/out, registration and alert is written to the sheet automatically. Offline records queue in the browser and retry every 60 seconds; the top-bar pill reads `☁️ Local Only` → `☁️ 3 pending` → `☁️ Sheets Synced`.


## ✉️ Email alerts — free, no signup, no key
This is the default path and needs nothing but the one-time Apps Script deploy.
Every clock in/out copies to **maknazulirfanacademy@gmail.com**, students with an email on file get their own copy,
and guardians can be included by capturing their email at registration.
SMS to phones is the only optional/paid extra (Termii key); the Alert Log's one-tap WhatsApp/SMS buttons cover that gap for free.

## 💬 Step 2 — Turn on automatic alerts

**Admin Panel → Alerts**

* **Provider:** ⭐ **Google Apps Script backend** (recommended — auto-send, keys server-side).
* **Send alerts as:** Auto (SMS + WhatsApp + email copy) / SMS only / WhatsApp only / Email only.
* **Toggles:** Clock In · Clock Out · Late arrival · Absent · Admin summary copy · Also alert Parent/Guardian.
* **Templates** use `{name} {time} {date} {status} {start}`.

| Provider | Key needed | Notes |
|---|---|---|
| **Termii** | `termiiKey` + sender ID | Easiest in Nigeria; sender ID like `MAKNAZUL`. |
| **Twilio** | SID + token + from | International SMS. |
| **WhatsApp Cloud API** | `waToken` + `waPhoneId` | Business-initiated messages need an approved template after 24h of silence. |
| **Email** | nothing (uses your Google account) | `emailEnabled: true` — free, unlimited-ish, good fallback. |
| **Manual** | nothing | Alert Log shows **WhatsApp** / **SMS** buttons that open `wa.me` / `sms:` pre-filled. Always works. |

Nigerian numbers are normalised automatically (`0803…` → `+234803…`). Parents get the same message as the student when *Also alert Parent/Guardian* is on and a parent phone was captured at registration.

**Absent alerts:** Admin → Alerts → **🔔 Run Absent Digest Now**, or let the 08:30 trigger do it. The Overview tab also lists today's absentees with one-click **📩 Send Absent Alert**.

## 📱 Alerts without SMS (current setup)

SMS is **parked** — Termii requires a CAC certificate and an approved Sender ID. The system runs on:

* **Email** — every clock in/out, late arrival and absence copies to maknazulirfanacademy@gmail.com, plus students/guardians who have an email on file. Verified with real deliveries.
* **One-tap WhatsApp** — Admin → Overview → *Absent Today* has a 📱 button per student; the Alert Log has one per phone row. Opens WhatsApp pre-filled, one tap sends.

The app checks `smsReady` from the backend on load and skips phone sends while SMS is unavailable, so the log never fills with failures. Add a Termii key later and the badge flips to `SMS: ON` with no other change.

## 📊 Attendance rules
* School starts **07:30**, **Late** after **07:45**, **Very Late** after **08:30** — editable in Admin → Settings → School times.
* First action of the day = Clock In, second = Clock Out; duration auto-computed.
* Log tab: filters, CSV export, print, delete. People tab: ID cards + QR passes.

## 🧩 Clock-in / registration methods
Face Scan · QR Code · Thumbprint (hold-to-scan, WebAuthn attempt) · ID + PIN. Registration wizard: Details → Face enrollment → Thumbprint + PIN + QR; printable QR ID cards.

Demo data seeds on first load — 6 users, PIN `1234`, no face photos (use QR or ID + PIN). Reset anytime from the People tab.

## 📁 Files
| File | Purpose |
|---|---|
| `index.html` | Main app (terminal, registration, log, people, ID cards, QR) |
| `admin-features.js` | Admin login, Sheets sync, alerts engine, admin panel |
| `admin-edit.js` | Edit every person + attendance record, school identity, profile/records PDF |
| `admin.css` | Admin panel / KPI / sync pill / alert log / edit modal styles |
| `google-apps-script.gs` | **The backend** — sync + email/WhatsApp alerts + daily absent job |
| `libs/` (`assets/`) | Local QR generate, QR scan, face-api, jsPDF, logo — flatten these into the root when hosting on GitHub Pages |
| `index-v1-backup.html` | Pre-admin version (no login/sync/alerts) |

## 🧪 Verified
* 47 edit/PDF checks (jsdom + jsPDF): every person field saved, bad PIN blocked, photo add/remove, record date/time/status/method edits, out-before-in blocked, identity saved and re-branded live, profile / records / all-profiles PDFs generated, role filter honoured, no console errors. Real PDFs rendered and eyeballed (layout, column widths, pagination).
* 19 frontend checks (jsdom): login accept/reject, admin visibility, panel render, settings persistence, clock hook → backend POST, alerts marked `sent`, parent recipient, sheet push, absent digest, logout.
* 16 backend checks: phone normalisation, Termii payload (E.164), Alerts sheet logging, attendance append, bulk rewrite, absentee detection + summary email, health endpoint, malformed-input handling.

## 🚀 Hosting
Any static host or even a USB stick / local machine — there is no build step and no server to run. For phones, serve over HTTPS so the camera works (`python3 -m http.server` is fine for a LAN demo with `--bind 0.0.0.0`).

## ✏️ Admin: edit anything + PDF

Log in as admin, then every card and every attendance row gets extra buttons.

| Where | Button | What it does |
|---|---|---|
| People tab, person card | ✏️ **Edit** | Change name, role, class/department, gender, phone, guardian phone, email, guardian email, 4-digit PIN, thumbprint enrolment ID, and the enrolled face photo (upload / remove). |
| People tab, person card | 📄 **PDF** | One-page profile PDF: photo, QR, all details, days present / late / total, and the last 18 attendance rows. |
| Attendance Log, each row | ✏️ | Fix the date, clock-in time, clock-out time, status (Present / Late / Very Late) and method (QR / Face / Thumbprint / ID + PIN). Can also delete the row. |
| Admin → Settings | 🏫 **School identity** | School name, motto, subtitle, address and phone — used in the header, the footer and on every PDF. |
| Admin → Settings | 📄 **PDF exports** | Attendance records PDF with From / To dates, role, status and name filters, plus a 📚 all-profiles PDF (one page per person). |

Everything is stored in the same local storage keys and re-synced to Google Sheets (`type:'attendance'` / `type:'user'`). PDFs are generated in the browser with the bundled `jspdf.umd.min.js` — no internet needed.
