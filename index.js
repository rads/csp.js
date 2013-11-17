'use strict';

var buffers = require('./lib/buffers'),
    chans = require('./lib/channels'),
    goBlocks = require('./lib/go_blocks');

var chan = chans.chan,
    buffer = chans.defaultBuffer,
    slidingBuffer = buffers.slidingBuffer,
    droppingBuffer = buffers.droppingBuffer,
    putAsync = chans.putAsync,
    takeAsync = chans.takeAsync,
    close = chans.close,
    go = goBlocks.go,
    take = goBlocks.take,
    put = goBlocks.put,
    alts = goBlocks.alts;

function timeout(duration) {
  var c = chan();
  setTimeout(function() { close(c); }, duration);
  return c;
}

function pipe(from, to, shouldClose) {
  if (typeof shouldClose === 'undefined') shouldClose = true;

  go(function*() {
    while (true) {
      var val = yield take(from);
      if (val === null) {
        if (shouldClose) close(to);
        break;
      } else {
        yield put(to, val);
      }
    }
  });

  return to;
}

module.exports = {
  chan: chan,
  buffer: buffer,
  slidingBuffer: slidingBuffer,
  droppingBuffer: droppingBuffer,
  putAsync: putAsync,
  takeAsync: takeAsync,
  close: close,
  go: go,
  put: put,
  take: take,
  alts: alts,
  timeout: timeout,
  pipe: pipe,
  _stubShuffle: goBlocks._stubShuffle
};
