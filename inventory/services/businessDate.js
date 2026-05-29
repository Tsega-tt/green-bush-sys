'use strict';

const { BUSINESS_TZ } = require('../db/config');

/**
 * Current business date (YYYY-MM-DD) in Africa/Addis_Ababa, regardless of the
 * host OS timezone. Used for daily snapshots and day boundaries so "midnight"
 * is always local restaurant time.
 */
function currentBusinessDate(date = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

module.exports = { currentBusinessDate, BUSINESS_TZ };
