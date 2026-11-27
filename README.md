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
| `admin-edit.js` | Edit every person + attendance record, school identity, profile/records/absentee PDFs |
| `admin.css` | Admin panel / KPI / sync pill / alert log / edit modal styles |
| `google-apps-script.gs` | **The backend** — sync + email/WhatsApp alerts + daily absent job |
| `libs/` (`assets/`) | Local QR generate, QR scan, face-api, jsPDF, logo — flatten these into the root when hosting on GitHub Pages |
| `index-v1-backup.html` | Pre-admin version (no login/sync/alerts) |

## 🧪 Verified
* 42 attendance-integrity checks (jsdom): admin re-binding of a fingerprint; a clock-in is refused with no sensor, on a cancelled prompt, on a mismatched fingerprint and on an unbound legacy enrolment; a verified fingerprint records `Thumbprint`; enrolment needs a real sensor; Student/Staff switch filters the pickers, the face matcher and the log; admin gets exactly one mail per person per day (at clock out, showing arrival + duration), nothing at clock-in, with "every" and "off" modes both honoured.
* 47 edit/PDF checks (jsdom + jsPDF): every person field saved, bad PIN blocked, photo add/remove, record date/time/status/method edits, out-before-in blocked, identity saved and re-branded live, profile / records / all-profiles PDFs generated, role filter honoured, no console errors. Real PDFs rendered and eyeballed (layout, column widths, pagination).
* 18 absentee-report checks: empty days skipped, weekends optional, late joiners excluded until registered, students/staff kept apart, present people omitted, combined + split PDFs, 40-day pagination.
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
| Admin → Settings | 📅 **Daily absentees** | One combined file of everyone who never clocked in, day by day, with **students** and **staff** in separate sections (or two files). PDF or CSV. |

Everything is stored in the same local storage keys and re-synced to Google Sheets (`type:'attendance'` / `type:'user'`). PDFs are generated in the browser with the bundled `jspdf.umd.min.js` — no internet needed.

## 📅 Daily absentees (students and staff, one file)

**Admin → Settings → Daily absentees**. Pick From / To dates.

Each day is listed with two blocks: **STUDENTS ABSENT** (green table) and **STAFF ABSENT** (gold table). Anyone who never clocked in that day is named, with class/department and guardian phone.

- Default output is **one PDF** covering both groups.
- Switch **Output** to *Two files* if you want a student PDF and a staff PDF separately.
- **CSV** dumps the same rows (Date, Group, Name, User ID, Class / Dept, Guardian phone).
- Days with no clock-ins at all are skipped by default (so holidays do not fill the report). Saturdays and Sundays can be skipped too.
- People are only counted after their registration date.

## 👆 Fingerprint clock-in (real verification)

A web page cannot read a fingerprint by itself — it has to ask the device. So the thumb method now works like this:

1. Select your name, then **hold the sensor for 2 seconds**.
2. The device asks for the **real** fingerprint (phone/tablet sensor, Windows Hello, or a USB FIDO2 fingerprint reader).
3. Only a **verified** fingerprint records the clocking. Cancelled prompt, wrong finger, no sensor, or a fingerprint enrolled on another person → **nothing is saved** and the screen says why.

Enrolment happens in the Register wizard (Face → Fingerprint → PIN). The credential is bound to that person, so one person's finger can never clock in someone else.

**Devices without a sensor:** the thumb button refuses and points to Face, QR or ID + PIN — that is the honest behaviour, because there is no fingerprint to check. For a reception kiosk, a cheap USB FIDO2 fingerprint reader (e.g. a FIDO2 key with a fingerprint sensor) plugs in and works in Chrome/Edge on the same page.

**Existing people** enrolled before this change have no bound credential, so their thumb stops working until they re-enrol. Admin can fix it per person: **People → ✏️ Edit → 👆 Bind fingerprint on this device**.

## 🎓 Student / Staff attendance

The clock terminal has an **Attendance for: Everyone / Students / Staff** switch. It filters the name pickers and the face-matcher, shows the head-count of each group, and remembers the choice on that device. The Attendance Log gains **🎓 All Students** and **👔 All Staff** in its role filter, and the PDF exports filter by role too.

## 📣 Admin clocking notice (one mail per person per day)

**Admin → Alerts → 📣 Admin clocking notice** is set to **"One email per person, sent at clock out"**. Nothing is mailed at arrival; the moment the person clocks out, the admin (default `maknazulirfanacademy@gmail.com`) gets a single mail that contains both times:

```
ADMIN NOTICE - CLOCK OUT: Aisha Bello (Student - JSS 2A) - Student.
Clocked OUT at 02:05 PM on Mon, 24 Nov 2026. Arrived 07:31 AM.
Duration 6h 34m. Status: Present. Method: QR. User ID: MIA-2026-001.
```

Two other modes are available in the same dropdown: **on every clock in and clock out**, and **off**. Each notice is also listed in **Admin → Alerts → Alert Log** with a `sent` / `queued` / `failed` status. The wording is editable in **Settings → Message templates → Admin clocking notice**; variables: `{name} {id} {role} {classbit} {audience} {action} {time} {intime} {outtime} {duration} {date} {status} {method} {start}`.

> **Arrival alerts still go to students and parents** — the per-person clock-in/late messages are controlled separately by the *Alert on Clock In* / *Alert on Late* switches. Only the admin copy was reduced to one mail.

> **Gmail sending limit:** a free Gmail account can send about **100 emails a day** through Apps Script. Two mails per person per day (in + out) plus student/guardian copies can reach that. If you expect more than ~25 clockings a day with everyone's copies on, either turn off the student/guardian email copies (the Alerts sheet still records everything) or use a Google Workspace account (1,500/day). Nothing is lost when the limit is hit — the attendance itself and the Alerts sheet row are still saved locally and in Sheets.
