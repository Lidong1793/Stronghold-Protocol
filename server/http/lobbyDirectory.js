import { APP_VERSION, MAX_SEATS, MAX_SPECTATORS, PHASE } from '../../shared/constants.js';

/** Public room directory. Never includes session tokens, addresses or private match state. */
export function lobbyReport({ startedAt, registry, lobby }) {
  let onlinePlayers = 0;
  for (const session of registry.all()) if (session.connected) onlinePlayers++;
  const rooms = [...lobby.rooms.values()].filter((room) => !room.disposed).map((room) => {
    const players = room.seats.filter((seat) => seat && !seat.left);
    const inMatch = !!room.match;
    const capacity = room.mode === 'solo' ? 1 : MAX_SEATS;
    const phase = inMatch ? room.match.phase || PHASE.INFO_CHECK : PHASE.LOBBY;
    return {
      code: room.code,
      hostName: room.seatOf(room.hostId)?.name || players.find((seat) => !seat.isBot)?.name || '',
      mode: room.mode,
      difficulty: room.difficulty,
      players: players.map(({ name, isBot, connected }) => ({ name, isBot, connected })),
      playerCount: players.length,
      capacity,
      spectatorCount: room.spectators.length,
      spectatorCapacity: MAX_SPECTATORS,
      inMatch,
      phase,
      round: inMatch && Number.isInteger(room.match.round) ? room.match.round : 0,
      canJoin: room.mode === 'coop' && !inMatch && room.freeSeat() >= 0,
      canSpectate: room.mode === 'coop' && room.spectators.length < MAX_SPECTATORS,
      createdAt: room.createdAt,
    };
  }).sort((a, b) => Number(a.inMatch) - Number(b.inMatch) || b.createdAt - a.createdAt || a.code.localeCompare(b.code));
  const runningRooms = rooms.filter((room) => room.inMatch).length;
  return {
    ok: true, app: APP_VERSION, onlinePlayers, roomCount: rooms.length,
    waitingRooms: rooms.length - runningRooms, runningRooms,
    uptimeSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    updatedAt: Date.now(), rooms,
  };
}
