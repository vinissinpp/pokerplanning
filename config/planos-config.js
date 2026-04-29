/**
 * config/planos.js
 * Definição dos planos Free e Pro com limites
 */

const PLANOS = {
  free: {
    nome:          'Free',
    preco:         0,
    limites: {
      salas:       3,    // máx salas ativas simultâneas
      tarefas:     20,   // máx tarefas por sala
      participantes: 5,  // máx participantes por sala
      historico:   true, // histórico disponível (limitado)
    },
    descricao: [
      'Até 3 salas ativas',
      'Até 5 participantes por sala',
      'Até 20 tarefas por sala',
      'Histórico da sessão',
    ],
  },
  pro: {
    nome:          'Pro',
    preco:         2990, // em centavos = R$ 29,90
    precoExibicao: 29.90,
    limites: {
      salas:         999,
      tarefas:       999,
      participantes: 999,
      historico:     true,
    },
    descricao: [
      'Salas ilimitadas',
      'Participantes ilimitados',
      'Tarefas ilimitadas',
      'Histórico permanente',
      'Suporte prioritário',
    ],
  },
};

module.exports = PLANOS;
