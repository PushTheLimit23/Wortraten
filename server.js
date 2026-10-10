// Wortraten – Echtzeit-Multiplayer für zwei Spieler
// Ein Spieler gibt ein Wort vor, der andere rät. Bei Revanche wechseln die Rollen.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const WORDS = require('./words');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MAX_ERRORS = 10;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { // unbekannte Pfade -> Spielseite
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, d2) => {
        res.writeHead(e2 ? 404 : 200, { 'Content-Type': TYPES['.html'] }); res.end(d2 || 'not found');
      });
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> room

function normWord(s) {
  return String(s || '').replace(/ß/g, 'SS').toUpperCase().replace(/\s+/g, ' ').trim();
}
function validWord(w) {
  if (w.length < 3 || w.length > 24) return false;
  if (!/^[A-ZÄÖÜ][A-ZÄÖÜ \-]*[A-ZÄÖÜ]$/.test(w)) return false;
  return true;
}
function cleanName(s) { return String(s || '').trim().slice(0, 20) || 'Gast'; }

function newRoom(code) {
  return { code, players: [null, null], setter: 0, phase: 'waiting', word: '', hint: '', guessed: [], wrong: [], errors: 0, result: null, solveTry: null, cleanup: null };
}

function masked(room) {
  return [...room.word].map(c => (LETTERS.includes(c) && !room.guessed.includes(c) ? '_' : c)).join('');
}

function stateFor(room, seat) {
  const over = room.phase === 'over';
  return {
    t: 'state',
    code: room.code,
    you: seat,
    phase: room.phase,
    setter: room.setter,
    players: room.players.map(p => p && { name: p.name, connected: !!p.ws, score: p.score }),
    masked: room.word ? masked(room) : '',
    word: (over || seat === room.setter) ? room.word : null,
    hint: room.hint,
    guessed: room.guessed,
    wrong: room.wrong,
    errors: room.errors,
    maxErrors: MAX_ERRORS,
    result: room.result,
    solveTry: room.solveTry,
  };
}

function broadcast(room) {
  room.players.forEach((p, i) => { if (p && p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(stateFor(room, i))); });
}

function finish(room, winnerSeat, how) {
  room.phase = 'over';
  room.result = { winner: winnerSeat, how };
  room.players[winnerSeat].score++;
}

function checkEnd(room) {
  const guesser = 1 - room.setter;
  if (!masked(room).includes('_')) finish(room, guesser, 'solved');
  else if (room.errors >= MAX_ERRORS) finish(room, room.setter, 'built');
}

wss.on('connection', ws => {
  let room = null, seat = -1;

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'join') {
      const code = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (!code) return;
      room = rooms.get(code) || newRoom(code);
      rooms.set(code, room);
      if (room.cleanup) { clearTimeout(room.cleanup); room.cleanup = null; }
      const pid = String(m.pid || '').slice(0, 64);
      // Wiederverbinden?
      seat = room.players.findIndex(p => p && p.pid === pid);
      if (seat === -1) seat = room.players.findIndex(p => p === null);
      if (seat === -1) { ws.send(JSON.stringify({ t: 'full' })); room = null; return ws.close(); }
      const old = room.players[seat];
      if (old && old.ws && old.ws !== ws) try { old.ws.close(); } catch {}
      room.players[seat] = { pid, name: cleanName(m.name), ws, score: old ? old.score : 0 };
      if (room.phase === 'waiting' && room.players[0] && room.players[1]) room.phase = 'setting';
      return broadcast(room);
    }
    if (!room || seat < 0) return;
    const isSetter = seat === room.setter;

    if (m.t === 'setWord' && room.phase === 'setting' && isSetter) {
      let word = m.random ? null : normWord(m.word);
      let hint = String(m.hint || '').trim().slice(0, 40);
      if (m.random) { const [w, h] = WORDS[Math.floor(Math.random() * WORDS.length)]; word = normWord(w); hint = h; }
      if (!validWord(word)) return ws.send(JSON.stringify({ t: 'error', msg: '3–24 Buchstaben, nur A–Z, Ä, Ö, Ü, Leerzeichen oder Bindestrich.' }));
      Object.assign(room, { word, hint, guessed: [], wrong: [], errors: 0, result: null, solveTry: null, phase: 'playing' });
      return broadcast(room);
    }

    if (m.t === 'guess' && room.phase === 'playing' && !isSetter) {
      const L = String(m.letter || '').toUpperCase();
      if (L.length !== 1 || !LETTERS.includes(L) || room.guessed.includes(L) || room.wrong.includes(L)) return;
      if (room.word.includes(L)) room.guessed.push(L); else { room.wrong.push(L); room.errors++; }
      room.solveTry = null;
      checkEnd(room);
      return broadcast(room);
    }

    if (m.t === 'solve' && room.phase === 'playing' && !isSetter) {
      const tryWord = normWord(m.word);
      if (!tryWord) return;
      if (tryWord === room.word) {
        for (const c of room.word) if (LETTERS.includes(c) && !room.guessed.includes(c)) room.guessed.push(c);
        finish(room, seat, 'solved');
      } else {
        room.errors = Math.min(MAX_ERRORS, room.errors + 2); // falscher Lösungsversuch kostet 2
        room.solveTry = tryWord.slice(0, 24);
        checkEnd(room);
      }
      return broadcast(room);
    }

    if (m.t === 'rematch' && room.phase === 'over') {
      room.setter = 1 - room.setter; // Rollen tauschen
      Object.assign(room, { phase: 'setting', word: '', hint: '', guessed: [], wrong: [], errors: 0, result: null, solveTry: null });
      return broadcast(room);
    }
  });

  ws.on('close', () => {
    if (!room || seat < 0 || !room.players[seat] || room.players[seat].ws !== ws) return;
    room.players[seat].ws = null;
    broadcast(room);
    if (room.players.every(p => !p || !p.ws)) {
      const r = room;
      r.cleanup = setTimeout(() => rooms.delete(r.code), 60 * 60 * 1000); // leere Räume nach 1 h löschen
    }
  });
});

// Verbindungen lebendig halten (Proxys trennen sonst inaktive WebSockets)
setInterval(() => wss.clients.forEach(c => { try { c.ping(); } catch {} }), 25000);

server.listen(PORT, () => console.log(`Wortraten läuft auf Port ${PORT}`));
