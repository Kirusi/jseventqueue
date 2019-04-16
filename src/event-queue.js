'use strict';

/**
 * A wrapper class. It is used to raise errors and signal interruptions to normal iteration flow.
 */
class Signal {
    /**
     * Constructor
     * @param {Error} err - an error to be trhown during iteration
     */
    constructor(err) {
        /** an error object to be held */
        this.err = err;
    }

    /**
     * Accessor to wrapped Error instance
     */
    get error() {
        return this.err;
    }
}

/**
 *  Class implements JS asyncIterator protocol to be used in `for-await-of loop`
 */
class Iterator {
    /**
     * Constructor
     * @param {EventQueue} queue
     */
    constructor(queue) {
        /** Reference to queue object */
        this.queue = queue;
    }

    /**
     * returns the result with two optional data members: `value` must be returned if there is more data expected.
     * `done` must be set to true when iteration is finished, in this case `value` is ignored
     */
    async next() {
        let data = await this.queue.receive();
        if (this.queue.isSignal(data)) {
            throw data.error;
        }
        let result = {
            value: data,
            done: (data === this.queue.end)
        };
        return result;
    }

    /**
     * Support for `for-await-of loop` using iterator object
     */
    [Symbol.asyncIterator]() {
        return this.queue[Symbol.asyncIterator]();
    }
}

/**
 * Event queue with support for `async-await` reading by a single consumer
 */
class EventQueue {

    /**
     * Default constructor
     */
    constructor() {
        /** @private array of messages */
        this.queue = [];
        /** @private flag whether the queue is closed */
        this.isDown = false;
        /** @private special object used to mark the last message */
        this.endMarker = {id: 'Queue is terminated'}; // special object
    }

    /**
     * Getter for the end marker. This object is sent when queue is shutdown
     */
    get end() {
        return this.endMarker;
    }

    /**
     * Async method that can be waited on to receive the next message.
     * At most one consumer at a time is expected to be waiting.
     * The method throws an exception after queue was shut down and all pendingmessages were delivered.
     */
    async receive() {
        if (this.queue.length > 0) {
            let val = this.queue.shift();
            return Promise.resolve(val);
        }
        if (this.resolver) {
            throw new Error('Another block of code is already waiting to receive data from this queue.');
        }
        if (this.isDown) {
            throw new Error('Can\'t read from queue. The queue was shutdown.');
        }
        return new Promise((resolver) => {
            /**
             * @private callback to use when the next value is received.
             */
            this.resolver = resolver;
        });
    }

    /**
     * Sends a message to a waiting consumer, or stores it in-memory to be delivered later.
     * Once the queue is shut down, no more messages are accepted for delivery.
     * Pending messages will be delivered to a consumer.
     * @param {*} val - value to be delivered
     */
    send(val) {
        if (!this.isDown) {
            if (this.resolver) {
                this.resolver(val);
                this.resolver = undefined;
            }
            else {
                this.queue.push(val);
            }
        }
        else {
            throw new Error('Can\'t send a message. The queue was shutdown.');
        }
    }

    /**
     * Closes queue from accepting more messages for delivery
     */
    shutdown() {
        this.send(this.endMarker);
        this.isDown = true;
    }

    /**
     * Send a message containing an Error object. Iterator will throw an exception when processing this object
     * @param {Error} err - an error to be thrown
     *
     * @example
     * // Reading from queue using `for await` loop:
     * let queue = new EventQueue();
     * setTimeout(() => {
     *     queue.send(0);
     *     queue.send(1);
     *     queue.send(2);
     *     queue.raiseSignal(new Error('Processing failed'));
     *     queue.send(3);
     *     queue.shutdown();
     * }, 15);
     * let results = [];
     * try {
     *     for await (let data of queue) {
     *         results.push(data);
     *     }
     * }
     * catch(err) {
     *     // err.message is 'Processing failed'
     * }
     * // results contain [0, 1, 2]
     * @example
     * // If for some reason one can't use `for await` loop then a similar loop can be implemented using `while`:
     * let queue = new EventQueue();
     * setTimeout(() => {
     *     queue.send(0);
     *     queue.send(1);
     *     queue.send(2);
     *     queue.raiseSignal(new Error('Processing failed'));
     *     queue.send(3);
     *     queue.shutdown();
     * }, 15);
     * let results = [];
     * let data;
     * // while loop checks whether queue was shutdown by comparing returned value
     * // to a special data member of the queue object. It also checks for signals and throws errors
     * try {
     *     while ((data = await queue.receive()) !== queue.end) {
     *         if (queue.isSignal(res)) {
     *             throw res.error;
     *         }
     *         results.push(data);
     *     }
     * }
     * finally {
     * }
     * // results contain [0, 1, 2, 3]
     */
    raiseSignal(err) {
        if (!(err instanceof Error)) {
            throw new Error('Signal can be raised only by using instances of an Error class');
        }
        this.send(new Signal(err));
    }

    /**
     * Checks whether an object was created by raiseSginal method.
     * @param {*} signal
     */
    isSignal(signal) {
        let result = (signal instanceof Signal);
        return result;
    }

    /**
     * Support for `for-await-of loop`
     */
    [Symbol.asyncIterator]() {
        return new Iterator(this);
    }
}

module.exports = EventQueue;
