'use strict';

const EventQueue = require('../src/event-queue');
const should = require('should');

async function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

describe('EventQueue Tests', () => {

    it('send', (done) => {
        let queue = new EventQueue();
        queue.send(5);

        should.deepEqual([5], queue.queue);
        should.strictEqual(undefined, queue.resolver);
        done();
    });

    it('send/receive; 2 messages', async() => {
        let queue = new EventQueue();
        queue.send(5);
        queue.send('abc');

        let res1 = await queue.receive();
        let res2 = await queue.receive();
        should.strictEqual(5, res1);
        should.strictEqual('abc', res2);
    });

    it('receive/send; 2 messages', async() => {
        let queue = new EventQueue();
        setTimeout(() => {
            queue.send(5);
            queue.send('abc');
        }, 15);
        let res1 = await queue.receive();
        let res2 = await queue.receive();
        should.strictEqual(5, res1);
        should.strictEqual('abc', res2);
    });

    it('receive/send; 2 + 3 messages', async() => {
        let queue = new EventQueue();
        setTimeout(() => {
            queue.send(0);
            queue.send('abc');
        }, 15);
        let res1 = await queue.receive();
        queue.send({ a: 2 });
        let res2 = await queue.receive();
        queue.send(false);
        queue.send(true);
        let res3 = await queue.receive();
        let res4 = await queue.receive();
        let res5 = await queue.receive();
        should.strictEqual(0, res1);
        should.strictEqual('abc', res2);
        should.deepEqual({ a: 2 }, res3);
        should.strictEqual(false, res4);
        should.strictEqual(true, res5);
    });

    it('receive/send; two concurrent calls to receive method', async() => {
        let queue = new EventQueue();
        let res1;
        let err1;
        let res2;
        let err2;
        setTimeout(async() => {
            try {
                res1 = await queue.receive();
            }
            catch (err) {
                err1 = err.message;
            }
        }, 0);

        setTimeout(async() => {
            try {
                res2 = await queue.receive();
                should.fail('Undetected failure');
            }
            catch (err) {
                err2 = err.message;
            }
        }, 5);
        setTimeout(() => {
            queue.send('abc');
        }, 10);

        await delay(15);
        should.strictEqual('abc', res1);
        should.strictEqual(undefined, err1);
        should.strictEqual(undefined, res2);
        err2.should.containEql('is already waiting');
    });

    it('raiseSignal; using an error', async() => {
        let queue = new EventQueue();
        queue.raiseSignal(new Error('An error was triggered'));
        let res = await queue.receive();
        should.strictEqual(true, queue.isSignal(res));
        should.deepEqual(new Error('An error was triggered'), res.error);
    });

    it('raiseSignal; using a non-error', async() => {
        let queue = new EventQueue();
        try {
            queue.raiseSignal({txt: 'Error'});
            should.fail('Undetected error');
        }
        catch (err) {
            let msg = err.message;
            msg.should.containEql('Signal can be raised only by using instances of an Error class');
        }
    });

    it('receive/send; using a while loop', async() => {
        let queue = new EventQueue();
        setTimeout(() => {
            queue.send(0);
            queue.send(1);
            queue.send(2);
            queue.send(3);
            queue.shutdown();
        }, 15);
        let actual = [];
        let res;
        while ((res = await queue.receive()) !== queue.end) {
            actual.push(res);
        }
        let expected = [0, 1, 2, 3];
        should.deepEqual(expected, actual);
    });

    it('receive/send; using "for await" loop', async() => {
        let queue = new EventQueue();
        setTimeout(() => {
            queue.send(0);
            queue.send(1);
            queue.send(2);
            queue.send(3);
            queue.shutdown();
        }, 15);
        let actual = [];
        for await (let res of queue) {
            actual.push(res);
        }
        let expected = [0, 1, 2, 3];
        should.deepEqual(expected, actual);
    });

    it('receive/send; using "for await" loop on the iterator', async() => {
        let queue = new EventQueue();
        setTimeout(() => {
            queue.send(0);
            queue.send(1);
            queue.send(2);
            queue.send(3);
            queue.shutdown();
        }, 15);
        let actual = [];
        // One could simply iterate over a queue, but the spec allows this
        let iter = queue[Symbol.asyncIterator]();
        for await (let res of iter) {
            actual.push(res);
        }
        let expected = [0, 1, 2, 3];
        should.deepEqual(expected, actual);
    });

    it('send after shutdown', async() => {
        let queue = new EventQueue();
        queue.send(0);
        queue.send(1);
        queue.shutdown();
        let msg;
        try {
            queue.send(2);
            should.fail('Undetected failure');
        }
        catch (err) {
            msg = err.message;
        }
        msg.should.containEql('The queue was shutdown');
    });

    it('receive after shutdown', async() => {
        let queue = new EventQueue();
        queue.send(0);
        queue.send(1);
        queue.shutdown();
        let res1 = await queue.receive();
        let res2 = await queue.receive();
        let res3 = await queue.receive();
        should.strictEqual(0, res1);
        should.strictEqual(1, res2);
        should.strictEqual(queue.end, res3);
        let msg;
        try {
            let res4 = await queue.receive();
            should.fail('Undetected failure');
        }
        catch (err) {
            msg = err.message;
        }
        msg.should.containEql('The queue was shutdown');
    });

    it('receive/send; using "for await" loop; with signal', async() => {
        let queue = new EventQueue();
        setTimeout(async() => {
            queue.send(0);
            queue.send(1);
            await delay(5);
            queue.raiseSignal(new Error('An error was triggered'));
            queue.send(2);
            queue.shutdown();
        }, 15);
        let actual = [];
        try {
            for await (let res of queue) {
                actual.push(res);
            }
            should.fail('Undetected error');
        }
        catch (err) {
            let msg = err.message;
            msg.should.containEql('was triggered');
        }
        let expected = [0, 1];
        should.deepEqual(expected, actual);
    });

    it('receive/send; using a while loop; with signal', async() => {
        let queue = new EventQueue();
        setTimeout(() => {
            queue.send(0);
            queue.send(1);
            queue.raiseSignal(new Error('An error was triggered'));
            queue.send(2);
            queue.shutdown();
        }, 15);
        let actual = [];
        let res;
        try {
            while ((res = await queue.receive()) !== queue.end) {
                if (queue.isSignal(res)) {
                    throw res.error;
                }
                actual.push(res);
            }
            should.fail('Undetected error');
        }
        catch (err) {
            let msg = err.message;
            msg.should.containEql('was triggered');
        }
        let expected = [0, 1];
        should.deepEqual(expected, actual);
    });
});

