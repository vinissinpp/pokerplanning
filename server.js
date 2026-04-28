require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const cors       = require('cors');

const rotasAuth  = require('./routes/auth');
const rotasSala  = require('./routes/sala');
const salaCtrl   = require('./controllers/salaController');
const socketHdl  = require('./socket/handlers');
const { geral }  = require('./middleware/rateLimit');

// Estado em memória
const salas = {};
salaCtrl.init(salas);

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors:         { origin: '*' },
  transports:   ['websocket', 'polling'],
  pingTimeout:  60000,
  pingInterval: 25000,
});

// Middlewares globais
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(geral);
app.use(express.static(path.join(__dirname, 'public')));

// Rotas API
app.use('/api/auth', rotasAuth);
app.use('/api/sala', rotasSala);

app.get('/api/metricas/:salaId', (req, res) => {
  const sala = salas[req.params.salaId];
  if (!sala) return res.status(404).json({ erro: 'Sala não encontrada.' });
  res.json({
    sala:      { id: sala.id, nome: sala.nome },
    metricas:  salaCtrl.calcularMetricas(sala),
    historico: sala.historico,
    tarefas:   sala.tarefas,
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});

// Rotas front-end
const pub = (file) => (req, res) =>
  res.sendFile(path.join(__dirname, 'public', file));

app.get('/sala/:id',     pub('sala.html'));
app.get('/cadastro',     pub('cadastro.html'));
app.get('/login',        pub('cadastro.html'));
app.get('/metricas/:id', pub('sala.html'));
app.get('*',             pub('index.html'));

// WebSocket
socketHdl.registrar(io, salas);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🃏 PokerPlanning rodando em http://localhost:${PORT}\n`);
});
