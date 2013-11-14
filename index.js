require('setimmediate');

function chan() {
  return [];
}

function putAsync(port, val, onComplete) {
  port.push(val);
  setImmediate(onComplete);
}

function takeAsync(port, onComplete) {
  var val = port.shift();
  setImmediate(function() { onComplete(val); })
}

module.exports = {
  chan: chan,
  putAsync: putAsync,
  takeAsync: takeAsync
};
