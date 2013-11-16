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
      takes.unshift(onComplete);
    }
  }
}

function channelPutSync(channel, value) {
  var buffer = channel.buffer;
  var takes = channel.takes;

  if (buffer && (buffer.contents.length < buffer.size)) {
    buffer.contents.unshift(value);
    return true;
  } else {
    if (takes.length) {
      var take = takes.pop();
      take.onComplete(value);
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

  if (buffer && (buffer.contents.length < buffer.size)) {
    setImmediate(function() {
      buffer.contents.unshift(value);
      onComplete();
    });
  } else {
    if (puts.length) {
      setImmediate(function() {
        var take = takes.pop();
        take.onComplete(value);
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
    var result = processInstruction(machine, instruction);

    switch(result.state) {
      case 'park':
        return;

      case 'continue':
        currentStep = machine.next(result.value);
    }
  }
}

function processInstruction(machine, instruction) {
  var op = instruction.op;
  var channel = instruction.channel;
  var value = instruction.value;

  switch(op) {
    case 'take':
      var taken = channelTakeSync(channel);
      if (taken) {
        return {state: 'continue', value: taken};
      } else {
        channelTakeAsync(channel, function(val) {
          runMachine(machine, machine.next(val));
        });
        return {state: 'park', value: null};
      }

    case 'put':
      if (channelPutSync(channel, value)) {
        return {state: 'continue', value: null};
      } else {
        channelPutAsync(channel, value, function() {
          runMachine(machine, machine.next());
        });
        return {state: 'park', value: null};
      }
  }
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

module.exports = {
  chan: chan,
  putAsync: channelPutAsync,
  takeAsync: channelTakeAsync,
  go: go,
  put: put,
  take: take
};
