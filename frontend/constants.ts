export const STORAGE_KEYS = {
  EMPLOYEE_ID: 'driver_app_emp_id',
  EMPLOYEE_NAME: 'driver_app_emp_name',
  EMPLOYEE_LOCATION: 'driver_app_emp_location',
};

export const DB_NAME = 'DriverTimeTrackerDB';
export const STORE_NAME = 'clock_entries';

// Google Maps Geocoding API key (optional).
// If set, uses Google Maps for reverse geocoding; otherwise falls back to Nominatim (no key required).
// Restrict this key to your deployed domain in the Google Cloud Console.
export const GOOGLE_MAPS_API_KEY = '';

// Google Apps Script deployment URL for employee lookup and clock entry syncing.
export const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyk9MUZSdHSwDUDEMycfBs7I79aJbqSyidSRp6Zx0Xr445kUnc_JmhoDrTkevh90-S4/exec';

