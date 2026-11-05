'use strict';
/* What the server needs to know about the game data, generated from the website's data files by
 * scripts/dataset/10_server_data.js: species ids and difficulty tiers, which species each photo shows (and whether
 * it is a hard photo, and its area: India or North America), and the daily puzzles of each area. */

let DATA = null;
function load() {
  if (!DATA) {
    // a plain require, so that Vercel bundles the file with the function
    const raw = require('./generated/data.json');
    const areas = raw.areas || ['in'];
    const photo = new Map();
    raw.photos.forEach(([id, sp, hard, area]) => photo.set(Number(id), { species: raw.species[sp], hard: hard ? 1 : 0, area: areas[area || 0] || 'in' }));
    const tier = new Map(raw.species.map((id, i) => [id, (raw.tiers && raw.tiers[i]) || 1]));
    DATA = { raw, species: new Set(raw.species), photo, tier };
  }
  return DATA;
}

const speciesExists = (id) => load().species.has(id);
const photoInfo = (id) => load().photo.get(Number(id)) || null;
const photoSpecies = (id) => (photoInfo(id) || {}).species || null;
const speciesTier = (id) => load().tier.get(id) || 1;

/**
 * The daily puzzle for a game, day and area ('in' or 'na'), or null when the schedule has no entry (the website then
 * plays an unranked daily it works out itself).
 *   sarpa:   { questions: [{ photo, species, options: [4 species ids] }] }
 *   herpdle: { species, photo }
 * (in the file, species are stored as positions in the species list to keep it small)
 */
function daily(game, day, area = 'in') {
  const { raw } = load();
  const d = area === 'na' ? (raw.daily[day] || {}).na : raw.daily[day];
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

module.exports = { load, speciesExists, photoInfo, photoSpecies, speciesTier, daily, version, lastScheduledDay };
