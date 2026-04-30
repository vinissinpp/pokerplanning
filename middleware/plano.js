/**
 * middleware/plano.js — v2.0
 * Limite baseado em salas_criadas (contador permanente, nunca decrementa)
 * Free: 3 salas vitalícias | Pro: ilimitado
 */

const supabase = require('../config/db');

const LIMITES = { free: 3, pro: Infinity };

// Sequências de votação disponíveis para seleção na sala
const SEQUENCIAS = {
  fibonacci:     { label: 'Fibonacci',          valores: [1, 2, 3, 5, 8, 13, 21, '?'] },
  fibonacci_ext: { label: 'Fibonacci Estendida', valores: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, '?'] },
  t_shirt:       { label: 'Camisetas',           valores: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?'] },
  pontos:        { label: 'Pontos',              valores: [1, 2, 4, 8, 16, 32, 64, '?'] },
  linear:        { label: 'Linear (1–10)',        valores: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, '?'] },
};

// Middleware: verifica se o usuário pode criar mais uma sala
async function verificarLimiteSalas(req, res, next) {
  try {
    const usuario = req.usuario;
    if (!usuario) return next(); // guest — sem conta, sem limite

    const { data: u, error } = await supabase
      .from('usuarios')
      .select('plano, salas_criadas')
      .eq('id', usuario.id)
      .single();

    if (error || !u) return next(); // em caso de erro não bloqueia

    const plano       = u.plano || 'free';
    const limite      = LIMITES[plano] ?? LIMITES.free;
    const salasCriadas = u.salas_criadas ?? 0;

    if (limite !== Infinity && salasCriadas >= limite) {
      return res.status(403).json({
        erro:        'LIMITE_PLANO',
        plano,
        salasCriadas,
        limite,
        mensagem:    `Você atingiu o limite de ${limite} salas do plano gratuito. Faça upgrade para Pro e crie salas ilimitadas.`,
        acao:        'upgrade',
      });
    }

    req.planoInfo = { plano, salasCriadas, limite };
    next();
  } catch (err) {
    console.error('[plano] erro:', err.message);
    next(); // não bloqueia em caso de erro inesperado
  }
}

// Incrementa salas_criadas atomicamente após criar sala com sucesso
async function incrementarSalasCriadas(usuarioId) {
  if (!usuarioId) return;
  try {
    // Tenta via RPC (atômica)
    const { error } = await supabase.rpc('incrementar_salas_criadas', { uid: usuarioId });
    if (error) {
      // Fallback manual
      const { data: u } = await supabase
        .from('usuarios').select('salas_criadas').eq('id', usuarioId).single();
      await supabase
        .from('usuarios')
        .update({ salas_criadas: (u?.salas_criadas ?? 0) + 1 })
        .eq('id', usuarioId);
    }
  } catch (err) {
    console.error('[plano] incrementar:', err.message);
  }
}

module.exports = { verificarLimiteSalas, incrementarSalasCriadas, SEQUENCIAS, LIMITES };
