#!/usr/bin/env node
/* Writes server/generated/data.json: what the accounts-and-leaderboards API (api/sarpa.js) needs to know about the
 * game data. That is every species id and its difficulty tier, which species each photo shows (to check answers),
 * whether the photo is a hard one and where it was taken (India or North America), and the schedule of daily puzzles
 * for Sarpa and Herpdle in each area, made with the website's own code (js/engine.js dailySet, js/herpdle-core.js
 * dailyPick) so that the server and the website agree.
 *
 * Run it after every rebuild of data/species.js and data/photos.js (step 9):
 *
 *   node scripts/dataset/10_server_data.js [--days 1830] [--keep-ahead 3]
 *
 * Days that have already started keep their puzzles (people may have played them), as long as their photos and
 * species are still in the data set; so do the next few days (--keep-ahead), in case the new data goes live a little
 * after it was built. Everything later is made fresh from the new data.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.join(REPO, 'server', 'generated', 'data.json');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const DAYS = parseInt(arg('days', '1830'), 10);
const KEEP_AHEAD = parseInt(arg('keep-ahead', '3'), 10);

/** Runs the website's data and game code in a sandbox, without a browser. */
function loadSite() {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/util.js', 'data/species.js', 'data/photos.js', 'js/data.js', 'js/engine.js', 'js/herpdle-core.js']) {
    vm.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), ctx, { filename: f });
  }
  ctx.SQ.data.init();
  return ctx.SQ;
}

function main() {
  const SQ = loadSite();
  const D = SQ.data;
  const species = D.species.map((s) => s.id);
  const tiers = D.species.map((s) => s.tier);
  const spIndex = new Map(species.map((id, i) => [id, i]));
  const AREAS = D.AREA_ORDER;           // photo areas are stored as positions in this list
  const photos = D.photos.map((p) => [p.id, spIndex.get(p.sp), p.hard ? 1 : 0, Math.max(0, AREAS.indexOf(p.region))]);
  const photoSp = new Map(D.photos.map((p) => [p.id, p.sp]));

  const today = SQ.time.dayKey();
  const keepUntil = SQ.time.shiftDay(today, KEEP_AHEAD);

  // puzzles already handed out
  let old = null;
  try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { old = null; }
  const kept = {};
  let keptDays = 0, droppedDays = 0;
  if (old && old.daily) {
    for (const [day, entry] of Object.entries(old.daily)) {
      if (day > keepUntil) continue;
      const sp = (i) => old.species[i];
      const s = entry.s.map(([photo, opts, answer]) => [photo, opts.map(sp), answer]);
      const h = [sp(entry.h[0]), entry.h[1]];
      const valid = s.every(([photo, opts, answer]) => photoSp.get(photo) === opts[answer] && opts.every((id) => spIndex.has(id)))
        && spIndex.has(h[0]) && photoSp.get(h[1]) === h[0];
      if (!valid) { droppedDays++; continue; }
      kept[day] = { s: s.map(([photo, opts, answer]) => [photo, opts.map((id) => spIndex.get(id)), answer]), h: [spIndex.get(h[0]), h[1]] };
      // North America's puzzles are kept the same way (days from before it existed get new ones below)
      if (entry.na) {
        const ns = entry.na.s.map(([photo, opts, answer]) => [photo, opts.map(sp), answer]);
        const nh = [sp(entry.na.h[0]), entry.na.h[1]];
        const nvalid = ns.every(([photo, opts, answer]) => photoSp.get(photo) === opts[answer] && opts.every((id) => spIndex.has(id)))
          && spIndex.has(nh[0]) && photoSp.get(nh[1]) === nh[0];
        if (nvalid) kept[day].na = { s: ns.map(([photo, opts, answer]) => [photo, opts.map((id) => spIndex.get(id)), answer]), h: [spIndex.get(nh[0]), nh[1]] };
      }
      keptDays++;
    }
  }

  // keep the oldest puzzles of the old file only as far back as the leaderboards look (120 days)
  const first = SQ.time.shiftDay(today, -120);
  const daily = {};
  Object.keys(kept).filter((d) => d >= first).sort().forEach((d) => { daily[d] = kept[d]; });
  const hasNa = D.byArea.na.length > 0;
  const puzzle = (day, area) => {
    const set = SQ.engine.dailySet(day, area);
    const h = SQ.herpdle.dailyPick(day, area);
    if (set.questions.length !== 10) throw new Error(`${area} daily set for ${day} has ${set.questions.length} questions`);
    return { s: set.questions.map((q) => [q.photo, q.options.map((id) => spIndex.get(id)), q.answer]), h: [spIndex.get(h.species), h.photo] };
  };
  let made = 0;
  for (let i = 0; i < DAYS; i++) {
    const day = SQ.time.shiftDay(today, i);
    if (!daily[day]) { daily[day] = puzzle(day, 'in'); made++; }
  }
  // every day gets a North America puzzle too, including kept days from before North America was added
  if (hasNa) Object.keys(daily).forEach((day) => { if (!daily[day].na) daily[day].na = puzzle(day, 'na'); });
  const days = Object.keys(daily).sort();
  const sorted = {};
  days.forEach((d) => { sorted[d] = daily[d]; });

  const version = crypto.createHash('sha256').update(JSON.stringify([species, tiers, photos])).digest('hex').slice(0, 12);
  const out = { note: 'Generated by scripts/dataset/10_server_data.js - do not edit by hand.', version, built: today, first: days[0], last: days[days.length - 1],
    areas: AREAS, species, tiers, photos, daily: sorted };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`wrote ${path.relative(REPO, OUT)} (${kb} KB): ${species.length} species, ${photos.length} photos, daily puzzles ${days[0]} to ${days[days.length - 1]}`);
  console.log(`  kept ${keptDays} days from the previous schedule${droppedDays ? `, dropped ${droppedDays} whose photos are gone` : ''}, made ${made} new`);
}

main();
