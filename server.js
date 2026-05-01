/**
 * server.js — Pontua Planning v4.0
 * Express + Socket.io + JWT + Supabase + Segurança + Pagamento
 */

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');

const { corsConfig, helmetConfig, sanitizarBody, bloquearPayloadGrande } = require('./middleware/seguranca');
const { geral }          = require('./middleware/rateLimit');
const { iniciarLimpeza } = require('./middleware/limpeza');

const rotasAuth     = require('./routes/auth');
const rotasSala     = require('./routes/sala');
const rotasPagamento = require('./routes/pagamento');
const salaCtrl      = require('./controllers/salaController');
const socketHdl     = require('./socket/handlers');

// ─────────────────────────────────────────────
// ESTADO EM MEMÓRIA
// ─────────────────────────────────────────────
const salas = {};
salaCtrl.init(salas);

// ─────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: [
      process.env.APP_URL,
      process.env.CORS_ORIGIN,
      'http://localhost:3000',
    ].filter(Boolean),
    methods: ['GET', 'POST'],
  },
  transports:        ['websocket', 'polling'],
  pingTimeout:       60000,
  pingInterval:      25000,
  maxHttpBufferSize: 1e6,
});

// ─────────────────────────────────────────────
// MIDDLEWARES GLOBAIS
// ─────────────────────────────────────────────
app.use(helmetConfig);
app.use(corsConfig);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(bloquearPayloadGrande);
app.use(sanitizarBody);
app.use(geral);
app.use(express.static(path.join(__dirname, 'public')));
app.disable('x-powered-by');
app.set('trust.proxy',1); 
 
// ─────────────────────────────────────────────
// ROTAS API
// ─────────────────────────────────────────────
app.use('/api/auth',     rotasAuth);
app.use('/api/sala',     rotasSala);
app.use('/api/pagamento', rotasPagamento);

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

// ─────────────────────────────────────────────
// ROTAS FRONT-END
// ─────────────────────────────────────────────
const pub = (file) => (req, res) =>
  res.sendFile(path.join(__dirname, 'public', file));

app.get('/sala/:id',     pub('sala.html'));
app.get('/cadastro',     pub('cadastro.html'));
app.get('/login',        pub('cadastro.html'));
app.get('/planos',       pub('planos.html'));
app.get('/metricas/:id', pub('sala.html'));
app.get('*',             pub('index.html'));

// ─────────────────────────────────────────────
// ERRO GLOBAL
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.message?.includes('CORS')) {
    return res.status(403).json({ erro: 'Acesso não autorizado.' });
  }
  console.error('[erro]', err.message);
  res.status(500).json({
    erro: process.env.NODE_ENV === 'production'
      ? 'Erro interno. Tente novamente.'
      : err.message,
  });
});

// ─────────────────────────────────────────────
// WEBSOCKET + LIMPEZA
// ─────────────────────────────────────────────
socketHdl.registrar(io, salas);
iniciarLimpeza(salas);

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🃏 Pontua Planning v4.0`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → Ambiente:  ${process.env.NODE_ENV || 'development'}`);
  console.log(`   → Banco:     ${process.env.SUPABASE_URL ? 'Supabase ✓' : 'Memória'}`);
  console.log(`   → Pagamento: ${process.env.MP_ACCESS_TOKEN ? 'Mercado Pago ✓' : 'não configurado'}`);
  console.log(`   → Salas expiram após: ${process.env.HORAS_SALA_ATIVA || 24}h\n`);
});
