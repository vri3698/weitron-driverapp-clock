/**
 * GOOGLE APPS SCRIPT BACKEND
 * 
 * Instructions:
 * 1. Go to script.google.com and create a new project.
 * 2. Paste this code into Code.gs.
 * 3. Click "Deploy" → "New deployment".
 * 4. Select type "Web app", Execute as: "Me", Who has access: "Anyone".
 * 5. Click Deploy. Copy the Web App URL and paste it into constants.ts (GAS_WEB_APP_URL).
 */

const SPREADSHEET_ID     = '1sfTtr95aFqKyEwdA1MYpFnbGXOB2A0eJW7h0Se5di-M';
const PHOTO_FOLDER_ID    = '1WWfOFtCYtW8yWBu9viJET4QjSprrVa4-';
const EMPLOYEES_SHEET    = 'Employees';
const CLOCK_SHEET        = 'clock_log';

// Column order in clock_log — update this array to add/rename columns.
const CLOCK_HEADERS = [
  'Timestamp', 'Action_Type', 'Employee_ID', 'Employee_Name',
  'Location_Name', 'Image_URL', 'Note', 'Event_ID',
  'Latitude', 'Longitude', 'Street_Address',
];

// ── Entry point ───────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.action === 'verify') return handleVerify(data.employeeId);
    if (data.action === 'clock')  return handleClockEvent(data.entry);
    return jsonResponse({ success: false, error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ── Verify employee ───────────────────────────────────────────────────────────

function handleVerify(employeeId) {
  const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
  const emp = findEmployee(ss, employeeId);
  if (!emp) return jsonResponse({ valid: false, error: 'Employee ID not found' });
  return jsonResponse({ valid: true, name: emp.name, locationName: emp.locationName });
}

// ── Clock event ───────────────────────────────────────────────────────────────

function handleClockEvent(entry) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  let   sheet = ss.getSheetByName(CLOCK_SHEET);
  if (!sheet) sheet = ss.insertSheet(CLOCK_SHEET);
  ensureHeaders(sheet, CLOCK_HEADERS);

  const emp  = findEmployee(ss, entry.employeeId) || { name: '', locationName: '' };
  const photoUrl = savePhoto(entry);

  // Location_Name = employee's assigned location (from Employees sheet)
  const locationName  = String(entry.locationName  || emp.locationName || '').trim();
  // Street_Address = GPS-geocoded street address sent by the app
  const streetAddress = String(entry.address || '').trim();

  sheet.appendRow([
    formatTimestamp(entry.timestamp),
    entry.type        || '',
    entry.employeeId  || '',
    entry.employeeName || emp.name,
    locationName,
    photoUrl,
    entry.note        || '',
    entry.id          || '',
    entry.lat         ?? '',
    entry.lng         ?? '',
    streetAddress,
  ]);

  return jsonResponse({ success: true });
}

// ── Photo upload ──────────────────────────────────────────────────────────────

function savePhoto(entry) {
  if (!entry.photoBase64) return '';
  try {
    const folder  = DriveApp.getFolderById(PHOTO_FOLDER_ID);
    const b64Data = entry.photoBase64.includes(',')
      ? entry.photoBase64.split(',')[1]
      : entry.photoBase64;
    const blob = Utilities.newBlob(
      Utilities.base64Decode(b64Data),
      'image/jpeg',
      entry.photoName || (entry.id + '.jpg')
    );
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    console.error('Photo save error:', err);
    return 'Error saving photo';
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Find an employee row by ID. Returns { name, locationName } or null.
 * Single place where the Employees sheet is parsed — used by both verify and clock.
 */
function findEmployee(ss, employeeId) {
  const sheet = ss.getSheetByName(EMPLOYEES_SHEET);
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;

  const headers    = data[0].map(function(h) { return normalize(h); });
  const idCol      = findCol(headers, ['employeeid', 'employee id']);
  const nameCol    = findCol(headers, ['employeename', 'employee name', 'name']);
  const locationCol= findCol(headers, ['locationname', 'location name', 'location']);

  const targetId = normalize(employeeId);
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (normalize(row[idCol >= 0 ? idCol : 0]) === targetId) {
      return {
        name:         String(row[nameCol     >= 0 ? nameCol     : 1] || '').trim(),
        locationName: String(row[locationCol >= 0 ? locationCol : 2] || '').trim(),
      };
    }
  }
  return null;
}

/** Ensure the sheet's first row matches the expected headers exactly. */
function ensureHeaders(sheet, headers) {
  var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var needsUpdate = current.length !== headers.length ||
    current.some(function(v, i) { return String(v).trim() !== headers[i]; });
  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function formatTimestamp(value) {
  var date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'M/d/yyyy H:mm:ss');
}

/** Lowercase + strip non-alphanumeric for loose column name matching. */
function normalize(str) {
  return String(str || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Find the first column index whose normalized name matches any candidate. */
function findCol(headers, candidates) {
  for (var i = 0; i < headers.length; i++) {
    for (var j = 0; j < candidates.length; j++) {
      if (headers[i] === normalize(candidates[j])) return i;
    }
  }
  return -1;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

