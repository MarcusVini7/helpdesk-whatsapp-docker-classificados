<?php
// amd2/api/src/amd_hook.php
//
// Ponto de entrada chamado pelo Asterisk via AGI ou pelo backend AMD2
// após a classificação de uma chamada.
//
// Pode ser invocado de 3 formas:
//   1. CLI (AGI/script Asterisk): php amd_hook.php <telefone> <resultado> <duracao> <ramal> <unique_id>
//   2. HTTP POST (backend AMD2 interno): POST /api/amd-hook com JSON
//   3. Webhook AMI (via manager.js ou similar): POST com form-data

require_once __DIR__ . '/HelpdeskIntegration.php';

// ─── Coleta parâmetros (CLI ou HTTP) ──────────────────────────────────────────
$dados = [];

if (php_sapi_name() === 'cli') {
    // Chamado via AGI: php amd_hook.php TELEFONE RESULTADO DURACAO RAMAL UNIQUE_ID
    $dados = [
        'telefone'    => $argv[1] ?? '',
        'resultado'   => $argv[2] ?? 'desconhecido',
        'duracao_seg' => isset($argv[3]) ? (int) $argv[3] : null,
        'ramal'       => $argv[4] ?? '',
        'unique_id'   => $argv[5] ?? '',
    ];
} else {
    // Chamado via HTTP
    header('Content-Type: application/json');

    // Autenticação interna simples (token Docker-interno)
    $tokenInterno = getenv('AMD2_INTERNAL_TOKEN') ?: '';
    $tokenRecebido = $_SERVER['HTTP_X_INTERNAL_TOKEN'] ?? '';
    if ($tokenInterno && $tokenRecebido !== $tokenInterno) {
        http_response_code(401);
        echo json_encode(['erro' => 'Token interno inválido']);
        exit(1);
    }

    $raw = file_get_contents('php://input');
    $dados = json_decode($raw, true) ?: [];

    // Suporte a form-data do Asterisk manager
    if (empty($dados)) {
        $dados = [
            'telefone'    => $_POST['telefone']    ?? $_POST['phone']     ?? '',
            'resultado'   => $_POST['resultado']   ?? $_POST['amdstatus'] ?? 'desconhecido',
            'duracao_seg' => isset($_POST['duracao']) ? (int) $_POST['duracao'] : null,
            'ramal'       => $_POST['ramal']       ?? $_POST['channel']   ?? '',
            'unique_id'   => $_POST['unique_id']   ?? $_POST['uniqueid']  ?? '',
        ];
    }
}

// Normaliza resultado do Asterisk (AMD nativo usa HUMAN, MACHINE, NOTSURE)
$mapa = [
    'human'    => 'humano',
    'machine'  => 'secretaria',
    'notsure'  => 'desconhecido',
    'no_answer'=> 'nao_atendeu',
    'busy'     => 'ocupado',
    'failed'   => 'invalido',
    'timeout'  => 'timeout',
];
$resultadoRaw = strtolower($dados['resultado'] ?? 'desconhecido');
$dados['resultado'] = $mapa[$resultadoRaw] ?? $resultadoRaw;

// ─── Envia para o Helpdesk ────────────────────────────────────────────────────
$integracao = new HelpdeskIntegration();
$resp = $integracao->enviarChamada($dados);

if (php_sapi_name() === 'cli') {
    echo ($resp['ok'] ? '[AMD Hook] Ticket criado: #' . ($resp['ticket_id'] ?? '?') : '[AMD Hook] Falha: ' . ($resp['erro'] ?? '?')) . PHP_EOL;
    exit($resp['ok'] ? 0 : 1);
} else {
    http_response_code($resp['ok'] ? 201 : 500);
    echo json_encode($resp);
}
