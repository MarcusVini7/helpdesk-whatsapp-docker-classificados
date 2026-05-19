# INTEGRACAO.md — Guia de Instalação: Opções 1 e 2

## O que foi implementado

### Opção 1 — Login único + menu de navegação
- JWT emitido pelo Helpdesk passa a ser válido no AMD2
- Endpoint `GET /api/auth/verify` no Helpdesk valida tokens para o AMD2
- Endpoint `GET /api/auth/apps` retorna lista de sistemas para o menu
- Menu lateral (`navMenu.js`) injetado nos dois frontends
- Handoff de token via URL ao navegar entre sistemas

### Opção 2 — Chamada AMD2 cria ticket no Helpdesk
- AMD2 chama `POST /api/integracao/amd2/chamada` no Helpdesk após classificar chamada
- Ticket criado com: telefone, resultado AMD, duração, ramal, unique_id Asterisk
- Prioridade automática: humano=alta, secretária=média, não atendeu=baixa
- Deduplicação por `unique_id_asterisk` — nunca cria ticket duplicado
- AMD2 verifica disponibilidade do Helpdesk antes de enviar

---

## Arquivos criados / a aplicar

```
integracao/
├── shared/
│   ├── authMiddleware.js          → copiar para helpdesk-whatsapp/shared/
│   └── navMenu.js                 → copiar para helpdesk-whatsapp/web/shared/
│
├── helpdesk-whatsapp/
│   ├── server/src/routes/
│   │   ├── auth.js                → SUBSTITUIR o existente
│   │   ├── integracaoAmd2.js      → NOVO arquivo
│   │   ├── authHandoff.js         → NOVO arquivo
│   │   └── PATCH_server.js        → guia de patch do server.js
│   └── database/
│       └── migration_add_voz.sql  → executar no banco MySQL
│
├── amd2/
│   └── api/src/
│       ├── HelpdeskIntegration.php → copiar para amd2/api/src/
│       ├── AuthMiddleware.php      → copiar para amd2/api/src/
│       ├── amd_hook.php            → copiar para amd2/api/src/
│       └── handoff.php             → copiar para amd2/api/src/
│
├── .env.integration               → conteúdo a ADICIONAR no .env principal
├── docker-compose.integration.yml → usar como override ou mergear no principal
└── nginx_patch_handoff.conf       → blocos a adicionar no default.conf do nginx
```

---

## Passo a passo de instalação

### 1. Copiar arquivos

```bash
cd /opt/projetos

# Shared auth middleware
mkdir -p helpdesk-whatsapp/shared
cp integracao/shared/authMiddleware.js helpdesk-whatsapp/shared/
cp integracao/shared/navMenu.js helpdesk-whatsapp/web/shared/

# Rotas do Helpdesk
cp integracao/helpdesk-whatsapp/server/src/routes/auth.js \
   helpdesk-whatsapp/server/src/routes/auth.js
cp integracao/helpdesk-whatsapp/server/src/routes/integracaoAmd2.js \
   helpdesk-whatsapp/server/src/routes/
cp integracao/helpdesk-whatsapp/server/src/routes/authHandoff.js \
   helpdesk-whatsapp/server/src/routes/

# AMD2
cp integracao/amd2/api/src/*.php amd2/api/src/
```

### 2. Aplicar patch no server.js do Helpdesk

Abra `helpdesk-whatsapp/server/server.js` e adicione as linhas descritas em
`integracao/helpdesk-whatsapp/server/src/PATCH_server.js`.

Resumo do que adicionar:
```js
const cookieParser     = require('cookie-parser');  // npm install cookie-parser
const authHandoff      = require('./src/routes/authHandoff');
const integracaoAmd2   = require('./src/routes/integracaoAmd2');

app.use(cookieParser());
app.use('/auth',              authHandoff);
app.use('/api/integracao/amd2', integracaoAmd2);
```

Instale a dependência nova:
```bash
cd helpdesk-whatsapp && npm install cookie-parser
```

### 3. Executar migration no banco do Helpdesk

```bash
cd /opt/projetos/infra
docker compose exec helpdesk-db \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" helpdesk_whatsapp \
  < ../helpdesk-whatsapp/database/migration_add_voz.sql
```

### 4. Adicionar variáveis de ambiente

Adicione ao `/opt/projetos/infra/.env`:
```bash
cat integracao/.env.integration >> infra/.env
nano infra/.env  # edite os valores TROQUE_AQUI
```

### 5. Atualizar docker-compose

```bash
# Opção A: usar como override
docker compose -f infra/docker-compose.yml -f integracao/docker-compose.integration.yml up -d

# Opção B: mergear manualmente (recomendado para produção)
# Copie os environment e networks do docker-compose.integration.yml para o docker-compose.yml principal
```

### 6. Atualizar nginx

Adicione o conteúdo de `integracao/nginx_patch_handoff.conf`
dentro do bloco `server {}` em `infra/nginx/conf.d/default.conf`.

### 7. Injetar navMenu.js nos frontends

**Helpdesk** — adicione no `web/index.html` e `web/dashboard.html` antes do `</body>`:
```html
<div id="shared-nav"></div>
<script src="/helpdesk/shared/navMenu.js"></script>
```

**AMD2** — adicione no HTML principal do frontend antes do `</body>`:
```html
<div id="shared-nav"></div>
<script src="/shared/navMenu.js"></script>
```

### 8. Configurar o AMD2 para chamar o hook após classificação

No código PHP do AMD2 que processa o resultado do Asterisk/AMD, adicione:
```php
require_once __DIR__ . '/HelpdeskIntegration.php';

$integracao = new HelpdeskIntegration();
$integracao->enviarChamada([
    'telefone'    => $telefone,
    'resultado'   => $resultadoAmd,   // 'humano', 'secretaria', etc.
    'duracao_seg' => $duracao,
    'ramal'       => $ramal,
    'unique_id'   => $uniqueId,
]);
```

Ou via AGI do Asterisk, adicione no dialplan:
```
exten => h,1,AGI(amd_hook.php,${CALLERID(num)},${AMDSTATUS},${CDR(duration)},${CHANNEL},${UNIQUEID})
```

### 9. Rebuild e subir

```bash
cd /opt/projetos/infra
docker compose build helpdesk-server amd2-api
docker compose up -d
bash scripts/healthcheck.sh
```

---

## Verificação

### Testar login único
```bash
# Login no Helpdesk
TOKEN=$(curl -s -X POST http://localhost/helpdesk/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@helpdesk.local","senha":"SUA_SENHA"}' \
  | jq -r .token)

# Verificar token via AMD2 (PHP chama /verify internamente)
curl -s http://localhost/helpdesk/api/auth/verify \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Testar criação de ticket via AMD2
```bash
curl -s -X POST http://localhost/helpdesk/api/integracao/amd2/chamada \
  -H 'Content-Type: application/json' \
  -H 'x-amd2-key: SEU_AMD2_INTEGRATION_KEY' \
  -d '{
    "telefone":    "5511999990000",
    "resultado":   "humano",
    "duracao_seg": 42,
    "ramal":       "Fila-Vendas",
    "unique_id":   "test-001"
  }' | jq
```

Deve retornar `{ "ok": true, "ticket_id": N, ... }`.

Verifique o ticket no dashboard do Helpdesk: `http://localhost/helpdesk/`

---

## Fluxo completo após a integração

```
Asterisk detecta AMD  →  amd_hook.php  →  HelpdeskIntegration.php
  →  POST /helpdesk/api/integracao/amd2/chamada  (x-amd2-key)
  →  Ticket criado no MySQL do Helpdesk
  →  Agente vê no dashboard com prioridade correta
```

```
Agente faz login no Helpdesk  →  JWT emitido com SHARED_JWT_SECRET
  →  Menu lateral carrega via /helpdesk/api/auth/apps
  →  Agente clica em AMD2  →  /amd2/auth/handoff?token=...
  →  Token gravado no cookie/localStorage do AMD2
  →  AMD2 valida via /helpdesk/api/auth/verify
  →  Agente acessa AMD2 sem novo login
```
