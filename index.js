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
  _stubShuffle: goBlocks._stubShuffle
};
