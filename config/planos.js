/**
 * config/planos.js
 * Diferenciação por funcionalidades, não por número de salas.
 * Free: salas ilimitadas, limites de participantes/tarefas, sem upload/download
 * Pro:  salas ilimitadas, limites maiores, upload + download + sem anúncios
 */

const PLANOS = {
  free: {
    nome:  'Free',
    preco: 0,
    limites: {
      participantes: 10,
      tarefas:       20,
    },
    funcionalidades: {
      upload:   false,
      download: false,
      ads:      true,
    },
    descricao: [
      'Salas ilimitadas',
      'Até 10 participantes por sala',
      'Até 20 tarefas por sala',
      'Histórico da sessão',
    ],
  },
  pro: {
    nome:          'Pro',
    preco:         1990, // em centavos = R$ 19,90
    precoExibicao: 19.90,
    precoUSD:      5.90,
    limites: {
      participantes: 30,
      tarefas:       40,
    },
    funcionalidades: {
      upload:   true,
      download: true,
      ads:      false,
    },
    descricao: [
      'Salas ilimitadas',
      'Até 30 participantes por sala',
      'Até 40 tarefas por sala',
      'Upload de planilhas XLSX',
      'Download dos resultados XLSX',
      'Sem anúncios',
      'Suporte prioritário',
    ],
  },
};

module.exports = PLANOS;
