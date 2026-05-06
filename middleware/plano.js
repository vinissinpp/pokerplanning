/**
 * middleware/plano.js — v3.0
 * Planos diferenciados por funcionalidades, não por número de salas.
 * Free: salas ilimitadas, 10 participantes, 20 tarefas, sem upload/download
 * Pro:  salas ilimitadas, 30 participantes, 40 tarefas, upload + download
 */

// Limites por plano (participantes e tarefas por sala)
const LIMITES = {
  free: { participantes: 10, tarefas: 20 },
  pro:  { participantes: 30, tarefas: 40 },
};

// Sequências de votação disponíveis para seleção na sala
const SEQUENCIAS = {
  fibonacci:     { label: 'Fibonacci',          valores: [1, 2, 3, 5, 8, 13, 21, '?'] },
  fibonacci_ext: { label: 'Fibonacci Estendida', valores: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, '?'] },
  t_shirt:       { label: 'Camisetas',           valores: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?'] },
  pontos:        { label: 'Pontos',              valores: [1, 2, 4, 8, 16, 32, 64, '?'] },
  linear:        { label: 'Linear (1–10)',        valores: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, '?'] },
};

module.exports = { SEQUENCIAS, LIMITES };
