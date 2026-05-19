<?php
// amd2/api/src/handoff.php
//
// Rota de handoff para o AMD2 receber o token do Helpdesk via URL e gravar no cookie.
// URL: /amd2/auth/handoff?token=xxx
// Adicione esta rota no nginx/router do AMD2.

$token    = $_GET['token']    ?? '';
$redirect = $_GET['redirect'] ?? '/amd2/';

if (empty($token)) {
    header('Location: /amd2/');
    exit;
}

// Grava em cookie compartilhado (mesmo domínio/host)
setcookie('token', $token, [
    'expires'  => time() + 8 * 3600,
    'path'     => '/',
    'httponly' => false,   // JS precisa ler
    'samesite' => 'Lax',
]);

// Página de transição: lê o cookie, grava no localStorage, redireciona
?><!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Redirecionando...</title>
  <meta name="robots" content="noindex">
</head>
<body>
  <p>Redirecionando...</p>
  <script>
    // Salva no localStorage do AMD2 e redireciona
    try { localStorage.setItem('token', <?= json_encode($token) ?>); } catch(e) {}
    window.location.replace(<?= json_encode($redirect) ?>);
  </script>
</body>
</html>
