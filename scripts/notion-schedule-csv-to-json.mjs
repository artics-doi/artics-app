import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CATEGORY_LABEL_TO_ID = {
  '休暇': 'vacation',
  '休日': 'holiday',
  '外出': 'outing',
  '外勤': 'fieldwork',
  '出張': 'businessTrip',
  '車両': 'vehicle',
  '車両・外出': 'vehicleOuting',
  '中会議室': 'smallMeetingRoom',
  '大会議室': 'largeMeetingRoom',
  '社内イベント': 'internalEvent',
  'メンテナンス': 'maintenance',
};

const MONTH_INDEX = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
};

const DEFAULT_PROJECT_ID = 'company-chat-a9cf0';
const DEFAULT_DATABASE_ID = '(default)';
const IMPORT_CREATED_BY = 'notion-csv-import';
const IMPORT_CREATED_BY_NAME = 'Notion CSV Import';

function parseArgs(argv) {
  const options = {
    inputPath: '',
    outputDir: '',
    commit: false,
    projectId: DEFAULT_PROJECT_ID,
    databaseId: DEFAULT_DATABASE_ID,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--commit') {
      options.commit = true;
      continue;
    }
    if (arg === '--project') {
      options.projectId = argv[++i] || options.projectId;
      continue;
    }
    if (arg === '--database') {
      options.databaseId = argv[++i] || options.databaseId;
      continue;
    }
    if (!options.inputPath) {
      options.inputPath = arg;
      continue;
    }
    if (!options.outputDir) {
      options.outputDir = arg;
      continue;
    }
  }

  return options;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== '')) rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(
      headers.map((header, headerIndex) => [header, row[headerIndex]?.trim() ?? '']),
    ),
  }));
}

function parseFullDate(value) {
  const cleaned = value.trim().replace(/\s*\(GMT\+9\)\s*$/, '');
  const match = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:\s+\d{1,2}:\d{2})?$/);
  if (!match) return null;
  const [, monthName, day, year] = match;
  const month = MONTH_INDEX[monthName];
  if (month === undefined) return null;
  return new Date(Number(year), month, Number(day));
}

function endOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function parseDateRangeAsAllDay(value) {
  const parts = value.split('→').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const start = parseFullDate(parts[0]);
  if (!start) return null;

  let end = null;
  let ignoredEndTime = false;
  let swapped = false;
  if (parts[1]) {
    const parsedEnd = parseFullDate(parts[1]);
    if (parsedEnd) {
      end = parsedEnd;
    } else if (/^\d{1,2}:\d{2}$/.test(parts[1])) {
      ignoredEndTime = true;
    }
  }

  let startAt = start;
  let endAt = end ? endOfLocalDay(end) : null;
  if (endAt && endAt < startAt) {
    swapped = true;
    startAt = end;
    endAt = endOfLocalDay(start);
  }

  return { startAt, endAt, ignoredEndTime, swapped };
}

function toIso(date) {
  return date ? date.toISOString() : null;
}

function buildImportKey({ title, categoryLabel, rawDate }) {
  const source = [
    title.trim().replace(/\s+/g, ' '),
    categoryLabel.trim().replace(/\s+/g, ' '),
    rawDate.trim().replace(/\s+/g, ' '),
  ].join('|');
  return `notion_${crypto.createHash('sha1').update(source).digest('hex').slice(0, 24)}`;
}

function convertRow(entry) {
  const row = entry.values;
  const rawTitle = row['登録内容'] || '';
  const rawCategory = row.Property || '';
  const rawDate = row['日付'] || '';
  const title = rawTitle.trim();
  const categoryLabel = rawCategory.trim() || 'その他';

  if (!title || !rawDate.trim()) {
    return { skipped: true, reason: 'missing-title-or-date', row: entry.rowNumber, title, categoryLabel, rawDate };
  }

  const dateRange = parseDateRangeAsAllDay(rawDate);
  if (!dateRange) {
    return { skipped: true, reason: `invalid-date:${rawDate}`, row: entry.rowNumber, title, categoryLabel, rawDate };
  }

  const importKey = buildImportKey({ title, categoryLabel, rawDate });
  return {
    skipped: false,
    warnings: [
      dateRange.ignoredEndTime ? 'ignored-time-range' : '',
      dateRange.swapped ? 'date-range-swapped' : '',
    ].filter(Boolean),
    schedule: {
      importKey,
      title,
      categoryId: CATEGORY_LABEL_TO_ID[categoryLabel] || 'other',
      sourceCategory: categoryLabel,
      targetUserIds: [],
      targetUserNames: [],
      startAt: toIso(dateRange.startAt),
      endAt: toIso(dateRange.endAt),
      allDay: true,
      memo: '',
      notification: {
        enabled: false,
        timings: [],
        customAt: null,
      },
      source: {
        row: entry.rowNumber,
        title: rawTitle,
        category: rawCategory,
        date: rawDate,
      },
    },
  };
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') {
    return /^\d{4}-\d{2}-\d{2}T/.test(value) ? { timestampValue: value } : { stringValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])),
      },
    };
  }
  throw new Error(`Unsupported Firestore value: ${String(value)}`);
}

function scheduleToFirestoreFields(schedule, importedAt) {
  return Object.fromEntries(Object.entries({
    title: schedule.title,
    categoryId: schedule.categoryId,
    sourceCategory: schedule.sourceCategory,
    targetUserIds: schedule.targetUserIds,
    targetUserNames: schedule.targetUserNames,
    startAt: schedule.startAt,
    endAt: schedule.endAt,
    allDay: schedule.allDay,
    memo: schedule.memo,
    notification: schedule.notification,
    createdBy: IMPORT_CREATED_BY,
    createdByName: IMPORT_CREATED_BY_NAME,
    createdAt: importedAt,
    updatedAt: importedAt,
    manualOrderDate: null,
    manualOrder: null,
    sentNotificationKeys: [],
    importSource: {
      kind: 'notion-csv-minimal',
      importKey: schedule.importKey,
      row: schedule.source.row,
      title: schedule.source.title,
      category: schedule.source.category,
      date: schedule.source.date,
    },
  }).map(([key, value]) => [key, firestoreValue(value)]));
}

function getAccessToken() {
  if (process.env.FIRESTORE_ACCESS_TOKEN) return process.env.FIRESTORE_ACCESS_TOKEN;
  return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
}

async function commitSchedules({ schedules, projectId, databaseId }) {
  const token = getAccessToken();
  const importedAt = new Date();
  const databasePath = `projects/${projectId}/databases/${databaseId}/documents`;
  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(databaseId)}/documents:commit`;
  const batches = [];
  for (let i = 0; i < schedules.length; i += 450) {
    batches.push(schedules.slice(i, i + 450));
  }

  const results = [];
  for (const [batchIndex, batch] of batches.entries()) {
    const body = {
      writes: batch.map((schedule) => ({
        update: {
          name: `${databasePath}/schedules/${schedule.importKey}`,
          fields: scheduleToFirestoreFields(schedule, importedAt),
        },
      })),
    };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`Firestore commit failed in batch ${batchIndex + 1}: ${JSON.stringify(payload)}`);
    }
    results.push({ batch: batchIndex + 1, writeResults: payload.writeResults?.length ?? 0 });
  }
  return { importedAt: importedAt.toISOString(), batches: results };
}

const options = parseArgs(process.argv.slice(2));
if (!options.inputPath) {
  console.error('Usage: node scripts/notion-schedule-csv-to-json.mjs <notion-export.csv> [output-dir] [--commit] [--project <projectId>] [--database <databaseId>]');
  process.exit(1);
}

const outputDir = options.outputDir || path.join(process.cwd(), 'build', 'schedule-import');
const text = fs.readFileSync(options.inputPath, 'utf8').replace(/^\uFEFF/, '');
const objects = rowsToObjects(parseCsv(text));
const converted = objects.map(convertRow);
const schedules = converted.filter((item) => !item.skipped).map((item) => item.schedule);
const skipped = converted.filter((item) => item.skipped);
const warnings = converted
  .filter((item) => !item.skipped && item.warnings.length > 0)
  .map((item) => ({ row: item.schedule.source.row, importKey: item.schedule.importKey, warnings: item.warnings }));
const duplicateImportKeys = [...schedules.reduce((map, schedule) => {
  map.set(schedule.importKey, (map.get(schedule.importKey) || 0) + 1);
  return map;
}, new Map()).entries()].filter(([, count]) => count > 1);

if (duplicateImportKeys.length > 0) {
  throw new Error(`Duplicate import keys detected: ${JSON.stringify(duplicateImportKeys)}`);
}

let commitResult = null;
if (options.commit) {
  commitResult = await commitSchedules({ schedules, projectId: options.projectId, databaseId: options.databaseId });
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'schedules-import-preview.json'), JSON.stringify(schedules, null, 2));
fs.writeFileSync(path.join(outputDir, 'schedules-import-report.json'), JSON.stringify({
  inputPath: options.inputPath,
  projectId: options.projectId,
  databaseId: options.databaseId,
  mode: 'minimal-date-title-category-multiday',
  committed: options.commit,
  totalRows: objects.length,
  importedRows: schedules.length,
  skippedRows: skipped.length,
  warnings,
  skipped,
  categoryCounts: schedules.reduce((counts, schedule) => {
    counts[schedule.categoryId] = (counts[schedule.categoryId] || 0) + 1;
    return counts;
  }, {}),
  sourceCategoryCounts: schedules.reduce((counts, schedule) => {
    counts[schedule.sourceCategory] = (counts[schedule.sourceCategory] || 0) + 1;
    return counts;
  }, {}),
  commitResult,
}, null, 2));

console.log(`Converted ${schedules.length}/${objects.length} rows`);
if (options.commit) console.log(`Committed ${schedules.length} schedules`);
console.log(`Preview: ${path.join(outputDir, 'schedules-import-preview.json')}`);
console.log(`Report: ${path.join(outputDir, 'schedules-import-report.json')}`);
