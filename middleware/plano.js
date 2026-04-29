/**
 * middleware/plano.js
 * Verifica se o usuário pode executar ação baseado no plano
 */

const supabase = require('../config/db');
const PLANOS   = require('../config/planos');

// Verifica limite de salas antes de criar
async function verificarLimiteSalas(req, res, next) {
  try {
    const usuario = req.usuario;
    if (!usuario) return next(); // guest — sem limite por plano

    const plano   = usuario.plano || 'free';
    const limites = PLANOS[plano]?.limites;
    if (!limites || limites.salas >= 999) return next(); // pro — sem limite

    // Conta salas ativas do usuário
    const { count } = await supabase
      .from('salas')
      .select('id', { count: 'exact', head: true })
      .eq('dono_id', usuario.id)
      .eq('ativa', true);

    if (count >= limites.salas) {
      return res.status(403).json({
        erro:  `Plano Free permite até ${limites.salas} salas ativas. Faça upgrade para Pro.`,
        acao:  'upgrade',
        plano: plano,
      });
    }

    next();
  } catch (err) {
    next(); // em caso de erro, não bloqueia
  }
}

module.exports = { verificarLimiteSalas };
