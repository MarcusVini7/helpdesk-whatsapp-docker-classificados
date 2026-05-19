/**
 * shared/navMenu.js
 *
 * Menu de navegação compartilhado entre Helpdesk e AMD2.
 * Injete este script nos dois frontends (via <script src="..."> ou bundler).
 *
 * Funcionalidade:
 *   - Lê o token JWT do localStorage (onde cada sistema o salva após login)
 *   - Chama GET /helpdesk/api/auth/apps para obter os sistemas disponíveis
 *   - Renderiza um menu lateral com links para cada sistema
 *   - Destaca o sistema atual como ativo
 *   - Mantém o token ao navegar entre sistemas (cookie compartilhado)
 *
 * Como usar no Helpdesk (HTML puro):
 *   <script src="/helpdesk/shared/navMenu.js"></script>
 *   <div id="shared-nav"></div>
 *
 * Como usar no AMD2 (PHP):
 *   <script src="/amd2/shared/navMenu.js"></script>
 *   <div id="shared-nav"></div>
 */

(function () {
  'use strict';

  // Detecta em qual sistema estamos
  const PATH = window.location.pathname;
  const SISTEMA_ATUAL = PATH.startsWith('/amd2') ? 'amd2' : 'helpdesk';

  // Token: tenta localStorage, depois cookie
  function getToken() {
    return (
      localStorage.getItem('token') ||
      localStorage.getItem('helpdesk_token') ||
      localStorage.getItem('amd2_token') ||
      getCookie('token') ||
      null
    );
  }

  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Ao navegar para outro sistema, passa o token como query param (rota de handoff)
  function buildLink(app) {
    const token = getToken();
    if (!token || app.id === SISTEMA_ATUAL) return app.url;
    // /helpdesk/auth/handoff?token=... ou /amd2/auth/handoff?token=...
    return `${app.url}auth/handoff?token=${encodeURIComponent(token)}`;
  }

  // Ícones simples por id
  const ICONES = {
    helpdesk: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
               </svg>`,
    amd2:     `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13
                          a19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72
                          c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91
                          a16 16 0 0 0 6.1 6.1l1.27-.91a2 2 0 0 1 2.11-.45
                          c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
               </svg>`,
  };

  function renderMenu(apps) {
    const container = document.getElementById('shared-nav');
    if (!container) {
      console.warn('[navMenu] Elemento #shared-nav não encontrado.');
      return;
    }

    const style = `
      #shared-nav-inner {
        position: fixed;
        top: 0; left: 0;
        width: 56px;
        height: 100vh;
        background: #1a1f2e;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px 0;
        z-index: 1000;
        box-shadow: 2px 0 8px rgba(0,0,0,0.3);
        gap: 4px;
      }
      #shared-nav-inner .nav-logo {
        width: 36px; height: 36px;
        border-radius: 8px;
        background: #3b82f6;
        display: flex; align-items: center; justify-content: center;
        color: white; font-weight: 700; font-size: 14px;
        margin-bottom: 12px;
        flex-shrink: 0;
      }
      #shared-nav-inner .nav-item {
        width: 40px; height: 40px;
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        color: #9ca3af;
        text-decoration: none;
        transition: background 0.15s, color 0.15s;
        position: relative;
      }
      #shared-nav-inner .nav-item:hover { background: #2d3748; color: #fff; }
      #shared-nav-inner .nav-item.ativo  { background: #3b82f6; color: #fff; }
      #shared-nav-inner .nav-item .tooltip {
        position: absolute;
        left: 52px;
        background: #1a1f2e;
        color: #fff;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 12px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s;
        border: 1px solid #374151;
      }
      #shared-nav-inner .nav-item:hover .tooltip { opacity: 1; }
      /* Empurra o conteúdo da página para a direita */
      body { padding-left: 56px !important; }
    `;

    const items = apps.map(app => `
      <a href="${buildLink(app)}"
         class="nav-item ${app.id === SISTEMA_ATUAL ? 'ativo' : ''}"
         title="${app.nome}"
         aria-label="${app.nome}">
        ${ICONES[app.id] || '●'}
        <span class="tooltip">${app.nome}</span>
      </a>
    `).join('');

    container.innerHTML = `
      <style>${style}</style>
      <nav id="shared-nav-inner" role="navigation" aria-label="Navegação entre sistemas">
        <div class="nav-logo" aria-hidden="true">H</div>
        ${items}
      </nav>
    `;
  }

  function init() {
    const token = getToken();
    if (!token) {
      // Sem token — não renderiza menu (usuário não está logado)
      return;
    }

    // Busca lista de apps no Helpdesk
    fetch('/helpdesk/api/auth/apps', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.apps) renderMenu(data.apps);
      })
      .catch(err => console.warn('[navMenu] Não foi possível carregar menu:', err));
  }

  // Aguarda o DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
