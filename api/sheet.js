const { netlifyToVercel } = require('./_adapter');
const { handler } = require('./_proxy');
module.exports = async function(req, res) {
  return netlifyToVercel(handler, req, res);
};
