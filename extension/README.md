# Time Tracker — Browser Extension

A Chrome extension side panel that embeds the **Time Tracker** app, giving you
instant access to start, stop, and track time entries without leaving your
current tab — and live timer updates on the toolbar badge.

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                   Chrome Toolbar                          │
│  [🔘 Time Tracker icon] → Opens side panel                │
│  [Badge: 1h23m]         → Live timer display              │
└─────────────────────────────────────────────────────────┘
         │                          ▲
         │ click                   │ TIMER_UPDATE
         ▼                          │
┌─────────────────────────────────────────────────────────┐
│              Side Panel (sidepanel.html)                  │
│  ┌───────────────────────────────────────────────────┐   │
│  │  <iframe> Time Tracker App (?embed=1)              │   │
│  │  - Start/stop timers                               │   │
│  │  - View running entry                              │   │
│  │  - Closes → app open link                          │   │
│  │                                                    │   │
│  │  postMessage({ type: 'CLOCKIFY_TIMER_STATE', ... }) │   │
│  └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Architecture

| Component            | File             | Role                                                            |
| -------------------- | ---------------- | --------------------------------------------------------------- |
| **Manifest**         | `manifest.json`  | Chrome MV3 declaration — permissions, icons, scripts            |
| **Service Worker**   | `background.js`  | Opens side panel on icon click; updates toolbar badge           |
| **Side Panel**       | `sidepanel.html` | Hosts the app in an iframe, wraps it in a loading overlay       |
| **Side Panel Logic** | `sidepanel.js`   | Relays timer state from iframe → background; captures page info |
| **Content Script**   | `content.js`     | Responds to page-info requests from the side panel              |
| **Styles**           | `sidepanel.css`  | Dark background, spinner, full-viewport iframe                  |
| **Configuration**    | `config.js`      | Single source of truth for the app URL                          |

## Setup

### 1. Choose Your App URL

Edit `extension/config.js` and set `APP_URL` to your running instance:

```js
// Development
const APP_URL = 'http://localhost:3000'

// Production (deployed on Vercel / DigitalOcean)
const APP_URL = 'https://time-tracker.your-domain.com'
```

### 2. Load the Extension in Chrome

1. Open **chrome://extensions**
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` directory (or `extension/dist/` if you ran the build script)

The extension icon will appear in the Chrome toolbar.

### 3. Configure Trusted Origins (Production)

For the production app to accept requests from the extension, you must add the
**Chrome extension origin** to the server's trusted origins.

Set the `CHROME_EXTENSION_ORIGIN` environment variable:

```
CHROME_EXTENSION_ORIGIN=chrome-extension://<your-extension-id>
```

> **Where to find your extension ID:**
> After loading the extension at `chrome://extensions`, the ID is shown on the
> extension card (a 32-character lowercase string like
> `abcdefghijklmnopabcdefghijklmnop`).

This can be set in:

- **Vercel**: Project Settings → Environment Variables
- **DigitalOcean**: App → Settings → Environment Variables
- **Local `.env`**: Add to `.env.local` in the project root (for dev testing)

### 4. CSP (Content Security Policy)

The app's `vercel.json` already includes the required CSP header:

```json
{
  "key": "Content-Security-Policy",
  "value": "frame-ancestors 'self' chrome-extension://*"
}
```

This allows the app to be embedded in any Chrome extension iframe. If you've
removed this, add it back.

## Usage

### Start Tracking

1. Click the Time Tracker icon in the Chrome toolbar → the side panel opens
2. The app loads inside the panel (in **embed mode** — no nav, no sidebar)
3. Start a timer as usual via the dashboard
4. The toolbar badge updates every second with the running time

### Stop Tracking

1. Open the side panel and stop the timer
2. The badge clears once the timer stops

### Open in Full App

While in the side panel, click **"Open in full app"** at the bottom of the
panel — it opens a new tab with the full Time Tracker interface.

### Page Context

When the side panel opens, it captures the active tab's title and URL and stores
it in `chrome.storage.session`. This is available for future features like
auto-filling the timer description with the page title.

## Build for Distribution

To package the extension for the Chrome Web Store:

```bash
# Development build
./extension/build.sh

# Production build (reads APP_URL or uses .env)
APP_URL=https://your-app.vercel.app ./extension/build.sh
# Or with a .env file:
echo "APP_URL=https://your-app.vercel.app" > extension/.env
./extension/build.sh --production
```

Output: `extension/dist/time-tracker-extension-<timestamp>.zip`

## Development Workflow

### Iterating on the extension

1. Make changes to files in `extension/`
2. Go to **chrome://extensions**
3. Click the **↻ (Reload)** button on the Time Tracker card
4. The side panel reflects changes immediately

### Updating the iframe URL

Edit `config.js` to switch between local dev and production:

```js
const APP_URL = 'http://localhost:3000' // ← for local dev
// const APP_URL = 'https://your-app.vercel.app'  // ← for production
```

No need to reload the extension — the side panel reads `config.js` on open.

### Testing embed mode

You can test the embed mode directly in the browser without the extension:

```
http://localhost:3000/app/time-tracker?embed=1
```

This renders a compact version with no nav, no sidebar, and a small footer link.

## Chrome Web Store Submission

When you're ready to publish:

1. Bump the `version` in `manifest.json`
2. Run the production build: `APP_URL=https://your-app.vercel.app ./extension/build.sh`
3. Upload `extension/dist/time-tracker-extension-<timestamp>.zip` to the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. Fill in store listing details (description, screenshots, promotional images)
5. Submit for review

### Store listing resources

- **Screenshot**: 1280×800px showing the side panel in action
- **Small promo tile**: 440×280px
- **Description**: "Track time effortlessly from your browser side panel. Start
  and stop timers without leaving your current tab, and see elapsed time on the
  toolbar badge."

## Files

```
extension/
├── config.js          # App URL configuration (edit this for your instance)
├── manifest.json      # Chrome Extension Manifest V3
├── background.js      # Service worker — badge updates, side panel behavior
├── content.js         # Content script — page info capture
├── sidepanel.html     # Side panel — iframe host with loading overlay
├── sidepanel.js       # Side panel logic — message relay, page info
├── sidepanel.css      # Side panel styles — dark theme, spinner
├── icons/             # Extension icons (16px, 48px, 128px)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── build.sh           # Build/packaging script
└── README.md          # This file
```
