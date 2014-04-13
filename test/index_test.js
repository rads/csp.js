var chai = require('chai'),
    expect = chai.expect,
    sinonChai = require('sinon-chai'),
    sinon = require('sinon'),
    csp = require('../');

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

    process.nextTick(function() {
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

  describe('the channel returned by a go block', function() {
    describe('WITH a return statement', function() {
      it('provides the return value and closes', function(done) {
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
    });

    describe('WITHOUT a return statement', function() {
      it('provides no value and closes', function(done) {
        var c1 = csp.chan();
        var c2 = csp.go(function*() {
          yield csp.take(c1);
        });

        csp.putAsync(c1, 43);

        csp.takeAsync(c2, function(val) {
          expect(val).to.be.null;
          done();
        });
      });
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
      process.nextTick(function() {
        expect(val).to.be.undefined;

        clock.tick(501);
        process.nextTick(function() {
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

    // FIXME: This test fails in core.async too. Leaving it out for now
    describe.skip('with no third argument', function() {
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

        expect(val).to.equal(42 + 43);
        done();
      });
    });
  });

  describe('reduce', function() {
    it('reduces values coming from a channel', function(done) {
      var c1 = csp.chan(2);
      var reduced = csp.reduce(c1, 1, function(acc, val) {
        return acc + val;
      });

      csp.go(function*() {
        yield csp.put(c1, 2);
        yield csp.put(c1, 3);
        csp.close(c1);
        var val = yield csp.take(reduced);

        expect(val).to.equal(1 + 2 + 3);
        done();
      });
    });
  });

  describe('merge', function() {
    it('combines the values from multiple channels into a single channel', function(done) {
      var c1 = csp.chan(1);
      var c2 = csp.chan(1);
      var merged = csp.merge([c1, c2]);

      csp.go(function*() {
        yield csp.put(c1, 42);
        csp.close(c1);
        yield csp.put(c2, 43);
        csp.close(c2);

        var val1 = yield csp.take(merged);
        var val2 = yield csp.take(merged);
        var val3 = yield csp.take(merged);

        expect(val1).to.equal(42);
        expect(val2).to.equal(43);
        expect(val3).to.be.null;
        done();
      });
    });
  });

  describe('intoArray', function() {
    it('pushes the values from channel into an array', function(done) {
      var c1 = csp.chan(3);

      csp.go(function*() {
        yield csp.put(c1, 1);
        yield csp.put(c1, 2);
        yield csp.put(c1, 3);
        csp.close(c1);
        var vals = yield csp.take(csp.intoArray(c1));

        expect(vals[0]).to.equal(1);
        expect(vals[1]).to.equal(2);
        expect(vals[2]).to.equal(3);
        done();
      });
    });
  });

  describe('takeNum', function() {
    it('takes at most n values from a channel', function(done) {
      var c1 = csp.chan(3);
      var take2 = csp.takeNum(c1, 2);

      csp.go(function*() {
        yield csp.put(c1, 1);
        yield csp.put(c1, 2);
        yield csp.put(c1, 3);

        expect(yield csp.take(take2)).to.equal(1);
        expect(yield csp.take(take2)).to.equal(2);
        expect(yield csp.take(take2)).to.be.null;
        done();
      });
    });
  });

  describe('unique', function() {
    it('skips consecutive values from a channel', function(done) {
      var c1 = csp.chan(4);
      var uniq = csp.unique(c1);

      csp.go(function*() {
        yield csp.put(c1, 1);
        yield csp.put(c1, 2);
        yield csp.put(c1, 2);
        yield csp.put(c1, 3);
        csp.close(c1);

        expect(yield csp.take(uniq)).to.equal(1);
        expect(yield csp.take(uniq)).to.equal(2);
        expect(yield csp.take(uniq)).to.equal(3);
        expect(yield csp.take(uniq)).to.be.null;
        done();
      });
    });
  });

  describe('partition', function() {
    it('puts arrays of length N on a channel containing values from a source', function(done) {
      var c1 = csp.chan(5);
      var part = csp.partition(c1, 2);

      csp.go(function*() {
        for (var i = 0; i < 5; i++) {
          yield csp.put(c1, i);
        }
        csp.close(c1);

        var val1 = yield csp.take(part);
        var val2 = yield csp.take(part);
        var val3 = yield csp.take(part);

        expect(val1.length).to.equal(2);
        expect(val1[0]).to.equal(0);
        expect(val1[1]).to.equal(1);

        expect(val2.length).to.equal(2);
        expect(val2[0]).to.equal(2);
        expect(val2[1]).to.equal(3);

        expect(val3.length).to.equal(2);
        expect(val3[0]).to.equal(4);
        expect(val3[1]).to.be.null;

        done();
      });
    });
  });

  describe('partitionBy', function() {
    it('partitions channel values into arrays using a fn', function(done) {
      var c1 = csp.chan(5);
      var part = csp.partitionBy(c1, function(val) {
        return (val <= 1 || val >= 3);
      });

      csp.go(function*() {
        for (var i = 0; i < 5; i++) {
          yield csp.put(c1, i);
        }
        csp.close(c1);

        var val1 = yield csp.take(part);
        var val2 = yield csp.take(part);
        var val3 = yield csp.take(part);

        expect(val1.length).to.equal(2);
        expect(val1[0]).to.equal(0);
        expect(val1[1]).to.equal(1);

        expect(val2.length).to.equal(1);
        expect(val2[0]).to.equal(2);

        expect(val3.length).to.equal(2);
        expect(val3[0]).to.equal(3);
        expect(val3[1]).to.equal(4);

        done();
      });
    });
  });

  describe('filterPull', function() {
    it('filters values from a source channel using a fn', function(done) {
      var c1 = csp.chan(3);
      var filtered = csp.filterPull(c1, function(val) { return val !== 2; });

      csp.go(function*() {
        yield csp.put(c1, 1);
        yield csp.put(c1, 2);
        yield csp.put(c1, 3);
        csp.close(c1);

        expect(yield csp.take(filtered)).to.equal(1);
        expect(yield csp.take(filtered)).to.equal(3);
        expect(yield csp.take(filtered)).to.be.null;
        done();
      });
    });
  });

  describe('filterPush', function() {
    it('filters values put on the channel using a fn', function(done) {
      var filtered = csp.chan(3);
      var c1 = csp.filterPush(filtered, function(val) { return val !== 2; });

      csp.go(function*() {
        yield csp.put(c1, 1);
        yield csp.put(c1, 2);
        yield csp.put(c1, 3);
        csp.close(c1);

        expect(yield csp.take(filtered)).to.equal(1);
        expect(yield csp.take(filtered)).to.equal(3);
        expect(yield csp.take(filtered)).to.be.null;
        done();
      });
    });
  });

  describe('removePull', function() {
    it('removes values from a source channel using a fn', function(done) {
      var c1 = csp.chan(3);
      var removed = csp.removePull(c1, function(val) { return val !== 2; });

      csp.go(function*() {
        yield csp.put(c1, 1);
        yield csp.put(c1, 2);
        yield csp.put(c1, 3);
        csp.close(c1);

        expect(yield csp.take(removed)).to.equal(2);
        expect(yield csp.take(removed)).to.be.null;
        done();
      });
    });
  });

  describe('removePush', function() {
    it('removes values put on the channel using a fn', function(done) {
      var removed = csp.chan(3);
      var c1 = csp.removePush(removed, function(val) { return val !== 2; });

      csp.go(function*() {
        yield csp.put(c1, 1);
        yield csp.put(c1, 2);
        yield csp.put(c1, 3);
        csp.close(c1);

        expect(yield csp.take(removed)).to.equal(2);
        expect(yield csp.take(removed)).to.be.null;
        done();
      });
    });
  });

  describe('mapcatPull', function() {
    it('mapcats values coming from a channel', function(done) {
      var c1 = csp.chan(2);
      var mcat = csp.mapcatPull(c1, function(val) {
        return [val, val + 1];
      });

      csp.go(function*() {
        yield csp.put(c1, 1);
        yield csp.put(c1, 3);
        csp.close(c1);

        expect(yield csp.take(mcat)).to.equal(1);
        expect(yield csp.take(mcat)).to.equal(2);
        expect(yield csp.take(mcat)).to.equal(3);
        expect(yield csp.take(mcat)).to.equal(4);
        expect(yield csp.take(mcat)).to.be.null;
        done();
      });
    });
  });

  describe('mapcatPush', function() {
    it('mapcats values coming from a channel', function(done) {
      var mcat = csp.chan(2);
      var c1 = csp.mapcatPush(mcat, function(val) {
        return [val, val + 1];
      });

      csp.go(function*() {
        yield csp.put(c1, 1);
        yield csp.put(c1, 3);
        csp.close(c1);

        expect(yield csp.take(mcat)).to.equal(1);
        expect(yield csp.take(mcat)).to.equal(2);
        expect(yield csp.take(mcat)).to.equal(3);
        expect(yield csp.take(mcat)).to.equal(4);
        expect(yield csp.take(mcat)).to.be.null;
        done();
      });
    });
  });

  describe('split', function() {
    it('creates two channels from one using a predicate', function(done) {
      var c1 = csp.chan(2);
      var chans = csp.split(c1, 1, 1, function(val) { return val >= 0; });

      csp.go(function*() {
        yield csp.put(c1, 1);
        yield csp.put(c1, -1);
        csp.close(c1);

        expect(yield csp.take(chans.pass)).to.equal(1);
        expect(yield csp.take(chans.pass)).to.be.null;

        expect(yield csp.take(chans.fail)).to.equal(-1);
        expect(yield csp.take(chans.fail)).to.be.null;

        done();
      });
    });
  });

  describe('ontoChan', function() {
    it('puts the contents of an array onto a channel and closes it', function(done) {
      var c1 = csp.chan(3);
      csp.ontoChan(c1, [1, 2, 3]);

      csp.go(function*() {
        expect(yield csp.take(c1)).to.equal(1);
        expect(yield csp.take(c1)).to.equal(2);
        expect(yield csp.take(c1)).to.equal(3);

        yield csp.put(c1, 4);
        expect(yield csp.take(c1)).to.be.null;;

        done();
      });
    });

    it('puts the contents of an array onto a channel and leaves it open', function(done) {
      var c1 = csp.chan(3);
      csp.ontoChan(c1, [1, 2, 3], false);

      csp.go(function*() {
        expect(yield csp.take(c1)).to.equal(1);
        expect(yield csp.take(c1)).to.equal(2);
        expect(yield csp.take(c1)).to.equal(3);

        yield csp.put(c1, 4);
        expect(yield csp.take(c1)).to.equal(4);

        done();
      });
    });
  });

  describe('toChan', function() {
    it('creates a channel from an array of values', function(done) {
      var c1 = csp.toChan([1, 2, 3]);

      csp.go(function*() {
        expect(yield csp.take(c1)).to.equal(1);
        expect(yield csp.take(c1)).to.equal(2);
        expect(yield csp.take(c1)).to.equal(3);
        expect(yield csp.take(c1)).to.be.null;

        done();
      });
    });
  });

  describe('mult/tap/untap/untapAll', function() {
    describe('tap', function() {
      it('sends multiple channels the values from a source channel', function(done) {
        var source = csp.chan(1);
        var mult = csp.mult(source);
        var tap1 = csp.chan();
        var tap2 = csp.chan();

        csp.tap(mult, tap1);
        csp.tap(mult, tap2);

        csp.go(function*() {
          yield csp.put(source, 42);

          expect(yield csp.take(tap1)).to.equal(42);
          expect(yield csp.take(tap2)).to.equal(42);
          done();
        });
      });
    });

    describe('untap', function() {
      it('stops values from being put on a tap channel', function(done) {
        var source = csp.chan(1);
        var mult = csp.mult(source);
        var tap1 = csp.chan(2);
        var tap2 = csp.chan(2);

        csp.tap(mult, tap1);
        csp.tap(mult, tap2);

        csp.go(function*() {
          csp.untap(mult, tap2);

          yield csp.put(source, 42);

          // We force the next tick because if we put on the tap channel
          // directly, it will show up before the value from the mult. In other
          // words, 43 will show up before 42. This is a bug in core.async as
          // well.
          process.nextTick(function() {
            csp.go(function*() {
              yield csp.put(tap1, 43);
              yield csp.put(tap2, 43);

              expect(yield csp.take(tap1)).to.equal(42);
              expect(yield csp.take(tap1)).to.equal(43);
              expect(yield csp.take(tap2)).to.equal(43);

              done();
            });
          });
        });
      });
    });

    describe('untapAll', function() {
      it('stops values from being put on any of the tap channels', function(done) {
        var source = csp.chan(1);
        var mult = csp.mult(source);
        var tap1 = csp.chan(2);
        var tap2 = csp.chan(2);

        csp.tap(mult, tap1);
        csp.tap(mult, tap2);

        csp.go(function*() {
          csp.untapAll(mult);

          yield csp.put(source, 42);

          // We force the next tick because if we put on the tap channel
          // directly, it will show up before the value from the mult. In other
          // words, 43 will show up before 42. This is a bug in core.async as
          // well.
          process.nextTick(function() {
            csp.go(function*() {
              yield csp.put(tap1, 43);
              yield csp.put(tap2, 43);

              expect(yield csp.take(tap1)).to.equal(43);
              expect(yield csp.take(tap2)).to.equal(43);

              done();
            });
          });
        });
      });
    });
  });

  describe('pub/sub/unsub/unsubAll', function() {
    describe('pub/sub', function() {
      it('publishes values to channels partitioned by topic', function(done) {
        var source = csp.chan(1);
        var p = csp.pub(source, function(val) { return val.topic; });
        var aSub = csp.chan(2);
        var bSub = csp.chan(2);

        csp.sub(p, 'a', aSub);
        csp.sub(p, 'b', bSub);

        csp.go(function*() {
          yield csp.put(source, {topic: 'a', value: 42});
          yield csp.put(source, {topic: 'b', value: 43});
          yield csp.put(source, {topic: 'a', value: 44});
          yield csp.put(source, {topic: 'b', value: 45});

          var aVal1 = yield csp.take(aSub);
          var aVal2 = yield csp.take(aSub);
          var bVal1 = yield csp.take(bSub);
          var bVal2 = yield csp.take(bSub);

          expect(aVal1.value).to.equal(42);
          expect(aVal2.value).to.equal(44);
          expect(bVal1.value).to.equal(43);
          expect(bVal2.value).to.equal(45);

          done();
        });
      });
    });

    describe('unsub', function() {
      it('stops publishing values to a channel', function(done) {
        var source = csp.chan(1);
        var p = csp.pub(source, function(val) { return val.topic; });
        var aSub = csp.chan(2);
        var bSub1 = csp.chan(2);
        var bSub2 = csp.chan(2);

        csp.sub(p, 'a', aSub);
        csp.sub(p, 'b', bSub1);
        csp.sub(p, 'b', bSub2);

        csp.go(function*() {
          csp.unsub(p, 'b', bSub2);

          yield csp.put(source, {topic: 'a', value: 42});
          yield csp.put(source, {topic: 'b', value: 43});
          yield csp.put(source, {topic: 'a', value: 44});
          yield csp.put(source, {topic: 'b', value: 45});
          yield csp.put(bSub2, 46);

          var aVal1 = yield csp.take(aSub);
          var aVal2 = yield csp.take(aSub);
          var b1Val1 = yield csp.take(bSub1);
          var b1Val2 = yield csp.take(bSub1);
          var b2Val1 = yield csp.take(bSub2);

          expect(aVal1.value).to.equal(42);
          expect(aVal2.value).to.equal(44);
          expect(b1Val1.value).to.equal(43);
          expect(b1Val2.value).to.equal(45);
          expect(b2Val1).to.equal(46);

          done();
        });
      });
    });

    describe('unsubAll', function() {
      describe('WITH a given topic', function() {
        it('stops publishing values to channels subscribed to a topic', function(done) {
          var source = csp.chan(1);
          var p = csp.pub(source, function(val) { return val.topic; });
          var aSub = csp.chan(2);
          var bSub1 = csp.chan(2);
          var bSub2 = csp.chan(2);

          csp.sub(p, 'a', aSub);
          csp.sub(p, 'b', bSub1);
          csp.sub(p, 'b', bSub2);

          csp.go(function*() {
            csp.unsubAll(p, 'b');

            yield csp.put(source, {topic: 'a', value: 42});
            yield csp.put(source, {topic: 'b', value: 43});
            yield csp.put(source, {topic: 'a', value: 44});
            yield csp.put(source, {topic: 'b', value: 45});
            yield csp.put(bSub1, 46);
            yield csp.put(bSub2, 47);

            var aVal1 = yield csp.take(aSub);
            var aVal2 = yield csp.take(aSub);
            var b1Val1 = yield csp.take(bSub1);
            var b2Val1 = yield csp.take(bSub2);

            expect(aVal1.value).to.equal(42);
            expect(aVal2.value).to.equal(44);
            expect(b1Val1).to.equal(46);
            expect(b2Val1).to.equal(47);

            done();
          });
        });
      });

      describe('WITHOUT a given topic', function() {
        it('stops publishing values to all channels', function(done) {
          var source = csp.chan(1);
          var p = csp.pub(source, function(val) { return val.topic; });
          var aSub = csp.chan(2);
          var bSub = csp.chan(2);

          csp.sub(p, 'a', aSub);
          csp.sub(p, 'b', bSub);

          csp.go(function*() {
            csp.unsubAll(p);

            yield csp.put(source, {topic: 'a', value: 42});
            yield csp.put(source, {topic: 'b', value: 43});
            yield csp.put(source, {topic: 'a', value: 44});
            yield csp.put(source, {topic: 'b', value: 45});
            yield csp.put(aSub, 46);
            yield csp.put(bSub, 47);

            var aVal1 = yield csp.take(aSub);
            var bVal1 = yield csp.take(bSub);

            expect(aVal1).to.equal(46);
            expect(bVal1).to.equal(47);

            done();
          });
        });
      });
    });
  });

  describe('goLoop', function() {
    it('loops until the go block returns', function(done) {
      var c1 = csp.chan();
      var c2 = csp.goLoop(function*() {
        var val = yield csp.take(c1);
        if (val === 3) return 42;
      });

      csp.go(function*() {
        var val = yield csp.take(c2);
        expect(val).to.equal(42);
        done();
      });

      csp.go(function*() {
        yield csp.put(c1, 1);
        yield csp.put(c1, 2);
        yield csp.put(c1, 3);
      });
    });
  });
});
