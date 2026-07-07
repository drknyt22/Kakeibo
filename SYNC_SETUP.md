# Google Sheets Sync — one-time setup

This lets your devices share data through a Google Sheet you own, for free,
with no Google Cloud project or sign-in flow required in the app. The app
now tracks **two accounts** — 🇯🇵 Japan and 🇱🇰 Sri Lanka — switchable with the
pill buttons at the top of the screen. Both sync through the same Sheet, on
separate tabs.

Each calendar month gets its own tab per account, named "JP-YYYY-MM" and
"LK-YYYY-MM" (e.g. "JP-2026-07", "LK-2026-07"). New tabs are created
automatically as you log entries in a new month — you don't need to create
them yourself, and each new month's tab starts with a clean, empty list of
transactions (expenses reset) while your actual pool balances carry forward
unaffected — see "Balance carry-forward" below.

## 1. Create the Sheet
1. Go to sheets.google.com → New blank spreadsheet.
2. Name it whatever you like, e.g. "Kakeibo Data".
3. Leave it empty — the script creates tabs automatically as needed.

## 2. Add the script
1. In the Sheet: **Extensions → Apps Script**.
2. Delete any placeholder code in the editor.
3. Open `apps-script.gs` (included in this download) and paste its full contents in.
4. Near the top, change this line to your own secret phrase — anything, just keep it private:
   ```
   const SECRET = 'change-this-to-your-own-secret';
   ```
5. Save (Ctrl/Cmd+S).

## 3. Deploy as a Web App
1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → choose **Web app**.
3. Settings:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**.
5. The first time, Google will ask you to authorize the script — this is your own
   script running under your own account, so it's safe to approve.
6. Copy the **Web app URL** it gives you (ends in `/exec`).

## 4. Connect the app
1. Open the Kakeibo app → Settings → Google Sheets sync.
2. Paste the Web app URL into "Web App URL".
3. Type the same secret phrase into "Shared secret".
4. Tap **Save connection**, then **Sync now**.
5. Repeat steps on your other device (same URL, same secret) — do this once per device.

This one connection covers both accounts — there's nothing separate to set
up for Sri Lanka.

## How it behaves day to day
- Every time you open the app, it quietly syncs in the background if a connection is set.
- There's also a manual **Sync now** button in Settings if you want to force it
  (e.g. right before switching devices).
- Editing on both devices without syncing in between is fine for adding new
  entries — they merge. Deleting an entry only fully removes it everywhere once
  both devices have synced at least once after the deletion.
- Unlike the original single-account version, your **pool balances and
  account settings** (budgets, bank account names) now sync too — the newer
  copy (by timestamp) wins, so reconciling on one device and syncing carries
  that over to the other.

## Balance carry-forward
Your running balances (cash in hand, bank, investments, deposits,
lent-to-friends — for both Japan and Sri Lanka) are never reset by
the monthly tabs — they're a running total across every transaction you've
ever logged, plus whatever starting figures you reconciled in Settings.
A new month's Sheet tab only means a fresh, empty list of that month's
entries; the money itself carries forward exactly as before. Loans out and
repayments also show up in the dedicated **Lending** tab with a running
"balance owed to you" per account.

## Reviewing your data
Once synced, open the Google Sheet any time — each account/month has its
own tab, in plain readable rows you can sort, filter, or pivot however you
like, or download as Excel/CSV directly from Google Sheets (File → Download).

Two summary tabs are also maintained automatically, kept leftmost:
**"Summary JP"** and **"Summary LK"**. Each has one row per month with that
account's category totals, total expenses, total income, net, and — new —
an **Opening Balance** and **Closing Balance** column, so you can see your
balance carrying forward month to month right in the Sheet, plus a final
**Average / month** row for the flow columns. It rebuilds itself every time
you sync, so it's always current.

Below the main table on each Summary tab you'll also find:
- **One standalone table per category** (Card Food, Card Other, Cash Food,
  Cash Other, Bills, Transportation) — Month | Amount — so each category is
  easy to read or chart on its own.
- **One running-balance table per pool** (Cash in hand, Bank, Investments,
  Deposits, Cash Lent to others) — Month | Balance — so you can see each
  pool's own balance carrying forward month to month, not just the combined
  total. Cash Lent to others carries forward exactly like the others until
  a repayment reduces it, and it's already counted as part of your overall
  cash in the main Opening/Closing Balance columns.

## Editing data directly in the Sheet
You can fix a typo'd amount, retype a note, or change a category straight
in a month tab (e.g. "JP-2026-07"), and it will sync back into the app.
When you edit a row by hand, the script automatically stamps that row's
`updatedAt` column with the current time, so the next sync knows your
Sheet edit is newer than whatever's on your phone and keeps it. You don't
need to do anything extra — just edit the cell and sync as usual afterward
(open the app and tap Sync, or wait for its next auto-sync).
Don't hand-edit the `id` column — that's what ties a row to the same
transaction across devices.

There's also a hidden **Config** tab the script uses to store your account
balances/settings as JSON — you don't need to touch it, and it's hidden by
default so it doesn't clutter your view of the data.

## If something goes wrong
- "Sync failed" toast → double check the URL was copied in full (including
  `/exec`) and the secret matches exactly on both ends.
- If you ever change the SECRET in the script, update it in the app's Settings
  on every device too, or syncing will silently fail (shows as unauthorized).
- You can always fall back to Settings → Export/Import backup as a manual way
  to move data between devices.
- Upgrading from the older single-account version? Your existing data
  migrates automatically into the new Japan account the first time you open
  the updated app — nothing is lost, and Sri Lanka simply starts empty until
  you add its opening balances in Settings.
