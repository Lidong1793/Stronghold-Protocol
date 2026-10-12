import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../server/lobby.js';
import { MATCH_WAIT_MS } from '../server/matchmaking.js';
import { lobbyReport } from '../server/http/lobbyDirectory.js';
import { ERR } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';

function fixture(t, options = {}) {
  let clock = 100_000;
  const sessions = new Map();
  const registry = { byId: id => sessions.get(id), all: () => sessions.values() };
  const lobby = new Lobby({ registry, now: () => clock, getData: () => ({}), options });
  t.after(() => lobby.shutdown());
  const player = () => {
    const frames = [];
    const s = { playerId: `p${sessions.size}`, name: `Doctor ${sessions.size}`, connected: true, roomCode: null,
      ws: { readyState: 1, bufferedAmount: 0, send: raw => frames.push(JSON.parse(raw)) }, frames };
    sessions.set(s.playerId, s);
    return s;
  };
  const create = (host, difficulty = 'NORMAL', mode = 'coop') => {
    assert.equal(lobby.create(host, { mode, difficulty }).ok, true);
    return lobby.roomOf(host);
  };
  const advance = ms => { clock += ms; lobby.matchmaking.drain(); };
  const report = () => lobbyReport({ registry, lobby, startedAt: 0 });
  return { lobby, player, create, advance, report, sessions };
}

for (const mode of ['solo', 'coop']) for (const running of [false, true]) {
  test(`last human disconnect removes ${mode} ${running ? 'running' : 'waiting'} room immediately`, t => {
    const { lobby, player, create, report } = fixture(t);
    const host = player(), room = create(host, 'NORMAL', mode);
    let watcher;
    if (mode === 'coop') {
      lobby.addBot(host);
      watcher = player(); lobby.spectate(watcher, { code: room.code });
    }
    let disposals = 0;
    if (running) {
      const match = { dispose: () => disposals++ };
      room.match = match;
      room.matchCtx = { live: true, ended: false, disposed: false, match };
    }
    host.connected = false;
    lobby.onDisconnect(host);
    assert.equal(lobby.getRoom(room.code), null);
    assert.equal(room.disposed, true);
    assert.equal(host.roomCode, null);
    assert.equal(host.notice, 'empty');
    assert.equal(host.resumeWindowMs, null);
    assert.equal(report().roomCount, 0);
    assert.equal(lobby.graceTimers.size, 0);
    assert.equal(disposals, running ? 1 : 0);
    if (watcher) {
      assert.equal(watcher.roomCode, null);
      assert.deepEqual(watcher.frames.at(-1), { t: 'room.closed', reason: 'empty' });
    }
    lobby.onDisconnect(host); lobby.shutdown();
    assert.equal(disposals, running ? 1 : 0, 'repeated cleanup never disposes a match twice');
  });
}

for (const action of ['leave', 'disconnect']) {
  test(`an offline teammate cannot retain a room after the last online human ${action}s`, t => {
    const { lobby, player, create } = fixture(t);
    const host = player(), guest = player(), room = create(host);
    lobby.join(guest, { code: room.code });
    guest.connected = false; lobby.onDisconnect(guest);
    assert.equal(lobby.getRoom(room.code), room, 'one connected human keeps the room and offline seat');
    assert.ok(lobby.graceTimers.has(guest.playerId));
    if (action === 'leave') lobby.leave(host);
    else { host.connected = false; lobby.onDisconnect(host); }
    assert.equal(lobby.getRoom(room.code), null);
    assert.equal(guest.roomCode, null);
    assert.equal(guest.notice, 'empty');
    assert.equal(lobby.graceTimers.size, 0);
  });
}

test('a disconnected teammate resumes their seat while another human stays online', t => {
  const { lobby, player, create } = fixture(t);
  const host = player(), guest = player(), watcher = player(), room = create(host);
  lobby.join(guest, { code: room.code });
  lobby.spectate(watcher, { code: room.code });
  watcher.connected = false; lobby.onDisconnect(watcher);
  guest.connected = false; lobby.onDisconnect(guest);
  assert.equal(lobby.getRoom(room.code), room);
  guest.connected = true; lobby.onHello(guest, { resumed: true, repeat: false });
  assert.equal(room.seatOf(guest.playerId).connected, true);
  assert.equal(lobby.graceTimers.has(guest.playerId), false);
  assert.equal(guest.frames.at(-1).t, 'room.state');
});

test('real socket closure immediately removes a running bot room and closes its spectator', async t => {
  const srv = await startServer({ host: '127.0.0.1', port: 0, quiet: true });
  const clients = [];
  t.after(async () => { await Promise.all(clients.map(c => c.terminate())); await srv.close(); });
  const connect = async (name, token = undefined) => {
    const c = await TestClient.connect(srv.url.replace('http:', 'ws:') + '/ws'); clients.push(c);
    c.welcome = await c.hello(name, token);
    return c;
  };
  const host = await connect('Host'), spectator = await connect('Spectator');
  assert.equal((await host.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' })).t, 'ok');
  const room = await host.waitFor('room.state');
  assert.equal((await host.request({ t: 'room.addBot' })).t, 'ok');
  assert.equal((await spectator.request({ t: 'room.spectate', code: room.code })).t, 'ok');
  assert.equal((await host.request({ t: 'room.start' })).t, 'ok');
  await host.waitFor('m.public');
  await host.terminate();
  assert.equal((await spectator.waitFor('room.closed')).reason, 'empty');
  assert.equal(srv.lobby.getRoom(room.code), null);
  assert.equal(srv.lobby.stats().matches, 0);
  assert.equal((await (await fetch(srv.url + '/api/lobby')).json()).roomCount, 0);
  const back = await connect('Host', host.welcome.token);
  assert.equal(back.welcome.resumed, true, 'player identity survives, the old room does not');
  assert.equal((await back.waitFor('room.closed')).reason, 'empty');
  assert.equal(srv.registry.byId(back.welcome.playerId).roomCode, null);
});

test('new messages validate identifiers, difficulties and boolean visibility', () => {
  for (const msg of [{ t: 'match.start', difficulty: 'NORMAL' }, { t: 'match.cancel' },
    { t: 'room.enter', directoryId: 'a'.repeat(24), spectate: false }, { t: 'room.setPublic', on: false }]) {
    assert.equal(validateC2S(msg), null);
  }
  for (const msg of [{ t: 'match.start', difficulty: 'bad' }, { t: 'room.setPublic', on: 'false' },
    { t: 'room.enter', directoryId: '0001', spectate: false }, { t: 'room.enter', directoryId: 'a'.repeat(24) }]) {
    assert.notEqual(validateC2S(msg), null);
  }
});

test('public by default; only host changes visibility; stale directory access is blocked, keys still work', t => {
  const { lobby, player, create, report } = fixture(t);
  const host = player(), guest = player(), watcher = player();
  const room = create(host);
  assert.equal(room.toState().isPublic, true);
  assert.equal(lobby.setPublic(guest, { on: false }).error, ERR.NOT_IN_ROOM);
  assert.equal(lobby.join(guest, { code: room.code }).ok, true);
  assert.equal(lobby.setPublic(guest, { on: false }).error, ERR.NOT_HOST);
  assert.equal(lobby.setPublic(host, { on: false }).ok, true);
  assert.equal(room.toState().isPublic, false);
  assert.equal(report().rooms.length, 0);
  assert.equal(report().roomCount, 1); // overview totals include private rooms without exposing their metadata
  assert.equal(report().waitingRooms, 1);
  for (const spectate of [true, false]) assert.equal(lobby.enterPublic(watcher, { directoryId: room.directoryId, spectate }).error, ERR.ROOM_NOT_FOUND);
  assert.equal(lobby.spectate(watcher, { code: room.code }).ok, true);
  assert.equal(lobby.leave(guest).ok, true);
  assert.equal(lobby.join(guest, { code: room.code.toLowerCase() }).ok, true);
  assert.equal(lobby.setPublic(host, { on: true }).ok, true);
  assert.equal(report().rooms.length, 1);
  lobby.leave(watcher);
  assert.equal(lobby.enterPublic(watcher, { directoryId: room.directoryId, spectate: true }).ok, true);
});

test('directory uses stable sequential numbers and opaque identifiers, without leaking join keys', t => {
  const { lobby, player, create, report } = fixture(t);
  const a = create(player()), b = create(player());
  let snapshot = report();
  assert.deepEqual(snapshot.rooms.map(r => r.number), ['0001', '0002']);
  assert.equal(snapshot.rooms[0].directoryId, a.directoryId);
  for (const r of [a, b]) assert.equal(JSON.stringify(snapshot).includes(r.code), false);
  lobby.leave(lobby.registry.byId(a.hostId));
  const c = create(player());
  snapshot = report();
  assert.deepEqual(snapshot.rooms.map(r => r.number), ['0002', '0003']);
  assert.notEqual(c.directoryId, a.directoryId);
  assert.equal(lobby.enterPublic(player(), { directoryId: a.directoryId, spectate: false }).error, ERR.ROOM_NOT_FOUND);
  assert.equal(lobby.enterPublic(player(), { directoryId: c.directoryId, spectate: false }).ok, true);
});

test('matching joins an available public room of the exact difficulty immediately', t => {
  const { lobby, player, create } = fixture(t);
  create(player(), 'HARD');
  const room = create(player()), guest = player();
  assert.equal(lobby.onMessage(guest, { t: 'match.start', difficulty: 'NORMAL' }).ok, true);
  assert.equal(guest.roomCode, room.code);
  assert.equal(lobby.matchmaking.queue.size, 0);
  assert.equal(lobby.rooms.size, 2);
});

for (const unavailable of ['private', 'full', 'started', 'solo', 'offline']) {
  test(`matching skips ${unavailable} rooms and creates only after the full 30 seconds`, t => {
    const { lobby, player, create, advance } = fixture(t);
    const room = create(player(), 'NORMAL', unavailable === 'solo' ? 'solo' : 'coop');
    if (unavailable === 'private') room.isPublic = false;
    if (unavailable === 'full') for (let i = 0; i < 3; i++) lobby.addBot(lobby.registry.byId(room.hostId));
    if (unavailable === 'started') room.match = {};
    if (unavailable === 'offline') room.seats[0].connected = false;
    const guest = player();
    lobby.matchmaking.start(guest, 'NORMAL');
    advance(MATCH_WAIT_MS - 1);
    assert.equal(guest.roomCode, null);
    advance(1);
    const assigned = lobby.roomOf(guest);
    assert.notEqual(assigned.code, room.code);
    assert.equal(assigned.difficulty, 'NORMAL');
    assert.equal(assigned.mode, 'coop');
    assert.equal(assigned.isPublic, true);
    assert.equal(assigned.hostId, guest.playerId);
    assert.equal(guest.frames.at(-1).reason, 'created');
  });
}

test('queued players fill one new room in FIFO order, never beyond its capacity', t => {
  const { lobby, player, advance } = fixture(t);
  const guests = Array.from({ length: 5 }, player);
  for (const s of guests) lobby.matchmaking.start(s, 'ABYSS');
  advance(MATCH_WAIT_MS);
  assert.equal(lobby.rooms.size, 2);
  assert.equal(lobby.roomOf(guests[0]).hostId, guests[0].playerId);
  assert.equal(lobby.roomOf(guests[0]).seats.filter(Boolean).length, 4);
  for (const s of guests.slice(0, 4)) assert.equal(s.roomCode, guests[0].roomCode);
  assert.notEqual(guests[4].roomCode, guests[0].roomCode);
  assert.equal(lobby.matchmaking.queue.size, 0);
});

test('opening a private room, freeing a slot or changing difficulty wakes matching immediately', t => {
  const { lobby, player, create } = fixture(t);
  const host = player(), room = create(host, 'HARD');
  lobby.setPublic(host, { on: false });
  const first = player(); lobby.matchmaking.start(first, 'HARD');
  lobby.setPublic(host, { on: true });
  assert.equal(first.roomCode, room.code);
  lobby.addBot(host); lobby.addBot(host);
  const second = player(); lobby.matchmaking.start(second, 'HARD');
  assert.equal(second.roomCode, null);
  lobby.removeBot(host, { seat: 2 });
  assert.equal(second.roomCode, room.code);
  const third = player(); lobby.matchmaking.start(third, 'NORMAL');
  lobby.removeBot(host, { seat: 3 });
  assert.equal(third.roomCode, null);
  lobby.setDifficulty(host, { difficulty: 'NORMAL' });
  assert.equal(third.roomCode, room.code);
});

test('cancellation, disconnect, expiry and shutdown prevent orphan timeout rooms', t => {
  const { lobby, player, advance } = fixture(t);
  const cancelled = player(), dropped = player(), expired = player(), stopped = player();
  for (const s of [cancelled, dropped, expired, stopped]) lobby.matchmaking.start(s, 'NORMAL');
  lobby.onMessage(cancelled, { t: 'match.cancel' });
  lobby.onMessage(cancelled, { t: 'match.cancel' });
  dropped.connected = false; lobby.onDisconnect(dropped);
  lobby.onExpire(expired);
  lobby.shutdown();
  advance(MATCH_WAIT_MS);
  assert.equal(lobby.matchmaking.queue.size, 0);
  assert.equal(lobby.rooms.size, 0);
  assert.equal(lobby.matchmaking.timer, null);
});

test('manual entry cancels matching and repeat starts do not postpone the deadline', t => {
  const { lobby, player, create, advance } = fixture(t);
  const host = player(), room = create(host, 'HARD'), guest = player();
  lobby.matchmaking.start(guest, 'NORMAL');
  const deadline = lobby.matchmaking.queue.get(guest.playerId).deadlineAt;
  advance(5000); lobby.matchmaking.start(guest, 'NORMAL');
  assert.equal(lobby.matchmaking.queue.get(guest.playerId).deadlineAt, deadline);
  lobby.join(guest, { code: room.code });
  assert.equal(lobby.matchmaking.queue.size, 0);
  assert.equal(lobby.matchmaking.start(guest, 'NORMAL').error, ERR.ALREADY);
  advance(MATCH_WAIT_MS);
  assert.equal(lobby.rooms.size, 1);
});

test('automatic creation respects existing room limits and reports a failed search', t => {
  const { lobby, player, advance } = fixture(t, { maxRooms: 0 });
  const guest = player();
  lobby.matchmaking.start(guest, 'NORMAL'); advance(MATCH_WAIT_MS);
  assert.equal(guest.roomCode, null);
  assert.equal(lobby.matchmaking.queue.size, 0);
  assert.equal(guest.frames.at(-1).reason, 'failed');
  assert.equal(guest.frames.at(-1).error, ERR.INTERNAL);
});

test('real HTTP/WebSocket flow: hidden keys, public entry, cancel, immediate match and 30-second fallback', { timeout: 40_000 }, async t => {
  const srv = await startServer({ host: '127.0.0.1', port: 0, quiet: true });
  const clients = [];
  t.after(async () => { await Promise.all(clients.map(c => c.terminate())); await srv.close(); });
  const connect = async name => {
    const c = await TestClient.connect(srv.url.replace('http:', 'ws:') + '/ws');
    clients.push(c);
    c.id = (await c.hello(name)).playerId;
    return c;
  };
  const ok = async (c, msg) => assert.equal((await c.request(msg)).t, 'ok');
  const directory = async () => (await fetch(srv.url + '/api/lobby')).json();
  const host = await connect('Host'), guest = await connect('Guest');
  await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
  const room = await host.waitFor('room.state');
  const listed = (await directory()).rooms[0];
  assert.equal(listed.number, '0001');
  assert.equal(Object.hasOwn(listed, 'code'), false);
  await ok(guest, { t: 'match.start', difficulty: 'HARD' });
  await guest.waitFor('match.state', m => m.searching);
  await ok(guest, { t: 'match.cancel' });
  await guest.waitFor('match.state', m => !m.searching);
  assert.equal(srv.lobby.matchmaking.queue.size, 0);
  await ok(host, { t: 'room.setPublic', on: false });
  assert.equal((await directory()).rooms.length, 0);
  assert.equal((await guest.request({ t: 'room.enter', directoryId: listed.directoryId, spectate: false })).code, ERR.ROOM_NOT_FOUND);
  await ok(guest, { t: 'room.join', code: room.code });
  await guest.waitFor('room.state', s => s.code === room.code);
  await ok(guest, { t: 'room.leave' });
  await ok(host, { t: 'room.setPublic', on: true });
  await ok(guest, { t: 'match.start', difficulty: 'NORMAL' });
  await guest.waitFor('room.state', s => s.code === room.code);
  await guest.waitFor('match.state', m => m.reason === 'joined');
  await ok(guest, { t: 'room.leave' });
  await ok(host, { t: 'room.setPublic', on: false });
  const began = Date.now();
  await ok(guest, { t: 'match.start', difficulty: 'ABYSS' });
  const search = await guest.waitFor('match.state', m => m.searching && m.difficulty === 'ABYSS');
  assert.equal(search.waitMs, 30_000);
  const created = await guest.waitFor('room.state', s => s.hostId === guest.id, 35_000);
  assert.ok(Date.now() - began >= 29_900, 'must wait the actual 30 seconds');
  assert.equal(created.difficulty, 'ABYSS');
  assert.equal(created.isPublic, true);
  await guest.waitFor('match.state', m => m.reason === 'created');
  assert.equal((await directory()).rooms[0].number, '0002');
});
