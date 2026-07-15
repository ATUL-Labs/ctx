'use strict';

const errors = [];
const MAX_ERRORS = 200;

function addError(err) {
  errors.push({ ...err, ts: Date.now() });
  if (errors.length > MAX_ERRORS) errors.shift();
}

function getErrors(since) {
  if (since) return errors.filter(e => e.ts > since);
  return errors;
}

function clearErrors() {
  errors.length = 0;
}

module.exports = { addError, getErrors, clearErrors };
