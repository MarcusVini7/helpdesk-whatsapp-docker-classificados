// helpdesk-whatsapp/server/src/PATCH_server.js
//
// Este arquivo NÃO substitui o server.js — ele mostra as linhas que você deve
// ADICIONAR ao server.js existente do helpdesk-whatsapp.
//
// ─── 1. Adicione os requires no topo do server.js ──────────────────────────────
//
// const authHandoff      = require('./routes/authHandoff');
// const integracaoAmd2   = require('./routes/integracaoAmd2');
//
// ─── 2. Registre as rotas ANTES das rotas existentes ──────────────────────────
//
// app.use('/auth',              authHandoff);
// app.use('/api/integracao/amd2', integracaoAmd2);
//
// ─── 3. Atualize a rota de auth para usar o signSharedToken ───────────────────
//
// Substitua o arquivo server/src/routes/auth.js pelo de integracao/helpdesk-whatsapp/server/src/routes/auth.js
//
// ─── 4. Adicione a variável de ambiente no .env ────────────────────────────────
//
// SHARED_JWT_SECRET=mesmo_valor_que_JWT_SECRET_ou_novo_valor_seguro
// AMD2_INTEGRATION_KEY=chave_aleatoria_para_amd2_TROQUE_AQUI
// PUBLIC_BASE_URL=http://IP_DO_SERVIDOR
//
// ─── 5. Exemplo completo de como fica o server.js (trecho relevante) ──────────

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

// ... demais imports existentes ...

const authRoutes        = require('./routes/auth');         // já existia — substituído
const authHandoff       = require('./routes/authHandoff');  // NOVO
const integracaoAmd2    = require('./routes/integracaoAmd2'); // NOVO
// ... outras rotas existentes ...

const app = express();

app.use(express.json());
app.use(cookieParser()); // necessário para ler cookie 'token'
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true, // necessário para cookies entre sistemas
}));

// ─── Rotas públicas / handoff ──────────────────────────────────────────────────
app.use('/auth', authHandoff);  // NOVO — /auth/handoff?token=...

// ─── Rotas de API ─────────────────────────────────────────────────────────────
app.use('/api/auth',             authRoutes);
app.use('/api/integracao/amd2',  integracaoAmd2);  // NOVO — recebe chamadas do AMD2
// ... demais app.use existentes ...

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`[helpdesk] Servidor na porta ${PORT}`));
