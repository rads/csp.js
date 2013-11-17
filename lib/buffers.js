'use strict';

function ringBuffer(size) {
  return new RingBuffer(size);
}

function RingBuffer(size) {
  this._head = 0;
  this._tail = 0;
  this.length = 0;
  this._arr = new Array(size);
}

RingBuffer.prototype.pop = function() {
  if (this.length === 0) return null;

  var x = this._arr[this._tail];
  this._arr[this._tail] = null;
  this._tail = ((this._tail + 1) % this._arr.length);
  this.length--;

  return x;
};

RingBuffer.prototype.unshift = function(val) {
  this._arr[this._head] = val;
  this._head = ((this._head + 1) % this._arr.length);
  this.length++;
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
    arrayCopy(this._arr, this._tail, newArr, 0, this.length);
    this._tail = 0;
    this._head = this.length;
    this._arr = newArr;
  } else if (this._tail > this._head) {
    var len = (this._arr.length - this._tail);
    arrayCopy(this._arr, this._tail, newArr, 0, len);
    this._tail = 0;
    this._head = this.length;
    this._arr = newArr;
  } else if (this._tail === this._head) {
    this._tail = 0;
    this._head = 0;
    this._arr = newArr;
  }
};

RingBuffer.prototype.cleanup = function(keepFn) {
  for (var i = 0, j = this.length; i < j; i++) {
    var val = this.pop();
    if (keepFn(val)) this.unshift(val);
  }
};

function fixedBuffer(size) {
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
  return (this._buffer.length === this._size);
};

FixedBuffer.prototype.count = function() {
  return this._buffer.length;
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
  if (this._buffer.length === this._size) return;
  this._buffer.unshift(val);
};

DroppingBuffer.prototype.count = function() {
  return this._buffer.length;
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
  if (this._buffer.length === this._size) {
    this.remove();
  }
  this._buffer.unshift(val);
};

SlidingBuffer.prototype.count = function() {
  return this._buffer.length;
};

module.exports = {
  ringBuffer: ringBuffer,
  fixedBuffer: fixedBuffer,
  droppingBuffer: droppingBuffer,
  slidingBuffer: slidingBuffer
};
