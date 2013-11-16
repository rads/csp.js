require('setimmediate');

function fixedBuffer(size) {
  return {
    contents: [],
    size: size
  };
}

function chan(bufferOrN) {
  var buffer;
  if (bufferOrN) {
    buffer = fixedBuffer(bufferOrN);
  } else {
    buffer = null;
  }

  return {
    buffer: buffer,
    puts: [],
    takes: []
  };
}

function channelTakeSync(channel) {
  var buffer = channel.buffer;
  var puts = channel.puts;

  if (buffer && buffer.contents.length) {
    return buffer.contents.pop();
  } else {
    if (puts.length) {
      var put = puts.pop();
      put.onComplete();
      return put.value;
    } else {
      return null;
    }
  }
}

function channelTakeAsync(channel, onComplete) {
  var buffer = channel.buffer;
  var takes = channel.takes;
  var puts = channel.puts;

  if (buffer && buffer.contents.length) {
    setImmediate(function() {
      onComplete(buffer.contents.pop());
    });
  } else {
    if (puts.length) {
      setImmediate(function() {
        var put = puts.pop();
        put.onComplete();
        onComplete(put.value);
      });
    } else {
      takes.unshift({onComplete: onComplete});
    }
  }
}

function channelPutSync(channel, value) {
  var buffer = channel.buffer;
  var takes = channel.takes;

  if (takes.length) {
    var take = takes.pop();
    take.onComplete(value);
    return true;
  } else {
    if (buffer && (buffer.contents.length < buffer.size)) {
      buffer.contents.unshift(value);
      return true;
    } else {
      return null;
    }
  }
}

function channelPutAsync(channel, value, onComplete) {
  var buffer = channel.buffer;
  var takes = channel.takes;
  var puts = channel.puts;

  if (takes.length) {
    setImmediate(function() {
      var take = takes.pop();
      take.onComplete(value);
      onComplete();
    });
  } else {
    if (buffer && (buffer.contents.length < buffer.size)) {
      setImmediate(function() {
        buffer.contents.unshift(value);
        onComplete();
      });
    } else {
      puts.unshift({
        onComplete: onComplete,
        value: value
      });
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
        currentStep = machine.next(result.value);
    }
  }
}

var operations = {
  take: function(machine, instruction) {
    var channel = instruction.channel;
    var taken = channelTakeSync(channel);

    if (taken) {
      return {state: 'continue', value: taken};
    } else {
      channelTakeAsync(channel, function(val) {
        runMachine(machine, machine.next(val));
      });
      return {state: 'park', value: null};
    }
  },

  put: function(machine, instruction) {
    var channel = instruction.channel;
    var value = instruction.value;

    if (channelPutSync(channel, value)) {
      return {state: 'continue', value: null};
    } else {
      channelPutAsync(channel, value, function() {
        runMachine(machine, machine.next());
      });
      return {state: 'park', value: null};
    }
  },

  alts: function(machine, instruction) {
    var channels = instruction.channels;
    var len = channels.length;
    var shuffle = module.exports._shuffle;
    var order = (instruction.priority ? range(len) : shuffle(range(len)));
    var taken;

    for (var i = 0; i < len; i++) {
      if (taken) break;

      var channel = channels[order[i]];
      var val = channelTakeSync(channel);

      if (val) {
        taken = {
          chan: channel,
          value: val
        };
        break;
      } else {
        channelTakeAsync(channel, function(val) {
          if (taken) return;
          taken = {
            chan: channel,
            value: val
          };
          runMachine(machine, machine.next(taken));
        });
      }
    }

    if (taken) {
      return {state: 'continue', value: taken};
    } else {
      return {state: 'park', value: null};
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
  return {
    op: 'put',
    channel: channel,
    value: value
  };
}

function alts(channels, options) {
  if (!options) options = {};

  return {
    op: 'alts',
    channels: channels,
    priority: options.priority
  };
}

function timeout(duration) {
  var c = chan(1);

  setTimeout(function() {
    go(function*() {
      while (true) {
        yield put(c, null);
      }
    });
  }, duration);

  return c;
}

module.exports = {
  chan: chan,
  putAsync: channelPutAsync,
  takeAsync: channelTakeAsync,
  go: go,
  put: put,
  take: take,
  alts: alts,
  timeout: timeout,
  _shuffle: shuffle
};
