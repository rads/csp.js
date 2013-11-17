'use strict';

var buffers = require('./buffers');

require('setimmediate');

var MAX_DIRTY = 64;
var MAX_QUEUE_SIZE = 1024;

function defaultBuffer(size) {
  return buffers.fixedBuffer(size);
}

function chan(bufferOrN) {
  var buf;
  if (!bufferOrN) {
    buf = null;
  } else if (typeof bufferOrN === 'number') {
    buf = defaultBuffer(bufferOrN);
  } else {
    buf = bufferOrN;
  }

  return {
    buffer: buf,
    puts: buffers.ringBuffer(32),
    dirtyPuts: 0,
    takes: buffers.ringBuffer(32),
    dirtyTakes: 0,
    isClosed: false
  };
}

function FnHandler(callback) {
  this._callback = callback;
}

FnHandler.prototype.isActive = function() {
  return true;
};

FnHandler.prototype.commit = function() {
  return this._callback;
};

function take(channel, handler) {
  if (!handler.isActive()) return {immediate: false};

  var buffer = channel.buffer;
  var puts = channel.puts;
  var takes = channel.takes;

  if (buffer && buffer.count() > 0) {
    handler.commit();
    return {immediate: true, value: buffer.remove()};
  } else {
    var putter = puts.pop();
    while (putter) {
      if (putter.handler.isActive()) {
        var callback = putter.handler.commit();
        handler.commit();
        setImmediate(callback);
        return {immediate: true, value: putter.value};
      } else {
        putter = puts.pop();
      }
    }

    if (channel.isClosed) {
      handler.commit();
      return {immediate: true, value: null};
    } else {
      if (channel.dirtyTakes > MAX_DIRTY) {
        channel.dirtyTakes = 0;
        takes.cleanup(function(handler) { return handler.isActive(); });
      } else {
        channel.dirtyTakes++;
      }

      if (takes.length >= MAX_QUEUE_SIZE) {
        throw new Error('No more than ' + MAX_QUEUE_SIZE + ' pending takes ' +
                        'are allowed on a single channel.');
      }

      takes.unboundedUnshift(handler);
      return {immediate: false};
    }
  }
}

function takeAsync(channel, onComplete, onCaller) {
  if (typeof onCaller === 'undefined') onCaller = true;

  var result = take(channel, new FnHandler(onComplete));
  if (result.immediate) {
    if (onCaller) {
      onComplete(result.value);
    } else {
      setImmediate(function() { onComplete(result.value); });
    }
  }
}

function put(channel, value, handler) {
  if (channel.isClosed || !handler.isActive()) {
    return {immediate: true};
  }

  var buffer = channel.buffer;
  var takes = channel.takes;
  var puts = channel.puts;

  var taker = takes.pop();
  while (taker) {
    if (taker.isActive()) {
      var callback = taker.commit();
      handler.commit();
      setImmediate(function() { callback(value); });
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
    if (channel.dirtyPuts > MAX_DIRTY) {
      channel.dirtyPuts = 0;
      puts.cleanup(function(putter) {
        return putter.handler.isActive();
      });
    } else {
      channel.dirtyPuts++;
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
}

function noOp() {}

function putAsync(channel, value, onComplete, onCaller) {
  if (typeof onCaller === 'undefined') onCaller = true;
  if (!onComplete) onComplete = noOp;

  var result = put(channel, value, new FnHandler(onComplete));
  if (result.immediate) {
    if (onCaller) {
      onComplete();
    } else {
      setImmediate(onComplete);
    }
  }
}

function close(channel) {
  channel.isClosed = true;

  var takes = channel.takes;
  var taker = takes.pop();

  while (taker) {
    if (taker.isActive()) {
      var callback = taker.commit();
      setImmediate(function() { callback(null); });
      break;
    }

    taker = takes.pop();
  }
}

module.exports = {
  chan: chan,
  take: take,
  takeAsync: takeAsync,
  put: put,
  putAsync: putAsync,
  close: close,
  defaultBuffer: defaultBuffer,
  FnHandler: FnHandler
};
