// helpdesk-whatsapp/server/src/routes/integracaoAmd2.js
//
// Rota exclusiva para receber eventos do AMD2 e criar tickets automaticamente.
// Autenticação por API key (AMD2_INTEGRATION_KEY no .env) — não usa JWT de usuário.

const express = require('express');
const router = express.Router();
const { Ticket, Message, User } = require('../models');

// ─── Middleware: valida API key do AMD2 ──────────────────────────────────────
function requireAmd2Key(req, res, next) {
  const key = req.headers['x-amd2-key'] || req.query.key;
  const expected = process.env.AMD2_INTEGRATION_KEY;

  if (!expected) {
    console.error('[integracao-amd2] AMD2_INTEGRATION_KEY não definida no .env!');
    return res.status(500).json({ erro: 'Integração não configurada no servidor.' });
  }
  if (!key || key !== expected) {
    return res.status(401).json({ erro: 'API key inválida.' });
  }
  next();
}

// ─── Mapeamento: resultado AMD → prioridade e status do ticket ───────────────
const RESULTADO_MAP = {
  humano:        { prioridade: 'alta',   status: 'aberto',     label: '📞 Humano atendeu' },
  secretaria:    { prioridade: 'media',  status: 'aberto',     label: '📠 Secretária / PABX' },
  nao_atendeu:   { prioridade: 'baixa',  status: 'pendente',   label: '📵 Não atendeu' },
  ocupado:       { prioridade: 'media',  status: 'pendente',   label: '📞 Ocupado' },
  invalido:      { prioridade: 'baixa',  status: 'pendente',   label: '❌ Número inválido' },
  timeout:       { prioridade: 'baixa',  status: 'pendente',   label: '⏱ Timeout' },
  desconhecido:  { prioridade: 'baixa',  status: 'pendente',   label: '❓ Desconhecido' },
};

// ─── POST /api/integracao/amd2/chamada ───────────────────────────────────────
// AMD2 chama este endpoint ao concluir a classificação de uma chamada.
//
// Body esperado (JSON):
// {
//   "telefone":      "5511999990000",   // número que foi chamado
//   "resultado":     "humano",          // ver RESULTADO_MAP
//   "duracao_seg":   45,                // duração da chamada em segundos
//   "ramal":         "Fila-Vendas",     // ramal ou fila de origem
//   "unique_id":     "1716800000.42",   // ID único do Asterisk (para dedup)
//   "contexto":      "discador",        // contexto do dialplan (opcional)
//   "calldate":      "2025-05-15T10:30:00Z" // ISO timestamp (opcional)
// }
router.post('/chamada', requireAmd2Key, async (req, res) => {
  const {
    telefone,
    resultado,
    duracao_seg,
    ramal,
    unique_id,
    contexto,
    calldate,
  } = req.body;

  // Validação básica
  if (!telefone || !resultado) {
    return res.status(400).json({
      erro: 'Campos obrigatórios: telefone, resultado.',
    });
  }

  // Normaliza resultado para chave conhecida
  const resultadoKey = (resultado || '').toLowerCase().replace(/\s+/g, '_');
  const meta = RESULTADO_MAP[resultadoKey] || RESULTADO_MAP.desconhecido;

  try {
    // Deduplicação: evita criar ticket duplicado para o mesmo unique_id
    if (unique_id) {
      const existente = await Ticket.findOne({
        where: { canal: 'voz', unique_id_asterisk: unique_id },
      });
      if (existente) {
        return res.json({
          ok: true,
          duplicado: true,
          ticket_id: existente.id,
          mensagem: 'Ticket já existia para este unique_id.',
        });
      }
    }

    // Formata duração legível
    const duracaoFmt = duracao_seg
      ? `${Math.floor(duracao_seg / 60)}m ${duracao_seg % 60}s`
      : 'desconhecida';

    // Título do ticket
    const titulo = `[Voz] ${meta.label} — ${telefone}`;

    // Corpo da primeira mensagem interna
    const corpo = [
      `**Chamada classificada pelo AMD2**`,
      ``,
      `📞 Telefone: ${telefone}`,
      `📊 Resultado: ${meta.label}`,
      `⏱ Duração: ${duracaoFmt}`,
      `📡 Ramal/Fila: ${ramal || 'não informado'}`,
      `🕐 Data: ${calldate ? new Date(calldate).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')}`,
      unique_id ? `🔑 Asterisk ID: ${unique_id}` : '',
      contexto  ? `📋 Contexto: ${contexto}` : '',
    ].filter(Boolean).join('\n');

    // Cria o ticket
    const ticket = await Ticket.create({
      titulo,
      status:              meta.status,
      prioridade:          meta.prioridade,
      canal:               'voz',
      telefone_cliente:    telefone,
      unique_id_asterisk:  unique_id || null,
      resultado_amd:       resultadoKey,
      duracao_seg:         duracao_seg || null,
      ramal_origem:        ramal || null,
      // Não vincula a um usuário cliente específico — atendente vai verificar
    });

    // Cria mensagem interna com os detalhes
    await Message.create({
      ticket_id: ticket.id,
      conteudo:  corpo,
      origem:    'sistema',
      tipo:      'interno',
    });

    console.log(`[integracao-amd2] Ticket #${ticket.id} criado — ${telefone} — ${meta.label}`);

    return res.status(201).json({
      ok:        true,
      ticket_id: ticket.id,
      titulo,
      status:    meta.status,
      prioridade: meta.prioridade,
    });

  } catch (err) {
    console.error('[integracao-amd2] Erro ao criar ticket:', err);
    return res.status(500).json({ erro: 'Erro interno ao criar ticket.' });
  }
});

// ─── GET /api/integracao/amd2/status ─────────────────────────────────────────
// AMD2 usa para verificar se o Helpdesk está acessível antes de enviar chamadas.
router.get('/status', requireAmd2Key, (req, res) => {
  res.json({ ok: true, sistema: 'helpdesk-whatsapp', ts: new Date().toISOString() });
});

module.exports = router;
