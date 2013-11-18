'use strict';

var buffers = require('./lib/buffers'),
    chans = require('./lib/channels'),
    goBlocks = require('./lib/go_blocks'),
    extend = require('./lib/util').extend;

var chan = chans.chan,
    buffer = chans.defaultBuffer,
    slidingBuffer = buffers.slidingBuffer,
    droppingBuffer = buffers.droppingBuffer,
    putAsync = chans.putAsync,
    takeAsync = chans.takeAsync,
    go = goBlocks.go,
    take = goBlocks.take,
    put = goBlocks.put,
    alts = goBlocks.alts;

function close(channel) {
  return channel.close();
}

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

function mapPull(channel, fn) {
  return new MapPullChannel(channel, fn);
}

function MapPullChannel(channel, fn) {
  this._channel = channel;
  this._fn = fn;
}

extend(MapPullChannel.prototype, {
  take: function(handler) {
    var ret = this._channel.take(new MapPullHandler(handler, this._fn));

    if (ret.immediate) {
      return {immediate: true, value: this._fn(ret.value)};
    } else {
      return ret;
    }
  },

  put: function(value, handler) {
    return this._channel.put(value, handler);
  },

  close: function() {
    this._channel.close(this._channel);
  }
});

function MapPullHandler(handler, fn) {
  this._handler = handler;
  this._fn = fn;
}

extend(MapPullHandler.prototype, {
  isActive: function() {
    return this._handler.isActive();
  },

  commit: function() {
    var self = this;
    var callback = this._handler.commit();

    return function(val) {
      callback(val === null ? null : self._fn(val));
    };
  }
});

function mapPush(channel, fn) {
  return new MapPushChannel(channel, fn);
}

function MapPushChannel(channel, fn) {
  this._channel = channel;
  this._fn = fn;
}

extend(MapPushChannel.prototype, {
  take: function(handler) {
    return this._channel.take(handler);
  },

  put: function(value, handler) {
    return this._channel.put(this._fn(value), handler);
  },

  close: function() {
    return this._channel.close();
  }
});

function map(channels /* , [bufOrN], fn */) {
  var bufOrN, fn;
  if (arguments.length === 2) {
    fn = arguments[1];
  } else if (arguments.length === 3) {
    bufOrN = arguments[1];
    fn = arguments[2];
  } else {
    throw new Error('Invalid number of arguments provided (' +
                    arguments.length +'). Expected 2 or 3');
  }

  var chanCount = channels.length;
  var rets = new Array(chanCount);
  var doneCount;
  var doneChan = chan(1);
  var out = chan(bufOrN);
  var done = [];

  function doneFn(i) {
    return function(val) {
      rets[i] = val;
      doneCount--;

      if (doneCount === 0) {
        putAsync(doneChan, rets.slice(0));
      }
    };
  }

  for (var i = 0; i < chanCount; i++) {
    done[i] = doneFn(i);
  }

  go(function*() {
    while (true) {
      doneCount = chanCount;
      for (var j = 0; j < chanCount; j++) {
        try {
          takeAsync(channels[j], done[j]);
        } catch (e) {
          doneCount--;
        }
      }

      var localRets = yield take(doneChan);
      var someNull = false;
      for (var k = 0, l = localRets.length; k < l; k++) {
        if (rets[k] === null) {
          someNull = true;
          break;
        }
      }

      if (someNull) {
        close(out);
        break;
      } else {
        yield put(out, fn.apply(null, localRets));
      }
    }
  });

  return out;
}

function reduce(channel, init, fn) {
  var ret = init;

  return go(function*() {
    while (true) {
      var val = yield take(channel);
      if (val === null) {
        return ret;
      } else {
        ret = fn(ret, val);
      }
    }
  });
}

function merge(channels, bufOrN) {
  if (typeof bufOrN === 'undefined') bufOrN = null;

  var out = chan(bufOrN);

  go(function*() {
    var currentChans = channels;
    var result, newChans, ch, i, j;

    while (true) {
      if (currentChans.length > 0) {
        result = yield alts(currentChans);

        if (result.value === null) {
          newChans = [];

          for (i = 0, j = currentChans.length; i < j; i++) {
            ch = currentChans[i];
            if (ch !== result.chan) newChans.push(ch);
          }

          currentChans = newChans;
        } else {
          yield put(out, result.value);
        }
      } else {
        close(out);
      }
    }
  });

  return out;
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
  mapPull: mapPull,
  mapPush: mapPush,
  map: map,
  reduce: reduce,
  merge: merge,
  _stubShuffle: goBlocks._stubShuffle
};
