'use strict';

var buffers = require('./buffers'),
    util = require('./util');

var MAX_DIRTY = 64;
var MAX_QUEUE_SIZE = 1024;

var dispatch = process.nextTick;

function defaultBuffer(size) {
  return buffers.fixedBuffer(size);
}

function FnHandler(callback) {
  this._callback = callback;
}

util.extend(FnHandler.prototype, {
  isActive: function() {
    return true;
  },

  commit: function() {
    return this._callback;
  }
});

function chan(bufferOrN) {
  return new Channel(bufferOrN);
}

function Channel(bufferOrN) {
  var buf;
  if (!bufferOrN) {
    buf = null;
  } else if (typeof bufferOrN === 'number') {
    buf = defaultBuffer(bufferOrN);
  } else {
    buf = bufferOrN;
  }

  this._id = util.uuid();
  this._buffer = buf;
  this._puts = buffers.ringBuffer(32);
  this._dirtyPuts = 0;
  this._takes = buffers.ringBuffer(32);
  this._dirtyTakes = 0;
  this._isClosed = false;
}

Channel.prototype.take = function(handler) {
  if (!handler.isActive()) return {immediate: false};

  var buffer = this._buffer;
  var puts = this._puts;
  var takes = this._takes;

  if (buffer && buffer.count() > 0) {
    handler.commit();
    return {immediate: true, value: buffer.remove()};
  } else {
    var putter = puts.pop();
    while (putter) {
      if (putter.handler.isActive()) {
        var callback = putter.handler.commit();
        handler.commit();
        dispatch(callback);
        return {immediate: true, value: putter.value};
      } else {
        putter = puts.pop();
      }
    }

    if (this._isClosed) {
      handler.commit();
      return {immediate: true, value: null};
    } else {
      if (this._dirtyTakes > MAX_DIRTY) {
        this._dirtyTakes = 0;
        takes.cleanup(function(handler) { return handler.isActive(); });
      } else {
        this._dirtyTakes++;
      }

      if (takes.length >= MAX_QUEUE_SIZE) {
        throw new Error('No more than ' + MAX_QUEUE_SIZE + ' pending takes ' +
                        'are allowed on a single channel.');
      }

      takes.unboundedUnshift(handler);
      return {immediate: false};
    }
  }
};

Channel.prototype.put = function(value, handler) {
  if (this._isClosed || !handler.isActive()) {
    return {immediate: true};
  }

  var buffer = this._buffer;
  var takes = this._takes;
  var puts = this._puts;

  var taker = takes.pop();
  while (taker) {
    if (taker.isActive()) {
      var callback = taker.commit();
      handler.commit();
      dispatch(function() { callback(value); });
      return {immediate: true};
    } else {
      taker = takes.pop();
    }
  }

  if (buffer && !buffer.isFull()) {
    handler.commit();
    buffer.add(value);
    return {immediate: true};
  } else {
    if (this._dirtyPuts > MAX_DIRTY) {
      this._dirtyPuts = 0;
      puts.cleanup(function(putter) {
        return putter.handler.isActive();
      });
    } else {
      this._dirtyPuts++;
    }

    if (puts.length >= MAX_QUEUE_SIZE) {
      throw new Error('No more than ' + MAX_QUEUE_SIZE + 'pending puts are ' +
                      'allowed on a single channel. Consider using a ' +
                      'windowed buffer.');
    }

    puts.unboundedUnshift({
      handler: handler,
      value: value
    });
    return {immediate: false};
  }
};

Channel.prototype.close = function() {
  this._isClosed = true;

  var takes = this._takes;
  var taker = takes.pop();
  var callback;

  while (taker) {
    if (taker.isActive()) {
      callback = taker.commit();
      // Wrap callback in an immediately executed function to prevent
      // unintended capture of var when looping.
      (function(cb) {
        dispatch(function() { cb(null); });
      })(callback);
      break;
    }

    taker = takes.pop();
  }
};

function noOp() {}

function takeAsync(channel, onComplete, onCaller) {
  if (typeof onCaller === 'undefined') onCaller = true;
  if (!onComplete) onComplete = noOp;

  var result = channel.take(new FnHandler(onComplete));
  if (result.immediate) {
    if (onCaller) {
      onComplete(result.value);
    } else {
      dispatch(function() { onComplete(result.value); });
    }
  }
}

function putAsync(channel, value, onComplete, onCaller) {
  if (typeof onCaller === 'undefined') onCaller = true;
  if (!onComplete) onComplete = noOp;

  var result = channel.put(value, new FnHandler(onComplete));
  if (result.immediate) {
    if (onCaller) {
      onComplete();
    } else {
      dispatch(onComplete);
    }
  }
}

module.exports = {
  chan: chan,
  takeAsync: takeAsync,
  putAsync: putAsync,
  defaultBuffer: defaultBuffer,
  FnHandler: FnHandler
};
