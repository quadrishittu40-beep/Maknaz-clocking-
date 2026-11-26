# Maknaz Clocking — MAKNAZUL 'IRFAN ACADEMY

Smart clock in / clock out attendance system for students and staff, with face detection, thumbprint enrolment, QR codes, Google Sheets cloud sync and email + WhatsApp alerts.

**No build step. No framework. No server to run.** Open `index.html` and it works.

---

## Quick start

1. Download or clone this repo.
2. Open `index.html` in a browser — done.

For camera features (face scan, QR scan) serve it over `http://localhost` or HTTPS, because browsers block camera access on `file://`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Admin login

| Field | Value |
|---|---|
| Email | `maknazulirfanacademy@gmail.com` |
| Password | `admin123` |

**Change the password immediately** in Admin Panel → ⚙️ Settings. The login is a client-side gate for the admin panel — it keeps students out of the settings, it is not a server-side security boundary.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app: terminal, registration wizard, attendance log, people list, ID cards, QR |
| `admin-features.js` | Admin login, Google Sheets sync, email/WhatsApp alert engine, admin panel |
| `admin.css` | Styles for the admin panel, KPIs, sync pill and alert log |
| `logo.png`, `logo-512.png` | Academy logo (header, favicon, ID cards) |
| `qrcode.min.js` | QR code generation (local, works offline) |
| `jsQR.js` | QR code scanning from the camera (local) |
| `face-api.min.js` | Face detection/recognition (local; falls back to photo matching) |
| `google-apps-script.gs` | Backend for Google Apps Script — sync + SMS/WhatsApp/email alerts + daily absence digest |
| `google-apps-script-plain.gs` | Same backend, pure ASCII — use this one if you're pasting from a phone |

The app is deliberately flat: every file sits at the repo root so it can be uploaded in one selection, including from a phone.

---

## How the cloud part works

```
Browser ──► Google Apps Script Web App ──► Google Sheet (Attendance / Users / Alerts)
                     └──► Email (Gmail) / SMS (optional) / WhatsApp links
```

The Apps Script URL is stored in `admin-features.js` as `DEFAULT_WEBHOOK`, so every device connects automatically with no setup.

**Backend setup** (one time, ~3 minutes):

1. Open the Google Sheet → **Extensions → Apps Script**
2. Paste `google-apps-script-plain.gs`, save
3. **Deploy → New deployment → Web app** — *Execute as: Me*, *Who has access: Anyone*
4. Copy the `/exec` URL and paste it into `DEFAULT_WEBHOOK` in `admin-features.js`

## Alerts

| Channel | Status |
|---|---|
| Email → `maknazulirfanacademy@gmail.com` | Live, needs no account or approval |
| Email → students/guardians with an address on file | Live |
| One-tap WhatsApp → guardians | Live (buttons in Admin → Overview and the Alert Log) |
| SMS | Optional — needs an approved sender ID from a provider such as Termii or Twilio. Configure it in the `CONFIG` block of the Apps Script file. |

The app checks `smsReady` from the backend on load and skips phone sends while SMS is unavailable, so the alert log never fills with failures.

## Attendance rules

School starts **07:30**, **Late** after **07:45**, **Very Late** after **08:30**. All editable in Admin → Settings.

First clock action of the day = Clock In, second = Clock Out. Duration is calculated automatically.

## Clock-in methods

Face Scan · QR Code · Thumbprint (hold-to-scan, WebAuthn attempt) · ID + PIN

Registration captures details, a face photo, a thumbprint enrolment, a PIN and generates a printable QR ID card.

Demo data seeds on first load — 6 users, all PIN `1234`, no face photos enrolled (use QR or ID + PIN). Reset anytime from the People tab.

## Notes

* Data lives in the browser's `localStorage` and mirrors to the Google Sheet when the backend is reachable. Records made offline queue and retry every 60 seconds.
* The Apps Script URL is public by design (that's what "Anyone" access means). Anyone with the URL could post rows. If that becomes a problem, redeploy the script to get a fresh URL.
* Camera access requires a secure context: `localhost` or HTTPS.

---

Built for MAKNAZUL 'IRFAN ACADEMY.
