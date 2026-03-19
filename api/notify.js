const { netlifyToVercel } = require('./_adapter');
const { handler } = require('./_notify');
module.exports = async function(req, res) {
  return netlifyToVercel(handler, req, res);
};
