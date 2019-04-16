# jseventqueue

A JavaScript (ES6) library for serializing event processing. It is intended to be used by multiple producers and a single consumer. Event processing is using ayns/await mechanism, which helps to process events one-at-a-time.

Reading from queue using `for await` loop:
```js
let queue = new EventQueue();
setTimeout(() => {
    queue.send(0);
    queue.send(1);
    queue.send(2);
    queue.send(3);
    queue.shutdown();
}, 15);
let results = [];
for await (let data of queue) {
    results.push(data);
}
// results contain [0, 1, 2, 3]
```
If for some reason one can't use `for await` loop then a similar loop can be implemented using `while`:
```js
let queue = new EventQueue();
setTimeout(() => {
    queue.send(0);
    queue.send(1);
    queue.send(2);
    queue.send(3);
    queue.shutdown();
}, 15);
let results = [];
let data;
// while loop checks whether queue was shutdown by comparing returned value
// to a special data member of the queue object
while ((data = await queue.receive()) !== queue.end) {
    results.push(data);
}
// results contain [0, 1, 2, 3]
```

Ad-hoc reading and writing to the queue:
```js
let queue = new EventQueue();
setTimeout(() => {
    queue.send('message 1');
    queue.send('message 2');
}, 15);
// receive will wait until a message is received
let msg1 = await queue.receive();
let msg2 = await queue.receive();
```

## Installation

Using npm:
```shell
$ npm i --save jseventqueue
```
