var m = Buffer.from('hello');
console.log('old length %d', m.length);
var p = JSON.stringify(m);
var q = JSON.parse(p);
console.log(p);
console.log('stringify length %d', Buffer.from(p).length);
console.log(q);
var buf = Buffer.from(q.data);
console.log(buf.toString())