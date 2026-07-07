/**
 * Kakeibo sync backend — paste this into the Apps Script editor
 * that's bound to your Google Sheet (Extensions > Apps Script).
 *
 * Supports TWO accounts — Japan ("jp") and Sri Lanka ("lk") — each with
 * its own pools (cash / bank accounts / lent-to-friends / investments /
 * deposits) and its own set of expense categories.
 *
 * Each calendar month gets its own tab per account, named "JP-YYYY-MM" or
 * "LK-YYYY-MM" (e.g. "JP-2026-07", "LK-2026-07"), created automatically
 * the first time a transaction from that month/account syncs. Expenses
 * reset to a blank tab each month; the running pool balances themselves
 * are NOT reset — they carry forward automatically, and the two Summary
 * tabs show the opening/closing balance for every month so you can see
 * the carry-forward at a glance.
 *
 * Change SECRET below to something only you know, then deploy
 * (Deploy > New deployment > Web app) with:
 *   Execute as:  Me
 *   Who has access:  Anyone
 * Copy the resulting /exec URL into the app's Settings, along
 * with the same SECRET.
 */

const SECRET = 'change-this-to-your-own-secret';
const MONTH_TAB_PATTERN = /^(JP|LK)-\d{4}-\d{2}$/;

const HEADERS = [
  'id','account','type','date','category','pool','poolFrom','poolTo','cardTag',
  'amount','note','oneOff','deleted','updatedAt'
];

// Mirrors ACCOUNT_DEFS in index.html — keep these two in sync.
const ACCOUNT_DEFS = {
  JP: {
    label: 'Japan',
    pools: ['hand','bank','investments','deposits','lent'],
    poolLabels: {hand:'Cash in hand', bank:'Bank', investments:'Investments', deposits:'Fixed Deposits', lent:'Cash Lent to others'},
    categories: ['Card Food','Card Other','Cash Food','Cash Other','Bills','Transportation']
  },
  LK: {
    label: 'Sri Lanka',
    pools: ['cash','bank','investments','deposits','lent'],
    poolLabels: {cash:'Cash in hand', bank:'Bank', investments:'Investments', deposits:'Deposits', lent:'Cash Lent to others'},
    categories: ['Card Food','Card Other','Cash Food','Cash Other','Bills','Transportation']
  }
};

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ymOf_(dateStr) {
  return String(dateStr || '').slice(0, 7); // "YYYY-MM"
}

function tabName_(account, ym) {
  return String(account || 'jp').toUpperCase() + '-' + ym;
}

function getMonthSheet_(account, ym) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = tabName_(account, ym);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    reorderMonthTabs_(ss);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else {
    migrateSheetHeaders_(sheet);
  }
  return sheet;
}

// If a month tab's header row predates a HEADERS schema change (e.g. adding
// the 'cardTag' column), re-read its existing rows by their OLD header
// names/positions and rewrite the whole sheet in the CURRENT column order,
// so old data doesn't end up misaligned under new column headers.
function migrateSheetHeaders_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) return;
  const oldHeaders = values[0];
  const sameSchema = oldHeaders.length === HEADERS.length &&
    oldHeaders.every(function (h, i) { return h === HEADERS[i]; });
  if (sameSchema) return;

  const oldIdx = {};
  oldHeaders.forEach(function (h, i) { oldIdx[h] = i; });

  const newRows = values.slice(1).filter(function (r) { return r[oldIdx.id] !== ''; }).map(function (r) {
    return HEADERS.map(function (h) {
      const v = (h in oldIdx) ? r[oldIdx[h]] : '';
      return (v === undefined || v === null) ? '' : v;
    });
  });

  sheet.clear();
  sheet.appendRow(HEADERS);
  sheet.setFrozenRows(1);
  if (newRows.length) {
    sheet.getRange(2, 1, newRows.length, HEADERS.length).setValues(newRows);
  }
}

// Keeps month tabs in chronological left-to-right order (grouped by account) as new ones appear.
function reorderMonthTabs_(ss) {
  const monthSheets = ss.getSheets().filter(function (s) {
    return MONTH_TAB_PATTERN.test(s.getName());
  });
  monthSheets.sort(function (a, b) { return a.getName().localeCompare(b.getName()); });
  const offset = ss.getSheets().filter(function(s){ return s.getName().indexOf('Summary') === 0 || s.getName() === 'Lending'; }).length;
  monthSheets.forEach(function (s, i) {
    ss.setActiveSheet(s);
    ss.moveActiveSheet(offset + i + 1);
  });
}

function allMonthSheets_(accountPrefix) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets().filter(function (s) {
    if (!MONTH_TAB_PATTERN.test(s.getName())) return false;
    if (accountPrefix && s.getName().indexOf(accountPrefix + '-') !== 0) return false;
    return true;
  });
}

/* -----------------------------------------------------------------
 * Two-way edit support: if you edit a transaction directly in a
 * month tab (fix an amount, retype a note, change a category, etc.),
 * this simple trigger stamps that row's 'updatedAt' with the current
 * time. The app's sync compares 'updatedAt' on both sides and keeps
 * whichever copy is newer, so your manual edit — not the older copy
 * on your phone — is what survives the next sync.
 *
 * This only fires for edits you make by hand in the Sheets UI; edits
 * this script itself makes (via doPost, rebuildSummaries_, etc.) do
 * NOT re-trigger it, so there's no feedback loop.
 * ------------------------------------------------------------- */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (!MONTH_TAB_PATTERN.test(sheet.getName())) return;

  const idCol = HEADERS.indexOf('id') + 1;
  const updatedAtCol = HEADERS.indexOf('updatedAt') + 1;
  const startRow = e.range.getRow();
  const numRows = e.range.getNumRows();

  for (let r = startRow; r < startRow + numRows; r++) {
    if (r === 1) continue; // header row
    // Don't re-stamp a row just because updatedAt itself was the cell edited
    // (e.g. someone manually typing a timestamp) — only real data edits count.
    if (numRows === 1 && e.range.getColumn() === updatedAtCol && e.range.getNumColumns() === 1) continue;
    const idVal = sheet.getRange(r, idCol).getValue();
    if (idVal === '') continue; // blank row, nothing to stamp
    sheet.getRange(r, updatedAtCol).setValue(Date.now());
  }
}

/* -----------------------------------------------------------------
 * Config sheet — stores the two accounts' pool balances + settings
 * (recurring income, budgets, bank account names, etc.) as JSON, so a
 * second device can pick up your true balances, not just transactions.
 * --------------------------------------------------------------- */
function getConfig_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');
  if (!sheet) return { accounts: null, accountsUpdatedAt: 0 };
  const values = sheet.getDataRange().getValues();
  const map = {};
  values.forEach(function (r) { map[r[0]] = r[1]; });
  let accounts = null;
  try { accounts = map.accounts ? JSON.parse(map.accounts) : null; } catch (e) { accounts = null; }
  return { accounts: accounts, accountsUpdatedAt: Number(map.accountsUpdatedAt || 0) };
}

function setConfig_(accounts, updatedAt) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Config');
  if (!sheet) {
    sheet = ss.insertSheet('Config');
  }
  sheet.clear();
  sheet.appendRow(['key', 'value']);
  sheet.appendRow(['accounts', JSON.stringify(accounts)]);
  sheet.appendRow(['accountsUpdatedAt', updatedAt]);
  sheet.setFrozenRows(1);
  sheet.hideSheet();
}

function doGet(e) {
  if (!e || e.parameter.secret !== SECRET) {
    return jsonOut_({ error: 'unauthorized' });
  }
  const rows = [];
  allMonthSheets_().forEach(function (sheet) {
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;
    const headers = values[0];
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (r[0] === '') continue;
      const obj = {};
      headers.forEach(function (h, j) { obj[h] = r[j]; });
      rows.push(obj);
    }
  });
  const cfg = getConfig_();
  return jsonOut_({ transactions: rows, accounts: cfg.accounts, accountsUpdatedAt: cfg.accountsUpdatedAt });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ error: 'bad_json' });
  }
  if (body.secret !== SECRET) {
    return jsonOut_({ error: 'unauthorized' });
  }

  // Save account balances/settings if this device's copy is newer.
  if (body.accounts) {
    const cfg = getConfig_();
    const incomingUpdatedAt = Number(body.accountsUpdatedAt || 0);
    if (incomingUpdatedAt > cfg.accountsUpdatedAt) {
      setConfig_(body.accounts, incomingUpdatedAt);
    }
  }

  const incoming = body.transactions || [];
  if (incoming.length === 0) {
    rebuildSummaries_();
    return jsonOut_({ ok: true, count: 0 });
  }

  // Group incoming transactions by the account+month tab they belong to.
  const byTab = {};
  incoming.forEach(function (txn) {
    const acct = (txn.account === 'lk') ? 'LK' : 'JP';
    const ym = ymOf_(txn.date);
    if (!/^\d{4}-\d{2}$/.test(ym)) return; // skip anything without a valid date
    const tab = tabName_(acct, ym);
    if (!byTab[tab]) byTab[tab] = { account: acct, ym: ym, rows: [] };
    byTab[tab].rows.push(txn);
  });

  const idCol = HEADERS.indexOf('id');
  const updatedAtCol = HEADERS.indexOf('updatedAt');
  let count = 0;

  Object.keys(byTab).forEach(function (tab) {
    const group = byTab[tab];
    const sheet = getMonthSheet_(group.account, group.ym);
    const lastRow = sheet.getLastRow();
    const existingValues = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues()
      : [];

    const idToRow = {};
    existingValues.forEach(function (r, i) { idToRow[String(r[idCol])] = i + 2; });

    const rowsToAppend = [];

    group.rows.forEach(function (txn) {
      const rowArr = HEADERS.map(function (h) {
        const v = (h === 'account') ? (group.account.toLowerCase()) : txn[h];
        return (v === undefined || v === null) ? '' : v;
      });
      const rowNum = idToRow[String(txn.id)];
      if (rowNum) {
        const currentUpdatedAt = Number(sheet.getRange(rowNum, updatedAtCol + 1).getValue()) || 0;
        if (!currentUpdatedAt || Number(txn.updatedAt || 0) > currentUpdatedAt) {
          sheet.getRange(rowNum, 1, 1, HEADERS.length).setValues([rowArr]);
        }
      } else {
        rowsToAppend.push(rowArr);
        idToRow[String(txn.id)] = -1; // seen, so duplicate ids within this batch don't double-append
      }
      count++;
    });

    if (rowsToAppend.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, HEADERS.length).setValues(rowsToAppend);
    }
  });

  rebuildSummaries_();

  return jsonOut_({ ok: true, count: count });
}

/* -----------------------------------------------------------------
 * Summary tabs — one per account ("Summary JP", "Summary LK"), each
 * with one row per month: category totals, income, expenses, net,
 * PLUS an opening and closing balance so the running balance carry-
 * forward across months is visible directly in the Sheet. Rebuilt on
 * every sync so it's always current; kept as the leftmost tabs.
 * --------------------------------------------------------------- */
function isDeleted_(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function rebuildSummaries_() {
  rebuildSummaryForAccount_('JP');
  rebuildSummaryForAccount_('LK');
  rebuildLendingTab_();
}

function rebuildSummaryForAccount_(accountPrefix) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const def = ACCOUNT_DEFS[accountPrefix];
  const tabTitle = 'Summary ' + accountPrefix;
  let summary = ss.getSheetByName(tabTitle);
  if (!summary) {
    summary = ss.insertSheet(tabTitle, accountPrefix === 'JP' ? 0 : 1);
  } else {
    summary.clear();
  }

  const cfg = getConfig_();
  const basePools = (cfg.accounts && cfg.accounts[accountPrefix.toLowerCase()] && cfg.accounts[accountPrefix.toLowerCase()].pools)
    ? cfg.accounts[accountPrefix.toLowerCase()].pools
    : {};

  const headers = ['Month'].concat(def.categories).concat(['Total Expenses', 'Total Income', 'Net', 'Opening Balance', 'Closing Balance']);
  summary.appendRow(headers);
  summary.setFrozenRows(1);

  const monthSheets = allMonthSheets_(accountPrefix).sort(function (a, b) {
    return a.getName().localeCompare(b.getName());
  });

  // Running balance starts from the base (reconciled) pool values synced from the app.
  let runningTotal = def.pools.reduce(function (s, p) { return s + (Number(basePools[p]) || 0); }, 0);
  const runningPools = {};
  def.pools.forEach(function (p) { runningPools[p] = Number(basePools[p]) || 0; });
  const monthRows = [];
  const poolMonthRows = {}; // pool key -> [[month, closingBalance], ...]
  def.pools.forEach(function (p) { poolMonthRows[p] = []; });

  monthSheets.forEach(function (sheet) {
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) { return; }
    const rowHeaders = values[0];
    const idx = {};
    rowHeaders.forEach(function (h, i) { idx[h] = i; });

    const totals = {};
    def.categories.forEach(function (c) { totals[c] = 0; });
    let totalIncome = 0;
    let netFlow = 0; // income - expenses, ignoring internal transfers between pools
    const poolChange = {};
    def.pools.forEach(function (p) { poolChange[p] = 0; });

    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (r[idx.id] === '' || isDeleted_(r[idx.deleted])) continue;
      const amount = Number(r[idx.amount]) || 0;
      if (r[idx.type] === 'expense') {
        const cat = r[idx.category];
        if (totals.hasOwnProperty(cat)) totals[cat] += amount;
        netFlow -= amount;
        const pool = r[idx.pool];
        if (poolChange.hasOwnProperty(pool)) poolChange[pool] -= amount;
      } else if (r[idx.type] === 'income') {
        totalIncome += amount;
        netFlow += amount;
        const pool = r[idx.pool];
        if (poolChange.hasOwnProperty(pool)) poolChange[pool] += amount;
      } else if (r[idx.type] === 'transfer') {
        // Moves money between this account's own pools — nets to zero for the
        // account as a whole, but each pool's own balance still shifts.
        const from = r[idx.poolFrom], to = r[idx.poolTo];
        if (poolChange.hasOwnProperty(from)) poolChange[from] -= amount;
        if (poolChange.hasOwnProperty(to)) poolChange[to] += amount;
      }
    }

    const totalExpenses = def.categories.reduce(function (s, c) { return s + totals[c]; }, 0);
    const net = totalIncome - totalExpenses;
    const opening = runningTotal;
    const closing = runningTotal + netFlow;
    runningTotal = closing;

    const monthLabel = sheet.getName().replace(accountPrefix + '-', '');
    def.pools.forEach(function (p) {
      runningPools[p] += poolChange[p];
      poolMonthRows[p].push([monthLabel, runningPools[p]]);
    });

    monthRows.push([monthLabel]
      .concat(def.categories.map(function (c) { return totals[c]; }))
      .concat([totalExpenses, totalIncome, net, opening, closing]));
  });

  if (monthRows.length) {
    summary.getRange(2, 1, monthRows.length, headers.length).setValues(monthRows);

    // Average-per-month row for the flow columns only (a running balance can't be meaningfully averaged).
    const n = monthRows.length;
    const avgRow = ['Average / month'];
    const flowColCount = def.categories.length + 3; // categories + Total Expenses + Total Income + Net
    for (let col = 1; col <= flowColCount; col++) {
      const sum = monthRows.reduce(function (s, row) { return s + (Number(row[col]) || 0); }, 0);
      avgRow.push(Math.round(sum / n));
    }
    avgRow.push('', ''); // blank for Opening/Closing Balance columns
    summary.getRange(2 + n, 1, 1, headers.length).setValues([avgRow]);
    summary.getRange(2 + n, 1, 1, headers.length).setFontWeight('bold');

    // Below the combined table: one standalone table per category (Month | Amount),
    // stacked with a blank row between each, so every category is easy to read or
    // chart on its own instead of hunting through a shared column.
    let nextRow = writeCategoryTables_(summary, 2 + n + 2, def.categories, monthRows);

    // Then one running-balance table per pool (Cash in hand, Bank, Investments,
    // Deposits, Cash Lent to others, ...) so each pool's own carry-forward
    // balance is visible month to month, not just the combined total.
    writePoolBalanceTables_(summary, nextRow, def.pools, def.poolLabels, poolMonthRows);
  }

  summary.autoResizeColumns(1, headers.length);
}

// Writes one standalone [Month | Amount] table per category, stacked vertically.
// monthRows here is the same array built above: [Month, cat1, cat2, ..., catN, ...].
// Returns the next free row after all the tables, for whatever gets written next.
function writeCategoryTables_(summary, startRow, categories, monthRows) {
  let row = startRow;
  categories.forEach(function (cat, catIdx) {
    const colIdx = catIdx + 1; // +1 because monthRows[*][0] is the Month label
    summary.getRange(row, 1).setValue(cat).setFontWeight('bold');
    summary.getRange(row + 1, 1, 1, 2).setValues([['Month', 'Amount']]);
    summary.getRange(row + 1, 1, 1, 2).setFontWeight('bold');
    const tableRows = monthRows.map(function (r) { return [r[0], r[colIdx]]; });
    if (tableRows.length) {
      summary.getRange(row + 2, 1, tableRows.length, 2).setValues(tableRows);
    }
    row = row + 2 + Math.max(tableRows.length, 1) + 1; // header block + rows + blank gap
  });
  return row;
}

// Writes one standalone [Month | Balance] running-balance table per pool
// (Cash in hand, Bank, Investments, Deposits, Cash Lent to others, ...), so
// each pool's own carry-forward balance — not just the account total — is
// visible month to month directly in the Sheet.
function writePoolBalanceTables_(summary, startRow, pools, poolLabels, poolMonthRows) {
  let row = startRow;
  pools.forEach(function (p) {
    const label = (poolLabels && poolLabels[p]) || p;
    summary.getRange(row, 1).setValue(label + ' — running balance').setFontWeight('bold');
    summary.getRange(row + 1, 1, 1, 2).setValues([['Month', 'Balance']]);
    summary.getRange(row + 1, 1, 1, 2).setFontWeight('bold');
    const tableRows = poolMonthRows[p] || [];
    if (tableRows.length) {
      summary.getRange(row + 2, 1, tableRows.length, 2).setValues(tableRows);
    }
    row = row + 2 + Math.max(tableRows.length, 1) + 1;
  });
}

/* -----------------------------------------------------------------
 * Lending tab — pulls every "lend out" / "repayment" transfer
 * (any transfer touching the 'lent' pool) out of the monthly tabs
 * for BOTH accounts and lists them in one place, oldest first, with
 * a running "still owed to you" balance per account. Rebuilt on
 * every sync, kept pinned near the top next to the Summary tabs.
 * Currencies differ (¥ vs Rs) so JP and LK get their own stacked
 * tables rather than being combined into a single running total.
 * --------------------------------------------------------------- */
function collectLendingRows_(accountPrefix) {
  const rows = [];
  allMonthSheets_(accountPrefix).sort(function (a, b) {
    return a.getName().localeCompare(b.getName());
  }).forEach(function (sheet) {
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;
    const headers = values[0];
    const idx = {};
    headers.forEach(function (h, i) { idx[h] = i; });
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (r[idx.id] === '' || isDeleted_(r[idx.deleted])) continue;
      if (r[idx.type] !== 'transfer') continue;
      const poolFrom = r[idx.poolFrom], poolTo = r[idx.poolTo];
      if (poolFrom !== 'lent' && poolTo !== 'lent') continue;
      rows.push({
        date: r[idx.date],
        direction: (poolTo === 'lent') ? 'Lent out' : 'Repaid',
        amount: Number(r[idx.amount]) || 0,
        note: r[idx.note] || ''
      });
    }
  });
  return rows;
}

function writeLendingSection_(sheet, startRow, title, currency, rows) {
  sheet.getRange(startRow, 1).setValue(title).setFontWeight('bold');
  const headerRow = startRow + 1;
  sheet.getRange(headerRow, 1, 1, 5).setValues([['Date', 'Direction', 'Amount', 'Note', 'Balance owed to you']]);
  sheet.getRange(headerRow, 1, 1, 5).setFontWeight('bold');

  let balance = 0;
  const out = rows.map(function (r) {
    balance += (r.direction === 'Lent out') ? r.amount : -r.amount;
    return [r.date, r.direction, r.amount, r.note, balance];
  });

  if (out.length) {
    sheet.getRange(headerRow + 1, 1, out.length, 5).setValues(out);
  } else {
    sheet.getRange(headerRow + 1, 1).setValue('(no lending activity yet)');
  }
  return headerRow + 1 + Math.max(out.length, 1) + 1; // next free row, with one blank row gap
}

function rebuildLendingTab_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Lending');
  if (!sheet) {
    sheet = ss.insertSheet('Lending', 2); // after the two Summary tabs
  } else {
    sheet.clear();
  }

  const jpRows = collectLendingRows_('JP');
  const lkRows = collectLendingRows_('LK');

  let nextRow = writeLendingSection_(sheet, 1, 'Japan (¥)', '¥', jpRows);
  writeLendingSection_(sheet, nextRow, 'Sri Lanka (Rs)', 'Rs', lkRows);

  sheet.setFrozenRows(0);
  sheet.autoResizeColumns(1, 5);
}
