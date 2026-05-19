// helpdesk-whatsapp/server/src/routes/auth.js  (SUBSTITUIR o existente)
//
// Mudanças em relação ao original:
//  1. Login emite JWT com SHARED_JWT_SECRET (usado também pelo AMD2)
//  2. Novo endpoint GET /api/auth/verify — AMD2 usa para validar tokens
//  3. Novo endpoint GET /api/auth/apps — retorna links dos sistemas para o menu

const express = require('express');
const bcrypt = require('bcrypt');
const { signSharedToken, requireAuth } = require('../../../../shared/authMiddleware');
// Se shared/ estiver no mesmo repo, ajuste o path:
// const { signSharedToken, requireAuth } = require('../../../shared/authMiddleware');

const router = express.Router();

// Importa models do jeito que o projeto já faz
const { User } = require('../models');

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Login único: emite token compartilhado válido no Helpdesk e no AMD2.
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ erro: 'Email e senha são obrigatórios.' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const senhaOk = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaOk) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const token = signSharedToken({
      id:     user.id,
      email:  user.email,
      nome:   user.nome,
      perfil: user.perfil,  // 'admin' | 'atendente'
      sistema: 'helpdesk',  // origem do login
    });

    res.json({
      token,
      usuario: {
        id:     user.id,
        nome:   user.nome,
        email:  user.email,
        perfil: user.perfil,
      },
    });
  } catch (err) {
    console.error('[auth] Erro no login:', err);
    res.status(500).json({ erro: 'Erro interno no login.' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'nome', 'email', 'perfil', 'createdAt'],
    });
    if (!user) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar usuário.' });
  }
});

// ─── GET /api/auth/verify ─────────────────────────────────────────────────────
// Endpoint público para o AMD2 (PHP) validar um token sem conhecer o secret.
// AMD2 faz GET /api/auth/verify com Bearer token → recebe { valido: true, usuario: {...} }
router.get('/verify', requireAuth, (req, res) => {
  res.json({
    valido:  true,
    usuario: req.user,
  });
});

// ─── GET /api/auth/apps ───────────────────────────────────────────────────────
// Retorna lista de aplicações disponíveis para montar o menu de navegação.
// O frontend usa isso para saber para onde apontar os links do menu lateral.
router.get('/apps', requireAuth, (req, res) => {
  const base = process.env.PUBLIC_BASE_URL || '';

  res.json({
    apps: [
      {
        id:    'helpdesk',
        nome:  'Helpdesk WhatsApp',
        url:   `${base}/helpdesk/`,
        icone: 'chat',
        ativo: true,
      },
      {
        id:    'amd2',
        nome:  'AMD2 / Classificador',
        url:   `${base}/amd2/`,
        icone: 'phone',
        ativo: true,
      },
    ],
  });
});

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', requireAuth, async (req, res) => {
  try {
    // Só admin pode criar usuários
    if (req.user.perfil !== 'admin') {
      return res.status(403).json({ erro: 'Apenas admins podem criar usuários.' });
    }
    const { nome, email, senha, perfil } = req.body;
    if (!nome || !email || !senha) {
      return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios.' });
    }
    const existente = await User.findOne({ where: { email } });
    if (existente) return res.status(409).json({ erro: 'Email já cadastrado.' });

    const senha_hash = await bcrypt.hash(senha, 12);
    const novo = await User.create({ nome, email, senha_hash, perfil: perfil || 'atendente' });

    res.status(201).json({
      id:     novo.id,
      nome:   novo.nome,
      email:  novo.email,
      perfil: novo.perfil,
    });
  } catch (err) {
    console.error('[auth] Erro no register:', err);
    res.status(500).json({ erro: 'Erro ao criar usuário.' });
  }
});

module.exports = router;
