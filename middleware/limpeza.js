/**
 * middleware/limpeza.js
 * Limpeza automática de salas inativas e dados expirados
 *
 * Salas expiram após HORAS_SALA_ATIVA horas sem atividade
 * Roda a cada INTERVALO_LIMPEZA minutos
 */

const supabase = require('../config/db');

const HORAS_SALA_ATIVA  = parseInt(process.env.HORAS_SALA_ATIVA || '24');  // 24h padrão
const INTERVALO_LIMPEZA = parseInt(process.env.INTERVALO_LIMPEZA || '60'); // a cada 60min

// ─────────────────────────────────────────────
// Limpa salas antigas do banco
// ─────────────────────────────────────────────
async function limparSalasAntigas() {
  try {
    const corte = new Date(Date.now() - HORAS_SALA_ATIVA * 60 * 60 * 1000).toISOString();

    // Busca salas antigas
    const { data: salasAntigas } = await supabase
      .from('salas')
      .select('id')
      .lt('criada_em', corte)
      .eq('ativa', true);

    if (!salasAntigas?.length) return;

    const ids = salasAntigas.map(s => s.id);

    // Marca como inativas (não deleta — preserva histórico)
    await supabase
      .from('salas')
      .update({ ativa: false })
      .in('id', ids);

    console.log(`[limpeza] ${ids.length} sala(s) marcada(s) como inativa(s)`);
  } catch (err) {
    console.error('[limpeza:salas]', err.message);
  }
}

// ─────────────────────────────────────────────
// Limpa códigos de verificação expirados
// ─────────────────────────────────────────────
async function limparCodigosExpirados() {
  try {
    await supabase
      .from('usuarios')
      .update({
        codigo_verificacao: null,
        codigo_expira_em:   null,
        codigo_tipo:        null,
      })
      .lt('codigo_expira_em', new Date().toISOString())
      .not('codigo_verificacao', 'is', null);
  } catch (err) {
    console.error('[limpeza:codigos]', err.message);
  }
}

// ─────────────────────────────────────────────
// Limpa salas da memória que estão inativas
// ─────────────────────────────────────────────
function limparMemoria(salas) {
  const corte = Date.now() - HORAS_SALA_ATIVA * 60 * 60 * 1000;
  let removidas = 0;

  for (const [id, sala] of Object.entries(salas)) {
    // Remove se não tem participantes e foi criada há muito tempo
    const semParticipantes = Object.keys(sala.participantes).length === 0;
    const criadaEm = sala.criada_em ? new Date(sala.criada_em).getTime() : 0;
    if (semParticipantes && criadaEm < corte) {
      delete salas[id];
      removidas++;
    }
  }

  if (removidas > 0) {
    console.log(`[limpeza:memória] ${removidas} sala(s) removida(s) da memória`);
  }
}

// ─────────────────────────────────────────────
// Inicia o ciclo de limpeza
// ─────────────────────────────────────────────
function iniciarLimpeza(salas) {
  // Roda imediatamente na inicialização
  limparCodigosExpirados();

  // Roda periodicamente
  setInterval(async () => {
    await limparSalasAntigas();
    await limparCodigosExpirados();
    limparMemoria(salas);
  }, INTERVALO_LIMPEZA * 60 * 1000);

  console.log(`[limpeza] Iniciado — salas expiram após ${HORAS_SALA_ATIVA}h`);
}

module.exports = { iniciarLimpeza, limparMemoria };
