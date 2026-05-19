<?php
// amd2/api/src/HelpdeskIntegration.php
//
// Serviço responsável por enviar o resultado de uma chamada AMD
// para a API do Helpdesk WhatsApp e criar o ticket automaticamente.
//
// Uso:
//   $integracao = new HelpdeskIntegration();
//   $resultado = $integracao->enviarChamada([
//     'telefone'    => '5511999990000',
//     'resultado'   => 'humano',
//     'duracao_seg' => 45,
//     'ramal'       => 'Fila-Vendas',
//     'unique_id'   => '1716800000.42',
//   ]);

class HelpdeskIntegration
{
    private string $baseUrl;
    private string $apiKey;
    private int    $timeoutSeg;

    public function __construct()
    {
        $this->baseUrl    = rtrim(getenv('HELPDESK_INTERNAL_URL') ?: 'http://helpdesk-server:3002', '/');
        $this->apiKey     = getenv('AMD2_INTEGRATION_KEY') ?: '';
        $this->timeoutSeg = (int)(getenv('HELPDESK_TIMEOUT_SEG') ?: 10);

        if (empty($this->apiKey)) {
            error_log('[HelpdeskIntegration] AVISO: AMD2_INTEGRATION_KEY não definida!');
        }
    }

    /**
     * Envia resultado de chamada para o Helpdesk criar um ticket.
     *
     * @param array $dados {
     *   string   $telefone      Número chamado (obrigatório)
     *   string   $resultado     humano|secretaria|nao_atendeu|ocupado|invalido|timeout
     *   int|null $duracao_seg   Duração da chamada em segundos
     *   string   $ramal         Nome do ramal/fila de origem
     *   string   $unique_id     UniqueID do Asterisk (para deduplicação)
     *   string   $contexto      Contexto do dialplan (opcional)
     *   string   $calldate      ISO 8601 timestamp (opcional)
     * }
     * @return array { ok: bool, ticket_id?: int, erro?: string, duplicado?: bool }
     */
    public function enviarChamada(array $dados): array
    {
        if (empty($dados['telefone']) || empty($dados['resultado'])) {
            return ['ok' => false, 'erro' => 'telefone e resultado são obrigatórios'];
        }

        // Verifica se Helpdesk está acessível antes de enviar
        if (!$this->ping()) {
            error_log('[HelpdeskIntegration] Helpdesk indisponível — chamada não registrada: ' . json_encode($dados));
            return ['ok' => false, 'erro' => 'Helpdesk indisponível'];
        }

        $url  = $this->baseUrl . '/api/integracao/amd2/chamada';
        $body = json_encode([
            'telefone'    => (string) $dados['telefone'],
            'resultado'   => strtolower((string) $dados['resultado']),
            'duracao_seg' => isset($dados['duracao_seg']) ? (int) $dados['duracao_seg'] : null,
            'ramal'       => $dados['ramal']     ?? null,
            'unique_id'   => $dados['unique_id'] ?? null,
            'contexto'    => $dados['contexto']  ?? null,
            'calldate'    => $dados['calldate']  ?? date('c'),
        ]);

        $resposta = $this->httpPost($url, $body);

        if ($resposta === false) {
            error_log('[HelpdeskIntegration] Falha HTTP ao criar ticket: ' . json_encode($dados));
            return ['ok' => false, 'erro' => 'Falha na comunicação com o Helpdesk'];
        }

        $json = json_decode($resposta['body'], true);
        if ($resposta['status'] >= 400 || !($json['ok'] ?? false)) {
            error_log('[HelpdeskIntegration] Helpdesk retornou erro: ' . $resposta['body']);
            return ['ok' => false, 'erro' => $json['erro'] ?? 'Erro desconhecido', 'http' => $resposta['status']];
        }

        return $json;
    }

    /**
     * Verifica se o Helpdesk está disponível.
     */
    public function ping(): bool
    {
        $url = $this->baseUrl . '/api/integracao/amd2/status';
        $resp = $this->httpGet($url);
        return $resp !== false && $resp['status'] === 200;
    }

    // ─── HTTP helpers ─────────────────────────────────────────────────────────

    private function httpPost(string $url, string $body): array|false
    {
        $ctx = stream_context_create([
            'http' => [
                'method'  => 'POST',
                'header'  => implode("\r\n", [
                    'Content-Type: application/json',
                    'x-amd2-key: ' . $this->apiKey,
                    'Content-Length: ' . strlen($body),
                ]),
                'content' => $body,
                'timeout' => $this->timeoutSeg,
                'ignore_errors' => true,
            ],
        ]);

        $body   = @file_get_contents($url, false, $ctx);
        $status = $this->parseStatus($http_response_header ?? []);

        if ($body === false) return false;
        return ['status' => $status, 'body' => $body];
    }

    private function httpGet(string $url): array|false
    {
        $ctx = stream_context_create([
            'http' => [
                'method'  => 'GET',
                'header'  => 'x-amd2-key: ' . $this->apiKey,
                'timeout' => 5,
                'ignore_errors' => true,
            ],
        ]);

        $body   = @file_get_contents($url, false, $ctx);
        $status = $this->parseStatus($http_response_header ?? []);

        if ($body === false) return false;
        return ['status' => $status, 'body' => $body];
    }

    private function parseStatus(array $headers): int
    {
        foreach ($headers as $h) {
            if (preg_match('/HTTP\/\S+\s+(\d{3})/', $h, $m)) {
                return (int) $m[1];
            }
        }
        return 0;
    }
}
