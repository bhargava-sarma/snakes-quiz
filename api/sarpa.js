/* Vercel serverless function: the accounts and leaderboard API. The code lives in ../server. */
const { handler } = require('../server/app');

module.exports = (req, res) => handler(req, res);
