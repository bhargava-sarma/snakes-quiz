'use strict';
/* Dates for the daily games. Everyone shares one calendar: India Standard Time (UTC+05:30),
 * so the daily puzzles and the daily leaderboards change at midnight in India.
 * js/util.js has the same functions for the browser; keep the two in step. */

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' for the day it is in India at time `ms`. */
function dayKey(ms = Date.now()) {
  const d = new Date(ms + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Whole days since 1970-01-01 for a 'YYYY-MM-DD' key. */
function dayIndex(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function keyFromIndex(i) {
  const d = new Date(i * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The day before / after a 'YYYY-MM-DD' key. */
const shiftDay = (key, n) => keyFromIndex(dayIndex(key) + n);

/** ISO-8601 week of a day key, e.g. '2026-W44' (weeks start on Monday). */
function weekKey(key) {
  const i = dayIndex(key);
  const dow = (new Date(i * DAY_MS).getUTCDay() + 6) % 7;          // Monday = 0
  const thursday = i - dow + 3;
  const td = new Date(thursday * DAY_MS);
  const year = td.getUTCFullYear();
  const jan1 = Math.round(Date.UTC(year, 0, 1) / DAY_MS);
  const week = Math.floor((thursday - jan1) / 7) + 1;
  return `${year}-W${pad(week)}`;
}

/** Milliseconds until the next midnight in India. */
function msToNextDay(ms = Date.now()) {
  const local = ms + IST_OFFSET_MS;
  return DAY_MS - (local % DAY_MS);
}

const isDayKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && keyFromIndex(dayIndex(s)) === s;

module.exports = { IST_OFFSET_MS, DAY_MS, dayKey, dayIndex, keyFromIndex, shiftDay, weekKey, msToNextDay, isDayKey };
