/* The legal section: terms of use, privacy policy, safety disclaimer, licences, and how to ask for something to be
 * taken down. Plain language on purpose. Who runs the site and how to reach them come from js/config.js.
 * The privacy policy describes what the code really does: when the code changes, check it still does. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  SQ.views = SQ.views || {};

  const UPDATED = '30 October 2026';

  const CFG = () => window.SQ_CONFIG || {};

  /** The person who runs the site, linked to their profile. */
  function runBy() {
    const c = CFG();
    if (!c.operator) return 'the person who runs this website';
    return c.operatorUrl ? h('a', { href: c.operatorUrl, target: '_blank', rel: 'noopener' }, c.operator) : c.operator;
  }

  function contactBits() {
    const c = CFG();
    const out = [];
    if (c.contactEmail) out.push(h('a', { href: 'mailto:' + c.contactEmail }, c.contactEmail));
    if (c.contactUrl) out.push(h('a', { href: c.contactUrl, target: '_blank', rel: 'noopener' }, 'the project’s issue tracker on GitHub'));
    if (!out.length) return 'the contact details given by whoever runs this site';
    return out.length === 2 ? [out[0], ' or ', out[1]] : out[0];
  }
  // the issue tracker is public, so say so wherever people are sent there about something personal
  const publicNote = () => (CFG().contactEmail ? null : ' Issues there are public, so never post your PIN or anything private.');

  const sec = (title, ...body) => h('section.legal-sec', h('h2', title), ...body);
  const ul = (...items) => h('ul.why-list', items.map((x) => h('li', x)));
  const b = (text) => h('strong', text);

  const PAGES = {
    terms: {
      title: 'Terms of use',
      short: 'Terms',
      ico: 'file',
      body: () => [
        sec('1. About Sarpa',
          h('p', 'Sarpa is a free website for learning to identify the snakes of India: a photo quiz, the Herpdle clue game, a field guide, flashcards and snakebite first-aid information. It is a non-commercial hobby project, made and run in spare time by one person, ', runBy(), '. It has no adverts, no paid features and no payments of any kind, and it does not make money.'),
          h('p', 'By using Sarpa you agree to these terms. If you do not agree, please do not use it.')),
        sec('2. Using Sarpa',
          h('p', 'You are welcome to use Sarpa for free, for your own learning, in classrooms and in nature education. Please do not use its photos commercially (see section 7), and do not try to break, overload or misuse the website or its accounts.')),
        sec('3. Accounts',
          ul(SQ.api.known() === 'off'
            ? 'Accounts are switched off on this copy of Sarpa, so everything, including the games, is used without one.'
            : CFG().requireAccountForGames
              ? 'You can use the field guide, flashcards, safety pages and everything else without an account. Playing the games (Sarpa and Herpdle) needs a free account, so that every game can count on the leaderboards.'
              : 'Accounts are optional. With one, your games count on the leaderboards.',
          'An account is just a username and a 6-digit PIN. Keep your PIN secret. There is no e-mail address on an account, so a forgotten PIN cannot be reset.',
          'One person per account. Do not share or sell accounts, and do not sign in to someone else’s.',
          'Your username is shown publicly on the leaderboards, so choose a respectful one and do not use your full real name. Usernames that are offensive, hateful, misleading or that pretend to be someone else may be removed.',
          'You can delete your account at any time from your profile page.')),
        sec('4. Children',
          h('p', 'If you are under 18, you may create an account only if a parent or guardian agrees. When you create an account you confirm that you are 18 or older, or that your parent or guardian has agreed. Sarpa shows no adverts and does not track or profile anyone.')),
        sec('5. Fair play',
          h('p', 'Leaderboards are for fun and only work if everyone plays fairly. Do not use scripts, bots, other people’s answers or anything else that gets around the rules. Results or accounts that break these rules may be removed without notice.')),
        sec('6. Not a safety tool',
          h('p', 'Sarpa is for learning only. Do not use it to decide whether a real snake is dangerous, and never touch, catch or corner a wild snake. Telling snakes apart from a photo is unreliable, even for experts. A snakebite is always a medical emergency: call 108 or 112 and go to a hospital. See the ', h('a', { href: '#/legal/disclaimer' }, 'safety disclaimer'), '.')),
        sec('7. Photos, text and code',
          h('p', 'The photographs belong to their photographers and are used under the Creative Commons licence each of them chose. Many of those licences allow only non-commercial use. The species texts are shared under Creative Commons Attribution 4.0 and the code under the MIT licence. See ', h('a', { href: '#/legal/licences' }, 'licences and credits'), ' for the details.')),
        sec('8. No guarantees',
          h('p', 'Sarpa is a free hobby project, provided “as is” and “as available”. Care is taken to keep the information accurate and the site running, but there is no promise that it is complete, correct, always available or free of errors. The site, its games, leaderboards and accounts may be changed, reset or closed at any time, with or without notice. To the fullest extent allowed by law, ', runBy(), ' is not liable for any loss or harm arising from using the site or from relying on its content.')),
        sec('9. Changes and law',
          h('p', 'These terms may be updated; the date at the top shows the latest version. If you keep using the site after a change, the new terms apply. These terms are governed by the laws of India.')),
        sec('10. Contact',
          h('p', 'Questions about these terms: ', contactBits(), '.')),
      ],
    },

    privacy: {
      title: 'Privacy policy',
      short: 'Privacy',
      ico: 'lock',
      body: () => [
        h('p.lead-p', 'Short version: Sarpa collects as little as it can. Your progress stays in your own browser. If you make an account, the site stores your username, a scrambled form of your PIN and your game results, and shows your username and scores on public leaderboards. Visits are counted with cookie-free statistics that cannot follow you from day to day or across websites. No adverts, no cookies, and your data is never sold.'),
        sec('Who is responsible',
          h('p', 'Sarpa is a non-commercial hobby project run by ', runBy(), ', who decides how its data is used (in legal terms, the data fiduciary or controller). Questions and requests: ', contactBits(), '.', publicNote())),
        sec('What stays on your device',
          h('p', 'Your quiz history, snake-dex, badges, Herpdle games and settings are kept only in your browser’s local storage, on your device, and are not sent anywhere. If you sign in, your username and a random sign-in key are kept there too, along with any finished games still waiting to be saved. On your profile page you can download a backup or erase your progress (“Download backup”, “Reset progress”). Signing out removes the sign-in key, and clearing your browser’s data for this site removes everything.')),
        sec('When you visit',
          ul(h('span', b('Hosting. '), 'Sarpa is hosted by Vercel. As with any website, Vercel’s servers receive your IP address and basic browser details with every request, to deliver the pages and protect the site, and may keep them for a short time in technical logs.'),
            h('span', b('Visitor statistics. '), 'Vercel Web Analytics counts visits. For each page view it records the page address, the website that linked to it, your approximate location (country, region and city, worked out from your IP address; the address itself is not recorded with it), and your browser, operating system and type of device. It uses no cookies and stores nothing on your device. Visitors are told apart only by a code made from the request, which is thrown away after 24 hours, so nobody can follow you from day to day or across websites. Only the totals are looked at.'),
            h('span', b('Speed measurements. '), 'Vercel Speed Insights measures how quickly pages load and respond, together with the page address, your browser, operating system, type of device, network speed (such as “4g”) and country. These measurements are not linked to you or to your IP address.'),
            h('span', b('Photos. '), 'The photos are served from this site. If your browser cannot show one (for example an older browser without support for the AVIF image format), it loads that photo from iNaturalist’s public image store on Amazon Web Services instead, which then receives your IP address and browser details, as any website would.'),
            h('span', b('Links. '), 'Links to other websites (iNaturalist, Creative Commons, GitHub) take you to those sites, whose own privacy policies apply.'))),
        sec('If you make an account',
          h('p', 'The accounts database stores only this:'),
          ul(h('span', b('Your username'), ', and when you created the account and last changed its PIN. Your username is public: it appears on the leaderboards.'),
            h('span', b('Your PIN, in scrambled form only.'), ' It is stored as a salted one-way hash (scrypt), so nobody can read your PIN from the database, including the person who runs the site.'),
            h('span', b('Your games:'), ' for each ranked game, the date, the game and mode, the points, how many answers were right or how many guesses you needed, and how long it took. From these come your streaks, totals and leaderboard places; a list of your last 50 games is kept for your profile page. The answers you sent are checked and then thrown away.'),
            h('span', b('Sign-in sessions:'), ' only a one-way hash of each sign-in key. A session ends when you sign out, when you change your PIN (on your other devices), or after 180 days without use.'))),
        sec('Security records',
          h('p', 'To stop people guessing PINs or flooding the site with accounts, the server counts recent attempts for each account and for each network. A network is recorded only as a one-way code made from its IP address with a secret key, never as the address itself, and these counters delete themselves within two days.')),
        sec('Who handles the data',
          h('p', 'The website runs on Vercel, and the accounts database on Upstash (connected through Vercel). They store and carry the data only so that the site can run, under their own security and privacy terms, and their servers may be outside India. Nobody else receives it: your data is never sold, never shared for advertising and never used to profile you.')),
        sec('How long it is kept',
          ul('Daily leaderboards: about 140 days. Weekly leaderboards: about 400 days.',
            'Your account, statistics and all-time leaderboard places: until you delete your account, or until the site closes. Accounts are not deleted for being unused.',
            'Unfinished games: up to two days. Sign-in sessions: up to 180 days after you last used them.')),
        sec('Your choices and rights',
          ul(h('span', b('No account needed: '), 'the field guide, flashcards, safety pages and everything except the ranked games work without one.'),
            h('span', b('See your data: '), 'your profile page shows your account, statistics and recent games.'),
            h('span', b('Delete it: '), '“Delete account” on your profile page removes your username, PIN, sessions, statistics and leaderboard places straight away. Only short-lived technical records (unfinished games and attempt counters) are left until they expire, within two days, and your username becomes free for others. This cannot be undone.'),
            h('span', b('Ask: '), 'for anything else, such as a correction, a question or a complaint, contact ', contactBits(), '.', publicNote())),
          h('p', 'Data protection laws, such as India’s Digital Personal Data Protection Act, 2023, may give you further rights, including to access, correct and erase your personal data and to have a grievance dealt with. Ask, and your request will be handled as quickly as possible. In India you can also take a complaint to the Data Protection Board of India.')),
        sec('Children',
          h('p', 'Children under 18 may create an account only with the agreement of a parent or guardian. Sarpa collects no more from children than from anyone else (a username, a scrambled PIN and game results), and never shows them adverts, tracks them or profiles them. A child or a parent can delete the account from its profile page at any time, or ask for it to be removed through ', contactBits(), ' (give only the username).')),
        sec('What Sarpa never does',
          ul('No adverts and no advertising trackers.',
            'No cookies: Sarpa sets none. (Your browser’s local storage is used only for the things listed above.)',
            'No e-mail address, phone number, real name, location or contacts are asked for.',
            'Your data is never sold or passed on, except to the hosting providers named above, who run the site.')),
        sec('Changes',
          h('p', 'If this policy changes, the new version is posted here with a new date.')),
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
          h('p', 'The photos are community observations from iNaturalist that other naturalists agreed on, and the species texts are written from standard field-guide knowledge. Even so, some photos may be mislabelled and some facts may be incomplete or out of date; snake names and classifications also change as science moves on. If you spot a mistake, please report it: there is a “Report photo” button on every question, or contact ', contactBits(), '.')),
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
            h('ul.why-list', Object.entries(counts).sort((a, c) => c[1] - a[1]).map(([lic, n]) => {
              const p = D.photos.find((x) => x.license === lic);
              return h('li', p && p.licenseUrl ? h('a', { href: p.licenseUrl, target: '_blank', rel: 'noopener' }, lic.replace(/^CC-(?=[A-Z])/, 'CC ')) : lic, `: ${n.toLocaleString()} photos`);
            })),
            h('p.muted', 'Licences marked NC allow only non-commercial use, which is one reason Sarpa is, and stays, non-commercial. Copies of its photos must stay non-commercial too. Sarpa is not affiliated with or endorsed by iNaturalist or the photographers.')),
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
          h('p', 'Wrong species? Wrong fact? An offensive username on a leaderboard? Please report it through ', contactBits(), '. For photos, the “Report photo” button on every question also hides it on your device straight away.')),
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
      h('p.legal-foot.muted', icon('info', { size: 15 }), h('span', 'Written in plain language by ', runBy(), '. If anything is unclear, ask through ', contactBits(), '.')));
    return { node, title: page.title, view: 'legal' };
  };

  SQ.legalPages = ORDER.map((k) => ({ key: k, title: PAGES[k].title, short: PAGES[k].short }));
})();
