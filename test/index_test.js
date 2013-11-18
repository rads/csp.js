var chai = require('chai'),
    expect = chai.expect,
    sinonChai = require('sinon-chai'),
    sinon = require('sinon'),
    csp = require('../');

require('setimmediate');
chai.use(sinonChai);

describe('csp', function() {
  it('puts and takes on a channel asynchronously', function(done) {
    var putCallback = sinon.spy();
    var takeCallback = sinon.spy();

    var c = csp.chan();
    csp.putAsync(c, 42, putCallback);
    csp.takeAsync(c, takeCallback, false);

    expect(putCallback).to.not.have.been.called;
    expect(takeCallback).to.not.have.been.called;

    setImmediate(function() {
      expect(putCallback).to.have.been.calledOnce;
      expect(putCallback).to.have.been.calledWithExactly();

      expect(takeCallback).to.have.been.calledOnce;
      expect(takeCallback).to.have.been.calledWithExactly(42);

      done();
    });
  });

  it('puts and takes on a rendezvous channel', function(done) {
    var c = csp.chan();

    csp.go(function*() {
      yield csp.put(c, 42);
    });

    csp.go(function*() {
      var val = yield csp.take(c);
      expect(val).to.equal(42);
      done();
    });
  });

  it('puts and takes on a channel with a fixed buffer of size 1', function(done) {
    var c = csp.chan(1);

    csp.go(function*() {
      yield csp.put(c, 42);
      var val = yield csp.take(c);
      expect(val).to.equal(42);
      done();
    });
  });

  it('puts and takes on a channel with a fixed buffer of size 3', function(done) {
    var c = csp.chan(3);

    csp.go(function*() {
      yield csp.put(c, 42);
      yield csp.put(c, 43);
      yield csp.put(c, 44);

      var val1 = yield csp.take(c);
      var val2 = yield csp.take(c);
      var val3 = yield csp.take(c);

      expect(val1).to.equal(42);
      expect(val2).to.equal(43);
      expect(val3).to.equal(44);

      done();
    });
  });

  it('go blocks return a channel', function(done) {
    var c1 = csp.chan();
    var c2 = csp.go(function*() {
      yield csp.take(c1);
      return 42;
    });

    csp.putAsync(c1, 43);

    csp.takeAsync(c2, function(val) {
      expect(val).to.equal(42);
      done();
    });
  });

  describe('with a closed channel', function() {
    it('takes return null', function(done) {
      var c = csp.chan(1);
      csp.close(c);

      csp.go(function*() {
        yield csp.put(c, 42);
        var val = yield csp.take(c);

        expect(val).to.be.null;
        done();
      });
    });

    it('puts are no-op', function(done) {
      var c = csp.chan(2);

      csp.go(function*() {
        yield csp.put(c, 42);
        csp.close(c);
        yield csp.put(c, 43);

        var val1 = yield csp.take(c);
        var val2 = yield csp.take(c);

        expect(val1).to.equal(42);
        expect(val2).to.be.null;
        done();
      });
    });
  });

  describe('sliding buffer', function() {
    it('drops old values when the buffer is full', function(done) {
      var c = csp.chan(csp.slidingBuffer(1));

      csp.go(function*() {
        yield csp.put(c, 42);
        yield csp.put(c, 43);
        var val = yield csp.take(c);

        expect(val).to.equal(43);
        done();
      });
    });
  });

  describe('dropping buffer', function() {
    it('drops new values when the buffer is full', function(done) {
      var c = csp.chan(csp.droppingBuffer(1));

      csp.go(function*() {
        yield csp.put(c, 42);
        yield csp.put(c, 43);
        var val = yield csp.take(c);

        expect(val).to.equal(42);
        done();
      });
    });
  });

  describe('alts', function() {
    describe('with default value', function() {
      it('returns the default when there are no immediate values', function(done) {
        var c1 = csp.chan();
        var c2 = csp.chan();
        var c3 = csp.chan();

        csp.go(function*() {
          var result = yield csp.alts([c1, c2, c3], {default: 42});
          expect(result.value).to.equal(42);
          expect(result.chan).to.equal('default');
          done();
        });
      });
    });

    describe('with priority', function() {
      it('returns the first value that can be taken', function(done) {
        var c1 = csp.chan(1);
        var c2 = csp.chan(1);
        var c3 = csp.chan(1);

        csp.go(function*() {
          yield csp.put(c1, 42);
          yield csp.put(c2, 43);

          csp.go(function*() {
            var result = yield csp.alts([c1, c2, c3], {priority: true});
            expect(result.value).to.equal(42);
            expect(result.chan).to.equal(c1);
            done();
          });
        });
      });
    });

    describe('with random order', function() {
      var oldShuffle;

      beforeEach(function() {
        oldShuffle = csp._stubShuffle(function() {
          return [1, 0, 2];
        });
      });

      afterEach(function() {
        csp._stubShuffle(oldShuffle);
      });

      it('returns the first value that can be taken', function(done) {
        var c1 = csp.chan(1);
        var c2 = csp.chan(1);
        var c3 = csp.chan(1);

        csp.go(function*() {
          yield csp.put(c1, 42);
          yield csp.put(c2, 43);

          csp.go(function*() {
            var result = yield csp.alts([c1, c2, c3]);
            expect(result.value).to.equal(43);
            expect(result.chan).to.equal(c2);
            done();
          });
        });
      });
    });

    describe('with put operations', function(done) {
      it('puts a value on the first open channel', function() {
        var c1 = csp.chan();
        var c2 = csp.chan();
        var c3 = csp.chan();

        csp.go(function*() {
          var result = yield csp.alts([[c1, 42], [c2, 43], c3]);
          var val = yield csp.take(c2);

          expect(result.value).to.be.null;
          expect(result.chan).to.equal(c2);
          expect(val).to.equal(42);
        });
      });
    });
  });

  describe('timeout', function() {
    var clock;

    beforeEach(function() {
      clock = sinon.useFakeTimers();
    });

    afterEach(function() {
      clock.restore();
    });

    it('closes the channel after the given duration', function(done) {
      var c = csp.timeout(500);
      var val;

      csp.go(function*() {
        val = yield csp.take(c);
      });

      clock.tick(499);
      setImmediate(function() {
        expect(val).to.be.undefined;

        clock.tick(501);
        setImmediate(function() {
          expect(val).to.be.null;
          done();
        });
      });
    });
  });

  describe('pipe', function() {
    it('transfers values from one channel to another', function(done) {
      var c1 = csp.chan();
      var c2 = csp.chan();
      csp.pipe(c1, c2);

      csp.go(function*() {
        yield csp.put(c1, 42);
        var val = yield csp.take(c2);

        expect(val).to.equal(42);
        done();
      });
    });

    describe('with no third argument', function() {
      it('closes the destination channel when the source closes', function(done) {
        var c1 = csp.chan(1);
        var c2 = csp.chan(1);
        csp.pipe(c1, c2);
        csp.close(c1);

        csp.go(function*() {
          yield csp.put(c2, 42);
          var val = yield csp.take(c2);

          expect(val).to.be.null;
          done();
        });
      });
    });

    describe('with third argument set to false', function() {
      it('DOES NOT close the destination channel when the source closes', function(done) {
        var c1 = csp.chan(1);
        var c2 = csp.chan(1);
        csp.pipe(c1, c2, false);
        csp.close(c1);

        csp.go(function*() {
          yield csp.put(c2, 42);
          var val = yield csp.take(c2);

          expect(val).to.equal(42);
          done();
        });
      });
    });
  });

  describe('mapPull', function() {
    it('applies a fn to values from a source channel', function(done) {
      var c1 = csp.chan(1);
      var mapped = csp.mapPull(c1, function(x) { return x + 1; });

      csp.go(function*() {
        yield csp.put(c1, 42);
        var val = yield csp.take(mapped);

        expect(val).to.equal(43);
        done();
      });
    });
  });

  describe('mapPush', function() {
    it('applies a fn to values put on the target channel', function(done) {
      var mapped = csp.chan(1);
      var c1 = csp.mapPush(mapped, function(x) { return x + 1; });

      csp.go(function*() {
        yield csp.put(c1, 42);
        var val = yield csp.take(mapped);

        expect(val).to.equal(43);
        done();
      });
    });
  });

  describe('map', function() {
    it('applies a fn to values from multiple channels', function(done) {
      var c1 = csp.chan(1);
      var c2 = csp.chan(1);
      var mapped = csp.map([c1, c2], function(v1, v2) { return v1 + v2; });

      csp.go(function*() {
        yield csp.put(c1, 42);
        yield csp.put(c2, 43);
        var val = yield csp.take(mapped);

        expect(val).to.equal(85);
        done();
      });
    });
  });
});
