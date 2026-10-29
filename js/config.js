/* Site settings. Edit these for your own copy of Sarpa. */
window.SQ_CONFIG = {
  // Where the accounts-and-leaderboards API lives (api/sarpa.js on Vercel). When it is not reachable or has no
  // database, the games still work, without accounts or leaderboards.
  apiBase: '/api/sarpa',

  // true: players sign in (username + 6-digit PIN) to play Sarpa and Herpdle, so every game counts on the
  // leaderboards. The field guide, flashcards, safety pages and everything else never need an account.
  requireAccountForGames: true,

  // Who runs this copy of the site and how to reach them (shown on the legal pages). If the e-mail address is
  // left empty, the pages point to the contact page below instead.
  operator: '',                     // e.g. 'Asha Rao' or 'The Sarpa team'; empty: "the people who run this site"
  contactEmail: '',
  // The services that store or carry data for this site (named in the privacy policy).
  providers: 'Vercel (website hosting) and Upstash (the accounts database)',
  contactUrl: 'https://github.com/bhargava-sarma/snakes-quiz/issues',
  repoUrl: 'https://github.com/bhargava-sarma/snakes-quiz',
};
