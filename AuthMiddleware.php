<?php
// amd2/api/src/AuthMiddleware.php
//
// Valida o JWT compartilhado emitido pelo Helpdesk.
// Estratégia: chama GET /api/auth/verify no Helpdesk com o token.
// Isso evita duplicar o JWT_SECRET no PHP — só o Helpdesk (Node) conhece o secret.

class AuthMiddleware
{
    private string $helpdeskUrl;
    private int    $timeout;

    // Cache em memória por request (evita múltiplas chamadas ao /verify na mesma requisição)
    private static array $cache = [];

    public function __construct()
    {
        $this->helpdeskUrl = rtrim(getenv('HELPDESK_INTERNAL_URL') ?: 'http://helpdesk-server:3002', '/');
        $this->timeout     = 5;
    }

    /**
     * Extrai o token do header Authorization ou cookie.
     */
    public function extractToken(): ?string
    {
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($auth, 'Bearer ')) {
            return substr($auth, 7);
        }
        return $_COOKIE['token'] ?? null;
    }

    /**
     * Valida o token contra o Helpdesk e retorna o usuário, ou null se inválido.
     */
    public function verificar(?string $token): ?array
    {
        if (!$token) return null;

        // Cache por token dentro do mesmo request
        $hash = md5($token);
        if (isset(self::$cache[$hash])) return self::$cache[$hash];

        $url = $this->helpdeskUrl . '/api/auth/verify';
        $ctx = stream_context_create([
            'http' => [
                'method'  => 'GET',
                'header'  => "Authorization: Bearer $token\r\nAccept: application/json",
                'timeout' => $this->timeout,
                'ignore_errors' => true,
            ],
        ]);

        $body = @file_get_contents($url, false, $ctx);
        if ($body === false) {
            error_log('[AuthMiddleware] Não foi possível conectar ao Helpdesk para verificar token.');
            return null;
        }

        $json = json_decode($body, true);
        if (!($json['valido'] ?? false)) return null;

        $usuario = $json['usuario'] ?? null;
        self::$cache[$hash] = $usuario;
        return $usuario;
    }

    /**
     * Middleware: encerra o request com 401 se token inválido.
     * Retorna o usuário autenticado se válido.
     */
    public function exigirAuth(): array
    {
        header('Content-Type: application/json');
        $token   = $this->extractToken();
        $usuario = $this->verificar($token);

        if (!$usuario) {
            http_response_code(401);
            echo json_encode(['erro' => 'Não autenticado. Faça login no Helpdesk.']);
            exit;
        }

        return $usuario;
    }

    /**
     * Middleware: exige perfil específico (ex: 'admin').
     */
    public function exigirPerfil(string $perfil): array
    {
        $usuario = $this->exigirAuth();
        if (($usuario['perfil'] ?? '') !== $perfil) {
            http_response_code(403);
            echo json_encode(['erro' => "Acesso negado. Perfil '$perfil' necessário."]);
            exit;
        }
        return $usuario;
    }
}
