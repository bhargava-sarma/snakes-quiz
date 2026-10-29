'use strict';
/* What the server needs to know about the game data, generated from the website's data files by
 * scripts/dataset/10_server_data.js: species ids, which species each photo shows, and the daily puzzles. */

let DATA = null;
function load() {
  if (!DATA) {
    // a plain require, so that Vercel bundles the file with the function
    const raw = require('./generated/data.json');
    const photo = new Map();
    raw.photos.forEach(([id, sp]) => photo.set(Number(id), raw.species[sp]));
    DATA = { raw, species: new Set(raw.species), photo };
  }
  return DATA;
}

const speciesExists = (id) => load().species.has(id);
const photoSpecies = (id) => load().photo.get(Number(id)) || null;

/**
 * The daily puzzle for a game and day, or null when the schedule has no entry (the website then plays an unranked
 * daily it works out itself).
 *   sarpa:   { questions: [{ photo, species, options: [4 species ids] }] }
 *   herpdle: { species, photo }
 * (in the file, species are stored as positions in the species list to keep it small)
 */
function daily(game, day) {
  const { raw } = load();
  const d = raw.daily[day];
  if (!d) return null;
  const sp = (i) => raw.species[i];
  if (game === 'sarpa') {
    return { questions: d.s.map(([photo, options, answer]) => ({ photo, options: options.map(sp), species: sp(options[answer]) })) };
  }
  if (game === 'herpdle') return { species: sp(d.h[0]), photo: d.h[1] };
  return null;
}

const version = () => load().raw.version;
const lastScheduledDay = () => load().raw.last;

module.exports = { load, speciesExists, photoSpecies, daily, version, lastScheduledDay };
