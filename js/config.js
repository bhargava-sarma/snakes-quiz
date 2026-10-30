/* Site settings. Edit these for your own copy of Sarpa. */
window.SQ_CONFIG = {
  // Where the accounts-and-leaderboards API lives (api/sarpa.js on Vercel). When it is not reachable or has no
  // database, the games still work, without accounts or leaderboards.
  apiBase: '/api/sarpa',

  // true: players sign in (username + 6-digit PIN) to play Sarpa and Herpdle, so every game counts on the
  // leaderboards. The field guide, flashcards, safety pages and everything else never need an account.
  requireAccountForGames: true,

  // Who runs this site and how to reach them (shown on the legal pages). With no e-mail address, the legal pages
  // send people to the issue tracker instead (which is public, so they also say not to post anything private there).
  operator: 'bhargava-sarma',
  operatorUrl: 'https://github.com/bhargava-sarma',
  contactEmail: '',
  contactUrl: 'https://github.com/bhargava-sarma/snakes-quiz/issues',
  repoUrl: 'https://github.com/bhargava-sarma/snakes-quiz',
};
