# Tickr → Google Sheets automation (Apps Script)

Fills a day's **TIME IN · TIME OUT · HOURS OF WORK · DETAILS** into a sheet from
the Tickr public API, using the employee identity that already sits in the sheet
(`Zackery Alline Fajardo (seo@filepino.com)`).

## How it works

```
sheet cell "Name (email)"
        │  parse name + email
        ▼
GET /api/v1/members?search=<email|name>      → member id / canonical email
        │
        ├── GET /api/v1/dtr-integration?user=<email>&date=<today>
        │        → timeIn.local · timeOut.local · totalHours
        │
        └── GET /api/v1/member-day-activity?user=<email>&date=<today>
                 → entries[] → DETAILS
        │
        ▼
find the row in the DATE column matching <today>  →  write C/D/E/F
```

The two day endpoints take a plain `YYYY-MM-DD` date and do all timezone math
server-side against the **workspace** timezone, so the script never has to.

## Files

| File              | Responsibility                                                             |
| ----------------- | -------------------------------------------------------------------------- |
| `Config.gs`       | `CONFIG` (base URL, fallback credentials) and `LAYOUT` (sheet coordinates) |
| `Api.gs`          | Tickr API client — auth, request helper, endpoint wrappers                 |
| `Sheet.gs`        | Parse identity, find the date row, write the four fields                   |
| `Main.gs`         | Entry points, menu, per-sheet orchestration                                |
| `Secrets.gs`      | Git-ignored local API key (create this; see below)                         |
| `appsscript.json` | Manifest (timezone, V8 runtime, OAuth scopes)                              |

## Setup

### Option A — paste into the bound script

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Create files named `Config.gs`, `Api.gs`, `Sheet.gs`, `Main.gs`, `Secrets.gs`
   and paste each.
3. Open **Project Settings**, tick _Show "appsscript.json" manifest file_, and
   paste `appsscript.json`. Set the timezone to your workspace timezone.
4. Set the credential (below), then run `tickrSelfTest`.

### Option B — clasp (bi-directional sync)

```bash
pnpm dlx @google/clasp login
pnpm dlx @google/clasp clone <SCRIPT_ID> --rootDir appscript   # or `create`
pnpm dlx @google/clasp push
```

> `clasp` needs the script to be **container-bound** to the target spreadsheet
> (Extensions → Apps Script) or standalone with the sheet opened by ID.

### Set the credential

The script sends the workspace API key **directly** as `Authorization: Bearer`
(the `ApiKeyAuth` scheme). The preferred place to put it is a new, git-ignored
`appscript/Secrets.gs` file:

```js
const SECRETS = {
  apiKey: 'tickr_your_workspace_api_key',
}
```

Alternatively run this once from the editor, or set a Script Property in
**Project Settings → Script Properties**:

```js
setTickrCredential('tickr_your_workspace_api_key')
```

Generate the key in Tickr under **Workspace → Settings → API keys** (Owner/Admin).

| Source                       | Purpose                            |
| ---------------------------- | ---------------------------------- |
| `Secrets.gs` → `apiKey`      | Git-ignored local key (preferred)  |
| `TICKR_API_KEY` (property)   | Same key via Script Properties     |
| `TICKR_API_TOKEN` (property) | A ready JWT instead of the raw key |
| `TICKR_BASE_URL` (property)  | Override the deployment URL        |

> `Secrets.gs` is git-ignored, but `clasp push` still uploads it (clasp uses
> `.claspignore`, not `.gitignore`), so it works locally without entering git.

## Running

| Function                 | What it does                                                 |
| ------------------------ | ------------------------------------------------------------ |
| `tickrSelfTest()`        | Verifies the credential; logs the workspace + sample members |
| `previewToday()`         | Read-only: logs what it **would** write (no changes)         |
| `fillToday()`            | Fills today on every configured tab                          |
| `fillDate('2026-09-28')` | Backfill a specific date                                     |
| `setupDailyTrigger()`    | Creates a daily 19:00 trigger for `fillToday`                |

Once authorized, a **Tickr** menu appears in the sheet with the same actions.

> First run prompts for authorization (the script calls the Tickr API and edits
> this spreadsheet). Review and allow it.

## Testing order

1. `setTickrCredential('tickr_…')` (or put it in `Secrets.gs`)
2. `tickrSelfTest()` — confirm workspace + member lookup
3. `previewToday()` — confirm TIME IN/OUT/HOURS/DETAILS look right
4. `fillToday()` — write for real, then sanity-check one row

---

## Still needed to finalize the mapping

The API/logic side is complete; the **sheet layout** is the part that must match
your template. Right now `LAYOUT` in `Config.gs` assumes _one employee per tab_.
Please confirm:

1. **Layout** — one employee per tab, or many employees in one sheet?
2. **Identity cell** — which cell holds `Name (email)`? (default `B2`)
3. **Columns** — the exact columns for DATE, DAY, TIME IN, TIME OUT, HOURS OF
   WORK, DETAILS, and the header row / first data row.
4. **DATE format** — is the DATE column a real date or text, and what format
   (`2026-09-29`, `9/29/2026`, …)? Matching uses the sheet's display value.
5. **TIME format** — the API returns `9:05:00 AM`. Keep it, or trim to `9:05 AM`?
6. **HOURS format** — the API returns `8:30:00`. Keep it, or `8h 30m` / decimal?
7. **DETAILS format** — currently `Project / Task — description` per entry,
   newline-separated. Should it include the time range, tags, or billable flag?
8. **Missing row** — if today has no row yet, skip or append one?
9. **Timezone** — does the spreadsheet timezone match the Tickr workspace?

Answer those and I'll reshape `LAYOUT` / `Sheet.gs` to fit exactly.
