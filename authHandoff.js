// helpdesk-whatsapp/server/src/routes/authHandoff.js
//
// Rota de handoff de autenticação entre sistemas.
// Quando o usuário clica em "AMD2" no menu do Helpdesk, é redirecionado para:
//   /helpdesk/auth/handoff?token=xxx → grava no cookie/localStorage → redireciona
//
// O AMD2 tem uma rota análoga em PHP (ver amd2/api/src/handoff.php).

const express = require('express');
const router = express.Router();

// GET /auth/handoff?token=...&redirect=/amd2/
// Recebe o token, valida, grava em cookie e redireciona para o destino
router.get('/', (req, res) => {
  const { token, redirect: dest } = req.query;

  if (!token) {
    return res.redirect('/helpdesk/');
  }

  // Grava em cookie HttpOnly (SameSite=Lax funciona entre subpaths do mesmo host)
  res.cookie('token', token, {
    httpOnly: false,  // JS precisa ler para colocar no localStorage do sistema destino
    sameSite: 'Lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000, // 8h
  });

  const destino = dest || '/helpdesk/';
  return res.redirect(destino);
});

module.exports = router;
