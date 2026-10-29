/* The legal section: terms of use, privacy policy, safety disclaimer, licences, and how to ask for something to be
 * taken down. Plain language on purpose. Names and contacts come from js/config.js. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  SQ.views = SQ.views || {};

  const UPDATED = '29 October 2026';

  const CFG = () => window.SQ_CONFIG || {};
  const who = () => CFG().operator || 'the people who run this website';
  const Who = () => (CFG().operator ? CFG().operator : 'The people who run this website');

  function contactBits() {
    const c = CFG();
    const out = [];
    if (c.contactEmail) out.push(h('a', { href: 'mailto:' + c.contactEmail }, c.contactEmail));
    if (c.contactUrl) out.push(h('a', { href: c.contactUrl, target: '_blank', rel: 'noopener' }, c.contactEmail ? 'the project’s issue tracker' : 'the project’s issue tracker on GitHub'));
    if (!out.length) return 'the contact details given by whoever runs this site';
    return out.length === 2 ? [out[0], ' or ', out[1]] : out[0];
  }

  const sec = (title, ...body) => h('section.legal-sec', h('h2', title), ...body);
  const ul = (...items) => h('ul.why-list', items.map((x) => h('li', x)));

  const PAGES = {
    terms: {
      title: 'Terms of use',
      short: 'Terms',
      ico: 'file',
      body: () => [
        sec('1. About Sarpa',
          h('p', 'Sarpa is a free, non-commercial educational website for learning to identify the snakes of India. It includes the Sarpa photo quiz, Herpdle, a field guide, flashcards and snakebite first-aid information. It is run by ', who(), '. By using the site you agree to these terms. If you do not agree, please do not use it.')),
        sec('2. Accounts',
          ul(SQ.api.known() === 'off'
            ? 'This copy of Sarpa has no accounts: everything, including the games, is used without one. The rest of this section applies to copies of the site that offer accounts.'
            : 'You can read the field guide, safety pages and everything else without an account. Playing the games (Sarpa and Herpdle) needs a free account, so that every game can count on the leaderboards.',
            'An account is just a username and a 6-digit PIN. Keep your PIN secret. There is no e-mail address on your account, so a forgotten PIN cannot be recovered.',
            'One person per account. Do not share or sell accounts, and do not sign in to someone else’s.',
            'Choose a respectful username. Usernames that are offensive, hateful, misleading or that pretend to be someone else may be removed.',
            'You can delete your account at any time from your profile page.')),
        sec('3. Children',
          h('p', 'If you are under 18, please ask a parent or guardian before you create an account, and only create one if they agree. When you create an account you confirm that you are 18 or older, or that your parent or guardian has agreed. Sarpa shows no adverts and does not track or profile anyone.')),
        sec('4. Fair play',
          h('p', 'Leaderboards are for fun and only work if everyone plays fairly. Do not use scripts, bots, other people’s answers or anything else that gets around the rules, and do not try to break or overload the site. Results or accounts that break these rules may be removed without notice.')),
        sec('5. Not a safety tool',
          h('p', 'Sarpa is for learning only. Do not use it to decide whether a real snake is dangerous, and never touch, catch or corner a wild snake. Telling snakes apart from a photo is unreliable, even for experts. A snakebite is always a medical emergency: call 108 or 112 and go to a hospital. See the ', h('a', { href: '#/legal/disclaimer' }, 'safety disclaimer'), '.')),
        sec('6. Content and licences',
          h('p', 'The photographs belong to their photographers and are used under the Creative Commons licence shown with each photo. Many of these licences allow only non-commercial use. The code is open source under the MIT licence. See ', h('a', { href: '#/legal/licences' }, 'licences and credits'), ' for the details.')),
        sec('7. No guarantees',
          h('p', 'Sarpa is provided free of charge, “as is” and “as available”. We try to keep the information accurate and the site running, but we cannot promise that it is complete, correct, always available or free of errors, and the site, its games, leaderboards and accounts may be changed, reset or closed at any time. To the fullest extent allowed by law, ', who(), ' are not liable for any loss or harm arising from the use of the site or from relying on its content.')),
        sec('8. Changes and law',
          h('p', 'These terms may be updated from time to time; the date at the top shows the latest version. If you keep using the site after a change, the new terms apply. These terms are governed by the laws of India.')),
        sec('9. Contact',
          h('p', 'Questions about these terms: ', contactBits(), '.')),
      ],
    },

    privacy: {
      title: 'Privacy policy',
      short: 'Privacy',
      ico: 'lock',
      body: () => [
        h('p.lead-p', 'Short version: Sarpa collects as little as possible. Without an account, nothing about you leaves your device. With an account, the site stores your username, a scrambled form of your PIN and your game results, and shows your username and scores on public leaderboards. No adverts, no tracking, no cookies, and your data is never sold.'),
        sec('Without an account',
          h('p', 'Your quiz history, snake-dex, badges, Herpdle games and settings are kept only in your own browser (its “local storage”), on your device. They are not sent to us. You can download a backup or erase them on the profile page (“Reset progress”), or by clearing your browser’s data for this site.')),
        sec('With an account, we store',
          ul(h('span', h('strong', 'Your username'), ' and the date you created the account. Your username is public: it appears on the leaderboards.'),
            h('span', h('strong', 'Your PIN, in scrambled form only.'), ' It is stored as a salted one-way hash (scrypt), so nobody can read your PIN from the database, including us.'),
            h('span', h('strong', 'Your games:'), ' for each ranked game, the date, the points, how many answers were right or how many guesses you needed, and how long it took. From these the site keeps your streaks, totals and leaderboard places. The answers you sent are checked and then thrown away.'),
            h('span', h('strong', 'Sign-in sessions:'), ' when you sign in, your browser keeps a random session key; the database keeps only a one-way hash of it. A session ends when you sign out, when you change your PIN (on other devices), or after 180 days without use.'))),
        sec('Security records',
          h('p', 'To stop people guessing PINs or flooding the site with accounts, the server counts recent attempts. These counters are labelled with a one-way hash of your network (IP) address, never the address itself, and they delete themselves after at most two days.')),
        sec('What we do not do',
          ul('No adverts and no advertising or analytics trackers.',
            'No cookies. (Your browser’s local storage is used only for the things listed above.)',
            'No e-mail address, phone number, real name, location or contacts are asked for or collected.',
            'We never sell or share your data, except with the service providers below, who store or carry it for us.')),
        sec('Who handles the data',
          h('p', `The site and its database run on ${CFG().providers || 'cloud services'}, which process data on behalf of ${who()}. Like any web host, the hosting provider may briefly log technical details such as IP addresses to deliver and protect the site. Photos are served from this site; if one cannot be loaded, your browser may fetch it directly from iNaturalist’s public image store, which then sees your IP address.`)),
        sec('How long we keep it',
          ul('Daily leaderboards are kept for about 140 days and weekly ones for about 400 days, so that recent days can be looked back on.',
            'Your account, statistics and all-time leaderboard places are kept until you delete your account.',
            'Accounts may be removed if the service closes, or if they break the terms of use.')),
        sec('Your choices and rights',
          ul(h('span', h('strong', 'See your data: '), 'your profile page shows your account and statistics.'),
            h('span', h('strong', 'Delete everything: '), 'the “Delete account” button on your profile page deletes your account, PIN, statistics and leaderboard places straight away. This cannot be undone.'),
            h('span', h('strong', 'Ask us: '), 'for anything else (a correction, a question, or a complaint), contact ', contactBits(), '.')),
          h('p', 'Depending on where you live, data protection laws, such as India’s Digital Personal Data Protection Act, 2023, or the EU and UK General Data Protection Regulation, may give you further rights, including to access, correct and erase your personal data and to have a complaint handled. We will help you use them.')),
        sec('Children',
          h('p', 'Children under 18 should only create an account with the agreement of a parent or guardian. Sarpa collects no more from children than from anyone else (a username, a scrambled PIN and game results), and never shows them adverts or tracks them. If you are a parent or guardian and want a child’s account removed, contact us with the username.')),
        sec('Changes',
          h('p', 'If this policy changes, the new version will be posted here with a new date.')),
      ],
    },

    disclaimer: {
      title: 'Safety and accuracy disclaimer',
      short: 'Disclaimer',
      ico: 'warn',
      body: () => [
        h('div.notice.danger', icon('warn', { size: 22 }), h('div', h('strong', 'In a snakebite emergency, call 108 (ambulance) or 112 and go to the nearest hospital with anti-snake venom straight away. '),
          'Do not wait for symptoms, and do not use home remedies, tourniquets or traditional healers. ', h('a', { href: '#/safety' }, 'Read the first-aid guide'), '.')),
        sec('For learning only',
          h('p', 'Sarpa teaches general snake identification. It is not medical advice, not a professional identification service and not a safety tool. Never decide whether a real snake is dangerous from this site, a photo or a quick look: many harmless snakes look like venomous ones and the other way round. Keep your distance from every wild snake, and call a trained local rescuer or the forest department if one needs moving.')),
        sec('Accuracy',
          h('p', 'The photos are community observations from iNaturalist that other naturalists agreed on, and the species texts are written from standard field-guide knowledge. Even so, some photos may be mislabelled and some facts may be incomplete or out of date; snake names and classifications also change as science moves on. If you spot a mistake, please report it (there is a “Report photo” button on every question, or contact ', contactBits(), ').')),
        sec('First aid information',
          h('p', 'The safety page follows the widely used “Do it R.I.G.H.T.” approach of the national and WHO South-East Asia snakebite guidelines, but it is general information. Always follow the advice of doctors and emergency services.')),
      ],
    },

    licences: {
      title: 'Licences and credits',
      short: 'Licences',
      ico: 'book',
      body: () => {
        const D = SQ.data;
        const counts = {};
        D.photos.forEach((p) => { counts[p.license] = (counts[p.license] || 0) + 1; });
        return [
          sec('Photographs',
            h('p', `All ${D.photos.length.toLocaleString()} photos are © their photographers and come from research-grade observations on `, h('a', { href: 'https://www.inaturalist.org', target: '_blank', rel: 'noopener' }, 'iNaturalist'),
              ', used under the Creative Commons licence each photographer chose. Every photo is credited under it, and all of them are listed on the ', h('a', { href: '#/credits' }, 'photo credits'), ' page.'),
            h('ul.why-list', Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([lic, n]) => {
              const p = D.photos.find((x) => x.license === lic);
              return h('li', p && p.licenseUrl ? h('a', { href: p.licenseUrl, target: '_blank', rel: 'noopener' }, lic.replace(/^CC-(?=[A-Z])/, 'CC ')) : lic, `: ${n.toLocaleString()} photos`);
            })),
            h('p.muted', 'Licences marked NC allow only non-commercial use, so this site and copies of its photos must stay non-commercial. Sarpa is not affiliated with or endorsed by iNaturalist or the photographers.')),
          sec('Text and data',
            h('p', 'The species descriptions, identification notes and quiz explanations were written for Sarpa and are shared under ', h('a', { href: 'https://creativecommons.org/licenses/by/4.0/', target: '_blank', rel: 'noopener' }, 'Creative Commons Attribution 4.0'), '. State names for photos come from boundaries based on OpenStreetMap data, © OpenStreetMap contributors (ODbL).')),
          sec('Code, fonts and icons',
            ul(h('span', 'The website code is open source under the ', h('a', { href: (CFG().repoUrl || '') + '/blob/main/LICENSE', target: '_blank', rel: 'noopener' }, 'MIT licence'), '.'),
              'Fonts: Geist and Geist Mono (Vercel) and Doto, all under the SIL Open Font Licence 1.1, bundled with the site.',
              'Icons are adapted from Feather (MIT licence) and Lucide (ISC licence).')),
        ];
      },
    },

    takedown: {
      title: 'Takedown and corrections',
      short: 'Takedown',
      ico: 'flag',
      body: () => [
        sec('Photographers',
          h('p', 'If one of your photos is shown here and you would like it removed, or credited differently, contact ', contactBits(), ' with the photo’s number (shown in its credit line and on the ', h('a', { href: '#/credits' }, 'photo credits'), ' page). It will be removed promptly. Changing the licence of a photo on iNaturalist to “all rights reserved” also takes it out the next time the data set is rebuilt.')),
        sec('Mistakes and problems',
          h('p', 'Wrong species? Wrong fact? An offensive username on a leaderboard? Please tell us at ', contactBits(), '. For photos, the “Report photo” button on every question also hides it on your device straight away.')),
      ],
    },
  };
  const ORDER = ['terms', 'privacy', 'disclaimer', 'licences', 'takedown'];

  SQ.views.legal = function ({ params }) {
    const key = PAGES[params.page] ? params.page : 'terms';
    const page = PAGES[key];
    const tabs = h('nav.legal-tabs', { 'aria-label': 'Legal pages' }, ORDER.map((k) => h('a.legal-tab' + (k === key ? '.on' : ''),
      { href: '#/legal/' + k, 'aria-current': k === key ? 'page' : null }, icon(PAGES[k].ico, { size: 16 }), PAGES[k].short)));
    const node = h('div.page.wrap.legal',
      SQ.ui.pageHead(page.title, `Last updated ${UPDATED}.`, null, [h('b', 'LG'), 'Legal']),
      tabs,
      h('article.card.legal-body.prose', page.body()),
      h('p.legal-foot.muted', icon('info', { size: 15 }), h('span', Who(), ' wrote these pages in plain language. If anything is unclear, ask: ', contactBits(), '.')));
    return { node, title: page.title, view: 'legal' };
  };

  SQ.legalPages = ORDER.map((k) => ({ key: k, title: PAGES[k].title, short: PAGES[k].short }));
})();
