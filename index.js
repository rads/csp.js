require('setimmediate');

function buffer(size) {
  return new FixedBuffer(size);
}

function FixedBuffer(size) {
  this._size = size;
  this._buffer = new RingBuffer(size);
}

FixedBuffer.prototype.add = function(val) {
  if (this.isFull()) throw new Error("Can't add to a full buffer");
  this._buffer.unshift(val);
};

FixedBuffer.prototype.remove = function() {
  return this._buffer.pop();
};

FixedBuffer.prototype.isFull = function() {
  return (this._buffer._length === this._size);
};

FixedBuffer.prototype.count = function() {
  return this._buffer._length;
};

function arrayCopy(src, srcStart, dest, destStart, len) {
  for (var i = 0; i < len; i++) {
    dest[destStart + i] = src[srcStart + i];
  }
}

function droppingBuffer(size) {
  return new DroppingBuffer(size);
}

function DroppingBuffer(size) {
  this._size = size;
  this._buffer = new RingBuffer(size);
}

DroppingBuffer.prototype.isFull = function() {
  return false;
};

DroppingBuffer.prototype.remove = function() {
  return this._buffer.pop();
};

DroppingBuffer.prototype.add = function(val) {
  if (this._buffer._length === this._size) return;
  this._buffer.unshift(val);
};

DroppingBuffer.prototype.count = function() {
  return this._buffer._length;
};

function slidingBuffer(size) {
  return new SlidingBuffer(size);
}

function SlidingBuffer(size) {
  this._size = size;
  this._buffer = new RingBuffer(size);
}

SlidingBuffer.prototype.isFull = function() {
  return false;
};

SlidingBuffer.prototype.remove = function() {
  return this._buffer.pop();
};

SlidingBuffer.prototype.add = function(val) {
  if (this._buffer._length === this._size) {
    this.remove();
  }
  this._buffer.unshift(val);
};

SlidingBuffer.prototype.count = function() {
  return this._buffer._length;
};

function RingBuffer(size) {
  this._head = 0;
  this._tail = 0;
  this._length = 0;
  this._arr = new Array(size);
}

RingBuffer.prototype.pop = function() {
  if (this._length === 0) return null;

  var x = this._arr[this._tail];
  this._arr[this._tail] = null;
  this._tail = ((this._tail + 1) % this._arr.length);
  this._length--;

  return x;
};

RingBuffer.prototype.unshift = function(val) {
  this._arr[this._head] = val;
  this._head = ((this._head + 1) % this._arr.length);
  this._length++;
};

RingBuffer.prototype.unboundedUnshift = function(val) {
  if ((this.length+1) === this._arr.length) {
    this.resize();
  }
  this.unshift(val);
};

// Doubles the size of the buffer while retaining all the existing values
RingBuffer.prototype.resize = function() {
  var newArr = new Array(this._arr.length * 2);

  if (this._tail < this._head) {
    arrayCopy(this._arr, this._tail, newArr, 0, this._length);
    this._tail = 0;
    this._head = this._length;
    this._arr = newArr;
  } else if (this._tail > this._head) {
    var len = (this._arr.length - this._tail);
    arrayCopy(this._arr, this._tail, newArr, 0, len);
    this._tail = 0;
    this._head = this._length;
    this._arr = newArr;
  } else if (this._tail === this._head) {
    this._tail = 0;
    this._head = 0;
    this._arr = newArr;
  }
};

RingBuffer.prototype.cleanup = function(keepFn) {
  for (var i = 0, j = this._length; i < j; i++) {
    var val = this.pop();
    if (keepFn(val)) this.unshift(val);
  }
};

function chan(bufferOrN) {
  var buffer;
  if (!bufferOrN) {
    buffer = null;
  } else if (typeof bufferOrN === 'number') {
    buffer = new FixedBuffer(bufferOrN);
  } else {
    buffer = bufferOrN;
  }

  return {
    buffer: buffer,
    puts: [],
    takes: [],
    isClosed: false
  };
}

function AltFlag() {
  this._isActive = true;
}

AltFlag.prototype.commit = function() {
  this._isActive = false;
  return true;
}

AltFlag.prototype.isActive = function() {
  return this._isActive;
}

function AltHandler(flag, callback) {
  this._flag = flag;
  this._callback = callback;
}

AltHandler.prototype.isActive = function() {
  return this._flag.isActive();
};

AltHandler.prototype.commit = function() {
  this._flag.commit();
  return this._callback;
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

function channelTake(channel, handler) {
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
      takes.unshift(handler);
      return {immediate: false};
    }
  }
}

function takeAsync(channel, onComplete, onCaller) {
  if (typeof onCaller === 'undefined') onCaller = true;

  var result = channelTake(channel, new FnHandler(onComplete));
  if (result.immediate) {
    if (onCaller) {
      onComplete(result.value);
    } else {
      setImmediate(function() { onComplete(result.value); });
    }
  }
}

function channelPut(channel, value, handler) {
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
    puts.unshift({
      handler: handler,
      value: value
    });
    return {immediate: false};
  }
}

function putAsync(channel, value, onComplete, onCaller) {
  if (typeof onCaller === 'undefined') onCaller = true;

  var result = channelPut(channel, value, new FnHandler(onComplete));
  if (result.immediate) {
    if (onCaller) {
      onComplete();
    } else {
      setImmediate(onComplete);
    }
  }
}

function go(block) {
  var machine = block();
  runMachine(machine, machine.next());
}

function runMachine(machine, startStep) {
  var currentStep = startStep;

  while (!currentStep.done) {
    var instruction = currentStep.value;
    var result = operations[instruction.op](machine, instruction);

    switch(result.state) {
      case 'park':
        return;

      case 'continue':
        if (typeof result.value === 'undefined') {
          currentStep = machine.next();
        } else {
          currentStep = machine.next(result.value);
        }
    }
  }
}

var operations = {
  take: function(machine, instruction) {
    var channel = instruction.channel;
    var handler = new FnHandler(function(val) {
      runMachine(machine, machine.next(val));
    });
    var result = channelTake(channel, handler);

    if (result.immediate) {
      return {state: 'continue', value: result.value};
    } else {
      return {state: 'park'};
    }
  },

  put: function(machine, instruction) {
    var channel = instruction.channel;
    var value = instruction.value;
    var handler = new FnHandler(function() {
      runMachine(machine, machine.next());
    });
    var result = channelPut(channel, value, handler);

    if (result.immediate) {
      return {state: 'continue'};
    } else {
      return {state: 'park'};
    }
  },

  alts: function(machine, instruction) {
    var channels = instruction.channels;
    var len = channels.length;
    var shuffle = module.exports._shuffle;
    var order = (instruction.priority ? range(len) : shuffle(range(len)));
    var flag = new AltFlag;

    for (var i = 0; i < len; i++) {
      var channel = channels[order[i]];

      if (Array.isArray(channel)) {
        var putChan = channel[0];
        var putValue = channel[1];
        var handler = new AltHandler(flag, function() {
          var put = {chan: putChan, value: null};
          runMachine(machine, machine.next(put));
        });
        var result = channelPut(putChan, putValue, handler);

        if (result.immediate) {
          var put = {chan: putChan, value: null};
          return {state: 'continue', value: put};
        }
      } else {
        var handler = new AltHandler(flag, function(val) {
          var taken = {chan: channel, value: val};
          runMachine(machine, machine.next(taken));
        });
        var result = channelTake(channel, handler);

        if (result.immediate) {
          var taken = {chan: channel, value: result.value};
          return {state: 'continue', value: taken};
        }
      }
    }

    var hasDefault = (typeof instruction.default !== 'undefined');
    if (hasDefault && flag.isActive() && flag.commit()) {
      var value = {chan: 'default', value: instruction.default};
      return {state: 'continue', value: value};
    } else {
      return {state: 'park'};
    }
  }
};

function range(size) {
  var ints = [];

  for (var i = 0; i < size; i++) {
    ints[i] = i;
  }

  return ints;
}

function shuffle(array) {
  var counter = array.length;
  var temp;
  var index;

  while (counter--) {
    index = (Math.random() * counter) | 0;

    temp = array[counter];
    array[counter] = array[index];
    array[index] = temp;
  }

  return array;
}

function take(channel) {
  return {
    op: 'take',
    channel: channel
  };
}

function put(channel, value) {
  if (typeof value === 'undefined') {
    throw new Error("Value was not provided to put on channel");
  }

  if (value === null) {
    throw new Error("Can't put null on a channel");
  }

  return {
    op: 'put',
    channel: channel,
    value: value
  };
}

function alts(channels, options) {
  if (!options) options = {};

  var instruction = {
    op: 'alts',
    channels: channels,
    priority: options.priority
  };

  if (typeof options.default !== 'undefined') {
    instruction.default = options.default;
  }

  return instruction;
}

function timeout(duration) {
  var c = chan();
  setTimeout(function() { close(c); }, duration);
  return c;
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
  buffer: buffer,
  slidingBuffer: slidingBuffer,
  droppingBuffer: droppingBuffer,
  putAsync: putAsync,
  takeAsync: takeAsync,
  go: go,
  put: put,
  take: take,
  alts: alts,
  timeout: timeout,
  close: close,
  _shuffle: shuffle
};
