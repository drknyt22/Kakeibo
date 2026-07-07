# Kakeibo — Install & Setup Guide

This version tracks two accounts side by side — 🇯🇵 **Japan** and
🇱🇰 **Sri Lanka** — switchable with the pill buttons at the top of the app.
Both accounts share the same expense categories (Card Food, Card Other,
Cash Food, Cash Other, Bills, Transportation), an **investments** pool, a
**deposits/fixed-deposits** pool, and a **Cash Lent to others** pool.

Japan has a single **Bank** pool — plus three cards, **PayPay Card**,
**Rakuten Card**, and **JP Post Debit Card**, all linked to that same Bank
pool. When you log a "Card" expense, picking the card both tags the
transaction with which card you used and automatically deducts from Bank.
Sri Lanka also has a single bank pool, named by picking from a dropdown
(Sampath Bank, Bank of Ceylon, Commercial Bank, Nations Trust Bank, Dialog
Genie) instead of typing a bank name.

## Part 1 — Host the app on GitHub Pages (once, covers all your devices)

1. Go to **github.com** and sign up for a free account if you don't have one.
2. Click the **+** icon (top right) → **New repository**.
3. Name it something like `kakeibo`, set visibility to **Public**, then click
   **Create repository**. (Public is fine — nobody can find or read your
   actual expense data just from the app's code being visible; your real
   numbers live only in your browser and your own private Google Sheet.)
4. Unzip this download on your computer — you'll get a `kakeibo` folder
   containing `index.html`, `manifest.json`, `sw.js`, and an `icons` folder.
5. On the new repo's GitHub page, click **Add file → Upload files**.
6. Open the unzipped `kakeibo` folder and drag in everything **inside** it
   (`index.html`, `manifest.json`, `sw.js`, the `icons` folder, etc.) — drop
   the files themselves, not the outer `kakeibo` folder.
7. Scroll down, click **Commit changes**.
8. Go to the repo's **Settings** tab → **Pages** (left sidebar).
9. Under "Build and deployment", set **Source** to **Deploy from a branch**,
   **Branch** to `main` and folder `/ (root)`, then **Save**.
10. Wait about a minute, then refresh — GitHub shows you a URL like
    `https://yourusername.github.io/kakeibo/`. That's your app's permanent
    address — use it on every device below.

## Part 2 — iPhone

1. Open the URL in **Safari** (must be Safari, not Chrome, for this to work).
2. Tap **Share** (square with an up arrow).
3. Tap **Add to Home Screen** → **Add**.
4. Launch it from the home screen icon — runs full-screen, works offline.

## Part 3 — MacBook

1. Open the URL in **Safari**: menu bar → **File → Add to Dock**.
   Or in **Chrome**: address bar → install icon → **Install**.
2. It now runs as its own app/window, launchable from Dock or Launchpad.

## Part 4 — Windows

1. Open the URL in **Edge** or **Chrome**.
2. Address bar → install icon → **Install**.
3. Pin it to Start or the taskbar like any other app.

## Part 5 — First-run setup

1. On first launch you'll be asked for your Japan account's starting cash
   in hand, cash at bank, and a projection end date. Open **Settings**
   afterward to fill in starting balances for Bank, Investments, and Fixed
   Deposits individually.
2. Switch to the 🇱🇰 Sri Lanka tab and open **Settings** to enter its
   starting balances (cash, bank, investments, deposits) and pick your
   bank from the dropdown under "Bank names."
3. If you're upgrading from an older version: Japan's old single "Cash at
   bank" balance moved automatically into the Bank pool the first time
   the app opened after that change, and any old JP Post/Rakuten/PayPay
   split balances were automatically combined into that same single Bank
   pool since. Sri Lanka's old three bank pools were likewise combined
   automatically into its single bank pool. Nothing is lost.

## Part 6 — Using the two new tracking features

- **Lending to friends/family (either account):** go to the Transfer screen,
  set "From" to Cash in hand or Bank and "To" to "Cash Lent to others",
  note the friend's name, and save. When they pay you back, do the reverse
  transfer (From: Cash Lent to others → To: Cash/Bank). This is a single combined
  "amount out on loan" pool per account, not tracked person-by-person — put
  the name in the note field so you can search for it later.
  In your Google Sheet, every lend-out and repayment lands in a dedicated
  **Lending** tab (separate from the monthly expense tabs), with its own
  running "balance owed to you" for Japan and Sri Lanka. It carries forward
  automatically until repaid, and it's already counted as part of your
  overall cash in each Summary tab's Opening/Closing Balance columns.
- **Investments / Deposits (either account):** also done via Transfer — move
  money from cash/bank into "Investments" or "Deposits" to record a
  contribution, or the reverse to record a withdrawal or maturity payout.
- **Depositing cash into a bank (either account):** go to Transfer, "From"
  Cash in hand, "To" Bank.
- **Card expenses (Japan):** choose a "Card Food"/"Card Other" category (or
  Bills/Transportation → Card), then pick **PayPay Card**, **Rakuten
  Card**, or **JP Post Debit Card** from the dropdown that appears. This
  tags the transaction with that card AND automatically deducts from Bank
  — no separate step to reduce the balance.
- **Income into the bank (either account):** on the Income screen, the pool
  dropdown lets you pick Bank (or Cash in hand) for where a deposit landed.

## Part 7 — Google Sheets sync

1. sheets.google.com → new blank spreadsheet, name it e.g. "Kakeibo Data".
2. **Extensions → Apps Script**, delete placeholder code.
3. Paste in the full contents of `apps-script.gs` (included in this download).
4. Change `const SECRET = 'change-this-to-your-own-secret';` to your own
   private phrase.
5. Save.
6. **Deploy → New deployment** → gear icon → **Web app**.
7. Execute as: **Me**. Who has access: **Anyone**. Click **Deploy**.
8. Approve the authorization prompt.
9. Copy the Web app URL (ends in `/exec`).
10. In the Kakeibo app (each device): **Settings → Google Sheets sync** → paste
    the URL and your secret → **Save connection** → **Sync now**.
11. Repeat step 10 on your other devices, same URL and secret each time.

Both accounts sync through this one connection. Each account/month gets its
own tab automatically (e.g. "JP-2026-07", "LK-2026-07") — open the Sheet
directly anytime to browse, filter, or export your data. Two "Summary JP" /
"Summary LK" tabs show monthly totals plus an opening/closing balance so
you can see the running balance carry forward month to month. See
`SYNC_SETUP.md` for full details.

## Troubleshooting
- "Sync failed" → check the URL includes `/exec` and the secret matches
  exactly on both ends.
- Changed the SECRET later? Update it in Settings on every device too.
- Data only on one device and want it elsewhere without waiting on sync?
  Settings → Export backup (.json) → Import on the other device.
