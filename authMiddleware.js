// shared/authMiddleware.js
// Middleware de autenticação compartilhada entre Helpdesk e AMD2.
// Valida o JWT emitido pelo Helpdesk e injeta req.user.
// AMD2 (PHP) deve chamar o endpoint /api/auth/verify do Helpdesk antes de aceitar tokens.

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.SHARED_JWT_SECRET || process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('[shared-auth] ERRO CRÍTICO: SHARED_JWT_SECRET não definido!');
  process.exit(1);
}

/**
 * Extrai o token do header Authorization ou do cookie 'token'.
 */
function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

/**
 * Middleware: rejeita requests sem token válido.
 */
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ erro: 'Token não fornecido.' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

/**
 * Middleware: permite acesso sem token (anexa user se houver).
 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch (_) {}
  }
  next();
}

/**
 * Gera um token JWT compartilhado.
 * Usado pelo Helpdesk ao fazer login — o mesmo token funciona no AMD2.
 */
function signSharedToken(payload, expiresIn = '8h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

module.exports = { requireAuth, optionalAuth, signSharedToken, extractToken };
