// Plain HTTP/1.1 requests to the live server keep their connection for the next one;
// "Connection: close" and HTTP/1.0 still close after the answer.
import net from 'node:net';
const port = Number(process.env.ONE_TEST_PORT);
let failures = 0;
const ok = (cond, name) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) failures++; };

// Sends requests one after another on one socket; resolves with each answer's head and whether the socket closed.
function exchange(requests) {
  return new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1');
    const answers = [];
    let buffer = Buffer.alloc(0), next = 0, closed = false;
    const sendNext = () => { if (next < requests.length) socket.write(requests[next++]); };
    socket.on('connect', sendNext);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = buffer.subarray(0, end).toString();
        const length = Number((/content-length:\s*(\d+)/i.exec(head) || [0, 0])[1]);
        if (buffer.length < end + 4 + length) return;
        answers.push(head);
        buffer = buffer.subarray(end + 4 + length);
        if (answers.length < requests.length) sendNext();
      }
    });
    socket.on('close', () => { closed = true; resolve({answers, closed}); });
    setTimeout(() => { socket.destroy(); resolve({answers, closed}); }, 3000);
  });
}

const get = (path, extra = '') => `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\n${extra}\r\n`;
const kept = await exchange([get('/one/host.js'), get('/one/host.js')]);
ok(kept.answers.length === 2, 'two requests answered on one connection');
ok(kept.answers.every(h => /^HTTP\/1\.1 200/.test(h)), 'both answers are 200');
ok(kept.answers.every(h => /connection: keep-alive/i.test(h)), 'each answer says keep-alive');
ok(!kept.closed, 'the connection stayed open after the answers');

const close = await exchange([get('/one/host.js', 'Connection: close\r\n')]);
ok(close.answers.length === 1 && /connection: close/i.test(close.answers[0]), '"Connection: close" is answered with close');
ok(close.closed, 'and the connection closes');

const old = await exchange([`GET /one/host.js HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n`]);
ok(old.answers.length === 1 && /connection: close/i.test(old.answers[0]) && old.closed, 'HTTP/1.0 closes after its answer');

console.log(failures ? `${failures} failed` : 'PASS web_live_keepalive');
process.exit(failures ? 1 : 0);
