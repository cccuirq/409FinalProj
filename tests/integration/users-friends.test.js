import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { initializeDatabase } from '../../src/db/schema.js';
import { createApp } from '../../src/app.js';

test('User & Friends HTTP workflows', { timeout: 240000 }, async (t) => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '8.0.16' } });
  const client = new MongoClient(replica.getUri());
  const servers = [];
  t.after(async () => {
    for (const server of servers) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await client.close(); await replica.stop();
  });
  await client.connect();
  const db = client.db('users_friends_test');
  await initializeDatabase(db);
  const server = createApp(client, db, { secureCookies: false }); servers.push(server);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  function browser() {
    return { cookie: '', async request(path, method = 'GET', body, headers = {}) {
      const response = await fetch(base + path, { method, headers: { ...(this.cookie ? { Cookie: this.cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
      const set = response.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0];
      return { status: response.status, headers: response.headers, body: await response.json() };
    } };
  }
  const alice = browser(), bob = browser(), eve = browser(), guest = browser();
  const account = (name) => ({ username: name, email: `${name}@example.com`, display_name: name, password: 'correct horse battery' });
  let aliceId, bobId, relationId;

  await t.test('registers normalized accounts, stores hashes and rejects duplicates', async () => {
    const result = await alice.request('/api/auth/register', 'POST', { ...account('Alice'), email: 'ALICE@EXAMPLE.COM' });
    assert.equal(result.status, 201); aliceId = result.body.data._id;
    assert.equal(result.body.data.username, 'alice'); assert.equal(result.body.data.email, 'alice@example.com');
    assert.match(result.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal(result.body.data.password_hash, undefined);
    const stored = await db.collection('users').findOne({ _id: aliceId });
    assert.match(stored.password_hash, /^scrypt\$/); assert.ok(!stored.password_hash.includes('correct horse'));
    const session = await db.collection('sessions').findOne({ user_id: aliceId });
    assert.notEqual(session.token_hash, alice.cookie.split('=')[1]);
    assert.equal((await guest.request('/api/auth/register', 'POST', account('alice'))).status, 409);
    assert.equal((await guest.request('/api/auth/register', 'POST', { ...account('other'), email: 'alice@example.com' })).status, 409);
    assert.equal((await guest.request('/api/auth/register', 'POST', { ...account('short'), password: '123' })).status, 400);
    assert.equal((await guest.request('/api/auth/register', 'POST', { ...account('inject'), email: { $ne: null } })).status, 400);
    bobId = (await bob.request('/api/auth/register', 'POST', account('bob'))).body.data._id;
    await eve.request('/api/auth/register', 'POST', account('eve'));
  });
  await t.test('requires authentication, isolates profile edits and protects searches', async () => {
    assert.equal((await guest.request('/api/users/me')).status, 401);
    const profile = await alice.request('/api/users/me', 'PATCH', { display_name: '<script>not HTML</script>', email: 'newalice@example.com' });
    assert.equal(profile.status, 200); assert.equal(profile.body.data.email, 'newalice@example.com');
    assert.equal((await alice.request('/api/users/me', 'PATCH', { user_id: bobId, display_name: 'Hacked' })).status, 400);
    assert.equal((await bob.request('/api/users/me')).body.data.display_name, 'bob');
    assert.equal((await alice.request('/api/users/me', 'PATCH', { email: 'bob@example.com' })).status, 409);
    const results = await alice.request('/api/users?q=bo');
    assert.equal(results.status, 200); assert.equal(results.body.data[0]._id, bobId);
    assert.equal(results.body.data[0].email, undefined); assert.equal(results.body.data[0].password_hash, undefined);
    assert.equal((await alice.request('/api/users?q=.*')).body.data.length, 0);
    assert.equal((await alice.request('/api/users?q=b')).status, 400);
    assert.equal((await alice.request('/api/users?q=bo&offset=-1')).status, 400);
    assert.equal((await alice.request('/api/users/me', 'PATCH', { display_name: 'bad' }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await alice.request('/api/users/me', 'PATCH', { display_name: 'bad' }, { 'Content-Type': 'text/plain' })).status, 415);
  });
  await t.test('friend requests enforce pair uniqueness and recipient authorization', async () => {
    assert.equal((await alice.request('/api/friends/requests', 'POST', { user_id: aliceId })).status, 400);
    assert.equal((await alice.request('/api/friends/requests', 'POST', { user_id: randomUUID() })).status, 404);
    assert.equal((await alice.request('/api/friends/requests', 'POST', { user_id: 'bad' })).status, 400);
    const results = await Promise.all([alice.request('/api/friends/requests', 'POST', { user_id: bobId }), bob.request('/api/friends/requests', 'POST', { user_id: aliceId })]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const relation = await db.collection('friendships').findOne({}); relationId = relation._id;
    const sender = relation.requested_by === aliceId ? alice : bob;
    const recipient = sender === alice ? bob : alice;
    assert.equal((await sender.request('/api/friends/requests?direction=outgoing')).body.data.length, 1);
    assert.equal((await recipient.request('/api/friends/requests')).body.data.length, 1);
    assert.equal((await eve.request('/api/friends/requests')).body.data.length, 0);
    assert.equal((await sender.request(`/api/friends/requests/${relationId}`, 'PATCH', { status: 'accepted' })).status, 404);
    assert.equal((await eve.request(`/api/friends/requests/${relationId}`, 'PATCH', { status: 'accepted' })).status, 404);
    assert.equal((await recipient.request(`/api/friends/requests/${relationId}`, 'PATCH', { status: 'removed' })).status, 400);
    assert.equal((await recipient.request(`/api/friends/requests/${relationId}`, 'PATCH', { status: 'declined' })).status, 200);
    assert.equal((await alice.request('/api/friends')).body.data.length, 0);
  });
  await t.test('reapplies, accepts, lists both sides, removes and reapplies again', async () => {
    const reapplied = await alice.request('/api/friends/requests', 'POST', { user_id: bobId });
    assert.equal(reapplied.status, 201); assert.equal(reapplied.body.data._id, relationId);
    assert.equal((await bob.request(`/api/friends/requests/${relationId}`, 'PATCH', { status: 'accepted' })).status, 200);
    for (const person of [alice, bob]) {
      const result = await person.request('/api/friends');
      assert.equal(result.body.data.length, 1); assert.equal(result.body.data[0].user.email, undefined);
      assert.equal((await person.request('/api/friends/requests')).body.data.length, 0);
    }
    assert.equal((await eve.request(`/api/friends/${bobId}`, 'DELETE')).status, 404);
    assert.equal((await alice.request(`/api/friends/${bobId}`, 'DELETE')).status, 200);
    assert.equal((await db.collection('friendships').findOne({ _id: relationId })).status, 'removed');
    assert.equal((await bob.request('/api/friends')).body.data.length, 0);
    assert.equal((await bob.request('/api/friends/requests', 'POST', { user_id: aliceId })).status, 201);
    assert.equal((await alice.request(`/api/friends/requests/${relationId}`, 'PATCH', { status: 'accepted' })).status, 200);
    assert.equal(await db.collection('friendships').countDocuments(), 1);
  });
  await t.test('logout revokes tokens, login rotates sessions and expired tokens fail', async () => {
    const oldCookie = alice.cookie;
    assert.equal((await alice.request('/api/auth/logout', 'POST')).status, 200);
    alice.cookie = oldCookie; assert.equal((await alice.request('/api/users/me')).status, 401);
    assert.equal((await alice.request('/api/auth/login', 'POST', { identifier: 'alice', password: 'wrong password' })).status, 401);
    assert.equal((await alice.request('/api/auth/login', 'POST', { identifier: 'missing', password: 'wrong password' })).status, 401);
    assert.equal((await alice.request('/api/auth/login', 'POST', { identifier: 'NEWALICE@EXAMPLE.COM', password: account('alice').password })).status, 200);
    const loggedIn = alice.cookie;
    await alice.request('/api/auth/login', 'POST', { identifier: 'alice', password: account('alice').password });
    assert.notEqual(alice.cookie, loggedIn);
    guest.cookie = loggedIn; assert.equal((await guest.request('/api/users/me')).status, 401);
    const token = alice.cookie.split('=')[1];
    await db.collection('sessions').updateOne({ token_hash: createHash('sha256').update(token).digest('hex') }, { $set: { expires_at: new Date(0) } });
    assert.equal((await alice.request('/api/users/me')).status, 401);
  });
  await t.test('serves UI and handles malformed JSON and rate limits', async () => {
    const html = await fetch(base); assert.equal(html.status, 200); assert.match(await html.text(), /Your friends/);
    const invalid = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' }); assert.equal(invalid.status, 400);
    assert.equal((await guest.request('/api/auth/login', 'POST', { identifier: 'x'.repeat(20000), password: 'wrong password' })).status, 413);
    const limited = createApp(client, db, { secureCookies: false, authLimit: 1 }); servers.push(limited);
    limited.listen(0, '127.0.0.1'); await once(limited, 'listening');
    const url = `http://127.0.0.1:${limited.address().port}/api/auth/login`;
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'none', password: 'wrong password' }) };
    assert.equal((await fetch(url, options)).status, 401);
    const blocked = await fetch(url, options); assert.equal(blocked.status, 429); assert.ok(blocked.headers.get('retry-after'));
  });
});
