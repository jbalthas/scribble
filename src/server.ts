import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Room } from './game';
import { PRESETS, SETTING_FIELDS } from './settings';

const PORT = Number(process.env.PORT) || 3000;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const app = express();
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')));
const httpServer = createServer(app);
const io = new Server(httpServer, { maxHttpBufferSize: 1e6 });
const rooms = new Map<string, Room>();

function newRoomCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  let room: Room | null = null;
  socket.emit('schema', { fields: SETTING_FIELDS, presets: PRESETS });

  socket.on('join', (data: unknown, ack: unknown) => {
    const reply = (res: object) => typeof ack === 'function' && ack(res);
    if (room || typeof data !== 'object' || data === null) return;
    const { name, code } = data as Record<string, unknown>;
    const wanted = typeof code === 'string' ? code.trim().toUpperCase() : '';
    let target = wanted ? rooms.get(wanted) : undefined;
    if (wanted && !target) return reply({ error: `Room ${wanted} not found` });
    if (!target) {
      target = new Room(newRoomCode(), io);
      rooms.set(target.code, target);
    }
    if (!target.join(socket, typeof name === 'string' ? name : '')) return reply({ error: 'That room is full' });
    room = target;
    reply({ code: room.code });
  });

  socket.on('settings', (s: unknown) => room?.updateSettings(socket.id, s));
  socket.on('start', () => room?.start(socket.id));
  socket.on('lobby', () => room?.backToLobby(socket.id));
  socket.on('choose', (i: unknown) => room?.chooseWord(socket.id, i));
  socket.on('draw', (op: unknown) => room?.draw(socket.id, op));
  socket.on('undo', () => room?.undo(socket.id));
  socket.on('clear', () => room?.clear(socket.id));
  socket.on('chat', (text: unknown) => room?.chat(socket.id, text));
  socket.on('vote', (data: unknown) => room?.vote(socket.id, data));
  socket.on('snapshot', (data: unknown) => room?.snapshot(socket.id, data));

  socket.on('disconnect', () => {
    if (!room) return;
    room.leave(socket.id);
    if (room.players.length === 0) rooms.delete(room.code);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Scribble Party running:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const iface of Object.values(networkInterfaces()).flat()) {
    if (iface && iface.family === 'IPv4' && !iface.internal) console.log(`  Network: http://${iface.address}:${PORT}`);
  }
});
