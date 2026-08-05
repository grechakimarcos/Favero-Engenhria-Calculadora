'use strict';
window.App = window.App || {};

/**
 * @module Auth
 * Handles the login screen overlay, session detection, and header user info.
 * Gates the entire application behind Supabase authentication.
 */
App.Auth = (function () {

  let _onLoginSuccess = null; // callback when login succeeds

  // ── Render Login Overlay ──────────────────────────────────────────────────────
  function _renderLoginOverlay() {
    const overlay = document.getElementById('login-overlay');
    if (!overlay) return;
    overlay.classList.add('visible');
    document.body.classList.add('auth-locked');

    // Focus email after animation
    setTimeout(() => {
      const emailInput = document.getElementById('login-email');
      if (emailInput) emailInput.focus();
    }, 400);
  }

  function _hideLoginOverlay() {
    const overlay = document.getElementById('login-overlay');
    if (!overlay) return;
    overlay.classList.add('hiding');
    setTimeout(() => {
      overlay.classList.remove('visible', 'hiding');
      document.body.classList.remove('auth-locked');
    }, 500);
  }

  // ── Handle Login Form Submit ──────────────────────────────────────────────────
  async function _handleLogin(e) {
    e.preventDefault();
    const email    = document.getElementById('login-email')?.value?.trim();
    const password = document.getElementById('login-password')?.value;
    const errorEl  = document.getElementById('login-error');
    const btn      = document.getElementById('btn-login');

    if (!email || !password) {
      _showError('Preencha e-mail e senha.');
      return;
    }

    // Loading state
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Entrando…';
    if (errorEl) errorEl.textContent = '';

    const { user, error } = await App.Supabase.signIn(email, password);

    btn.disabled = false;
    btn.innerHTML = 'Entrar';

    if (error || !user) {
      _showError(error?.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos.'
        : (error?.message || 'Erro ao fazer login. Tente novamente.'));
      return;
    }

    // Success
    _hideLoginOverlay();
    await _postLogin(user);
  }

  function _showError(msg) {
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.add('shake');
      setTimeout(() => errorEl.classList.remove('shake'), 600);
    }
  }

  // ── Post Login: Load cloud data ───────────────────────────────────────────────
  async function _postLogin(user) {
    let cloudData;
    try {
      cloudData = await App.Supabase.loadAllFromCloud();
    } catch (err) {
      console.error('[Auth] Falha ao carregar dados da nuvem:', err);
      App.UI.toast('Erro ao carregar dados. Verifique sua conexão e recarregue a página.', 'error');
      // Continua com dados locais (do localStorage via Store)
    }
    
    if (cloudData && cloudData.profile) {
      // 1. Verifica bloqueio temporário
      if (cloudData.profile.locked_until && new Date(cloudData.profile.locked_until) > new Date()) {
        const lockoutEnd = new Date(cloudData.profile.locked_until).toLocaleTimeString();
        App.UI.toast(`Conta bloqueada por segurança. Tente após ${lockoutEnd}`, 'error');
        await App.Supabase.signOut();
        _renderLoginOverlay();
        return;
      }
      
      // 2. Verifica obrigatoriedade de troca de senha (Primeiro Acesso)
      if (cloudData.profile.must_change_password) {
        document.getElementById('force-password-overlay').style.display = 'flex';
        // Não continua o fluxo normal ainda
        return;
      }
    }

    _updateHeader(user);

    if (cloudData) {
      _applyCloudData(cloudData);
    }

    if (typeof _onLoginSuccess === 'function') {
      _onLoginSuccess(user);
    }

    App.UI.toast(`Bem-vindo, ${user.email.split('@')[0]}!`, 'success');
  }

  // ── Apply Cloud Data to Store ─────────────────────────────────────────────────
  // Função centralizada para evitar duplicação entre _postLogin e force-password flow
  function _applyCloudData(cloudData) {
    if (!cloudData) return;
    const patch = {};
    if (cloudData.collaborators) patch.collaborators = cloudData.collaborators;
    if (cloudData.indirectCosts) patch.indirectCosts = cloudData.indirectCosts;
    if (cloudData.disciplinas)   patch.disciplinas   = cloudData.disciplinas;
    if (cloudData.history)       patch.history       = cloudData.history;
    if (cloudData.profile)       patch.profile       = cloudData.profile;
    if (cloudData.settings)      patch.settings      = {
      metaMensal:          cloudData.settings.meta_mensal,
      impostoSimples:      cloudData.settings.imposto_simples,
      multiplicadorMinimo: cloudData.settings.multiplicador_minimo,
    };
    if (Object.keys(patch).length > 0) {
      App.Store.setState(patch);
    }
    _applyPermissions(cloudData.profile);
  }

  // ── Role Based Access Control (RBAC) ─────────────────────────────────────────
  function _applyPermissions(profile) {
    console.debug('[RBAC] Perfil carregado:', profile?.role || 'visitante');
    const role = profile?.role || 'visitante';
    const isAdmin = role === 'admin';
    
    // Mostra/Oculta menu de Gestão de Usuários e Parâmetros
    const menuUsuarios  = document.getElementById('menu-usuarios');
    const menuParametros = document.getElementById('menu-parametros');
    
    if (menuUsuarios)   menuUsuarios.style.display  = isAdmin ? 'flex' : 'none';
    if (menuParametros) menuParametros.style.display = isAdmin ? 'flex' : 'none';

    // Guard de segurança: se a view ativa for restrita e o usuário não for admin,
    // redireciona para a calculadora sem alterar o comportamento visível para admins.
    const currentView = document.querySelector('.view.active')?.id;
    if (!isAdmin && (currentView === 'view-usuarios' || currentView === 'view-parametros')) {
      console.debug('[RBAC] Acesso negado à view restrita. Redirecionando para calculadora.');
      if (App.Router && typeof App.Router.navigate === 'function') {
        App.Router.navigate('calculator');
      }
    }
  }

  // ── Update Header with User Info ──────────────────────────────────────────────
  // Usa criação segura de elementos DOM para evitar XSS com dados do banco.
  function _updateHeader(user) {
    const container = document.getElementById('user-info-container');
    if (!container) return;

    // Dados de texto: usar textContent (nunca innerHTML com valores externos)
    const name     = (user.email || '').split('@')[0];
    const initials = name.slice(0, 2).toUpperCase();
    const profile  = App.Supabase.getProfile();
    const role     = profile?.role || '';

    // Construir DOM de forma segura
    const chip = document.createElement('div');
    chip.className = 'user-chip';
    chip.id        = 'btn-account-menu';
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.title     = 'Minha Conta';

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'user-avatar';
    avatarDiv.textContent = initials;  // seguro: só texto

    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'display:flex;flex-direction:column;';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'user-name';
    nameSpan.textContent = name;  // seguro: só texto
    infoDiv.appendChild(nameSpan);

    if (role) {
      const roleSpan = document.createElement('span');
      roleSpan.style.cssText = 'font-size:0.65rem;background:var(--primary-dim);color:var(--primary);padding:2px 6px;border-radius:4px;margin-top:2px;text-transform:uppercase;';
      roleSpan.textContent = role;  // seguro: só texto
      infoDiv.appendChild(roleSpan);
    }

    chip.appendChild(avatarDiv);
    chip.appendChild(infoDiv);

    container.innerHTML = '';
    container.appendChild(chip);

    chip.addEventListener('click', _openAccountModal);
  }

  // ── Account Modal & User Management ───────────────────────────────────────────
  function _openAccountModal() {
    const panel   = document.getElementById('account-panel');
    const overlay = document.getElementById('account-overlay');
    if (!panel || !overlay) return;
    panel.classList.add('open');
    overlay.classList.add('visible');
    document.body.classList.add('settings-open'); // reusing this class to lock scroll
    _renderAccountContent();
  }

  function _closeAccountModal() {
    const panel   = document.getElementById('account-panel');
    const overlay = document.getElementById('account-overlay');
    if (!panel || !overlay) return;
    panel.classList.remove('open');
    overlay.classList.remove('visible');
    document.body.classList.remove('settings-open');
  }

  function _renderAccountContent() {
    const el = document.getElementById('account-panel-body');
    if (!el) return;

    const userInfo = App.Supabase.getUserInfo();

    el.innerHTML = `
      <!-- Current user info -->
      <div class="user-card-current">
        <div class="user-card-avatar">${(userInfo?.name || 'U').slice(0,2).toUpperCase()}</div>
        <div class="user-card-info">
          <span class="user-card-name">${userInfo?.name || '—'}</span>
          <span class="user-card-email">${userInfo?.email || '—'}</span>
          <span class="user-card-badge">Conta ativa</span>
        </div>
      </div>

      <div class="user-create-divider">
        <span>Convidar novo usuário</span>
      </div>

      <p class="settings-hint">
        Crie um acesso para um novo membro da equipe. Eles poderão fazer login com
        as credenciais abaixo e terão seus próprios dados isolados na nuvem.
      </p>

      <div class="user-create-form" id="form-create-user">
        <div class="form-group">
          <label for="new-user-name">Nome <span class="label-hint">— opcional</span></label>
          <input type="text" id="new-user-name" placeholder="Ex: Adriel Silva" maxlength="60" />
        </div>
        <div class="form-group">
          <label for="new-user-email">E-mail *</label>
          <input type="email" id="new-user-email" placeholder="email@faveroeng.com.br" required />
        </div>
        <div class="form-group">
          <label for="new-user-password">Senha *</label>
          <div class="password-wrapper">
            <input type="password" id="new-user-password" placeholder="Mínimo 8 caracteres" required minlength="8" />
            <button type="button" class="btn-toggle-pwd" id="toggle-new-pwd" aria-label="Mostrar senha">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <div class="pwd-strength-bar" id="pwd-strength-bar">
            <div class="pwd-strength-fill" id="pwd-strength-fill"></div>
          </div>
          <span class="pwd-strength-label" id="pwd-strength-label"></span>
        </div>
        <div class="form-group">
          <label for="new-user-confirm">Confirmar Senha *</label>
          <div class="password-wrapper">
            <input type="password" id="new-user-confirm" placeholder="Repita a senha" required />
            <button type="button" class="btn-toggle-pwd" id="toggle-confirm-pwd" aria-label="Mostrar senha">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>

        <div id="create-user-feedback" class="create-user-feedback"></div>

        <button id="btn-create-user" class="btn btn-primary" style="width:100%;justify-content:center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Criar Usuário
        </button>

        <p class="settings-hint" style="margin-top:.75rem;font-size:.74rem">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px; color: var(--warning);"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          Para acesso imediato sem e-mail de confirmação, desative
          <strong>Email confirmations</strong> em Supabase Dashboard → Authentication → Email.
        </p>
      </div>`;

    _bindUserFormEvents(el);
  }

  function _bindUserFormEvents(container) {
    // Password strength meter
    const pwdInput = container.querySelector('#new-user-password');
    const fill     = container.querySelector('#pwd-strength-fill');
    const label    = container.querySelector('#pwd-strength-label');

    pwdInput?.addEventListener('input', () => {
      const val = pwdInput.value;
      const score = _pwdScore(val);
      const levels = [
        { pct: 0,   color: '',            text: '' },
        { pct: 25,  color: '#EF4444',     text: 'Muito fraca' },
        { pct: 50,  color: '#F59E0B',     text: 'Fraca' },
        { pct: 75,  color: '#3B82F6',     text: 'Boa' },
        { pct: 100, color: '#10B981',     text: 'Forte' },
      ];
      const lvl = levels[score];
      if (fill)  { fill.style.width = lvl.pct + '%'; fill.style.background = lvl.color; }
      if (label) { label.textContent = lvl.text; label.style.color = lvl.color; }
    });

    // Toggle password visibility buttons
    _bindToggle(container, '#toggle-new-pwd',     '#new-user-password');
    _bindToggle(container, '#toggle-confirm-pwd', '#new-user-confirm');

    // Create user button
    container.querySelector('#btn-create-user')?.addEventListener('click', _handleCreateUser);
  }

  function _bindToggle(container, btnSel, inputSel) {
    const btn   = container.querySelector(btnSel);
    const input = container.querySelector(inputSel);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.innerHTML = isText
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    });
  }

  function _pwdScore(pwd) {
    if (!pwd || pwd.length < 6) return pwd.length > 0 ? 1 : 0;
    let score = 0;
    if (pwd.length >= 8)                         score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd))                       score++;
    if (/[^A-Za-z0-9]/.test(pwd))               score++;
    return Math.min(score, 4);
  }

  function _setFeedback(msg, type) {
    const el = document.getElementById('create-user-feedback');
    if (!el) return;
    el.textContent  = msg;
    el.className    = `create-user-feedback ${type}`;
    el.style.display = msg ? 'block' : 'none';
  }

  async function _handleCreateUser() {
    const name    = document.getElementById('new-user-name')?.value.trim() || '';
    const email   = document.getElementById('new-user-email')?.value.trim() || '';
    const pwd     = document.getElementById('new-user-password')?.value || '';
    const confirm = document.getElementById('new-user-confirm')?.value || '';
    const btn     = document.getElementById('btn-create-user');

    _setFeedback('', '');

    // Validation
    if (!email) { _setFeedback('Preencha o e-mail.', 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { _setFeedback('E-mail inválido.', 'error'); return; }
    if (pwd.length < 8) { _setFeedback('A senha deve ter no mínimo 8 caracteres.', 'error'); return; }
    if (pwd !== confirm) { _setFeedback('As senhas não coincidem.', 'error'); return; }

    // Loading
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Criando usuário…';

    const { user, error } = await App.Supabase.signUp(email, pwd, name || undefined);

    btn.disabled = false;
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Criar Usuário';

    if (error) {
      const msg = error.message.includes('already registered')
        ? 'Este e-mail já possui uma conta.'
        : `Erro: ${error.message}`;
      _setFeedback(msg, 'error');
      return;
    }

    if (user) {
      _setFeedback(`Usuário "${email}" criado com sucesso! Ele já pode fazer login.`, 'success');
      // Clear form
      document.getElementById('new-user-name').value    = '';
      document.getElementById('new-user-email').value   = '';
      document.getElementById('new-user-password').value = '';
      document.getElementById('new-user-confirm').value = '';
      const fill  = document.getElementById('pwd-strength-fill');
      const label = document.getElementById('pwd-strength-label');
      if (fill)  fill.style.width = '0';
      if (label) label.textContent = '';
    } else {
      // Supabase returns null user when email confirmation is required
      _setFeedback(`Conta criada! Um e-mail de confirmação foi enviado para "${email}".`, 'info');
    }
  }

  // ── Handle Logout ─────────────────────────────────────────────────────────────
  async function _handleLogout() {
    if (!confirm('Deseja sair da sua conta?')) return;
    await App.Supabase.signOut();
    // Clear user chip
    const container = document.getElementById('user-info-container');
    if (container) container.innerHTML = '';
    _renderLoginOverlay();
  }

  // ── Toggle Password Visibility ────────────────────────────────────────────────
  function _bindPasswordToggle() {
    const toggle = document.getElementById('toggle-password');
    const input  = document.getElementById('login-password');
    if (!toggle || !input) return;
    toggle.addEventListener('click', () => {
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      toggle.setAttribute('aria-label', isText ? 'Mostrar senha' : 'Ocultar senha');
      toggle.innerHTML = isText
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    });
  }

  // ── Initialize ────────────────────────────────────────────────────────────────
  /**
   * @param {function} onSuccess - Called when user is authenticated (new or existing session)
   */
  async function init(onSuccess) {
    _onLoginSuccess = onSuccess;

    // Bind login form
    const form = document.getElementById('login-form');
    if (form) form.addEventListener('submit', _handleLogin);
    _bindPasswordToggle();

    // Bind Account Modal generic events
    document.getElementById('btn-account-close')?.addEventListener('click', _closeAccountModal);
    document.getElementById('account-overlay')?.addEventListener('click', _closeAccountModal);
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      _closeAccountModal();
      _handleLogout();
    });
    document.getElementById('btn-logout-sidebar')?.addEventListener('click', () => {
      _handleLogout();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('account-panel')?.classList.contains('open')) {
        _closeAccountModal();
      }
    });

    // Forgot Password Flow
    const linkForgot = document.getElementById('link-forgot-password');
    const containerReset = document.getElementById('reset-password-container');
    const btnSendReset = document.getElementById('btn-send-reset');
    
    if (linkForgot && containerReset) {
      linkForgot.addEventListener('click', (e) => {
        e.preventDefault();
        containerReset.style.display = containerReset.style.display === 'none' ? 'block' : 'none';
      });
    }

    if (btnSendReset) {
      btnSendReset.addEventListener('click', async () => {
        const emailReset = document.getElementById('reset-email').value;
        const feedback = document.getElementById('reset-feedback');
        if (!emailReset) {
          feedback.style.color = 'var(--danger)';
          feedback.textContent = 'Digite seu e-mail.';
          return;
        }
        btnSendReset.disabled = true;
        btnSendReset.textContent = 'Enviando...';
        const { error } = await App.Supabase.sendPasswordResetEmail(emailReset);
        btnSendReset.textContent = 'Enviar e-mail de recuperação';
        if (error) {
          feedback.style.color = 'var(--danger)';
          feedback.textContent = 'Erro ao enviar. Tente novamente.';
          btnSendReset.disabled = false;
        } else {
          feedback.style.color = 'var(--success)';
          feedback.textContent = 'E-mail de recuperação enviado com sucesso!';
        }
      });
    }

    // Force Password Flow
    const forcePasswordForm = document.getElementById('force-password-form');
    if (forcePasswordForm) {
      forcePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pwd = document.getElementById('fp-new-password').value;
        const confirmPwd = document.getElementById('fp-confirm-password').value;
        const err = document.getElementById('fp-error');
        const btn = document.getElementById('btn-force-password');

        err.textContent = '';
        if (pwd !== confirmPwd) {
          err.textContent = 'As senhas não coincidem.';
          return;
        }
        
        // Regex de senha forte
        const hasUpper = /[A-Z]/.test(pwd);
        const hasLower = /[a-z]/.test(pwd);
        const hasNumSpec = /[\d\W]/.test(pwd);
        
        if (pwd.length < 8 || !hasUpper || !hasLower || !hasNumSpec) {
          err.textContent = 'A senha não atende aos requisitos mínimos de segurança.';
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';
        
        const { error } = await App.Supabase.updatePassword(pwd);
        if (error) {
          err.textContent = 'Erro ao atualizar a senha: ' + error.message;
          btn.disabled = false;
          btn.innerHTML = 'Salvar Nova Senha e Entrar';
          return;
        }

        document.getElementById('force-password-overlay').style.display = 'none';
        App.UI.toast('Senha alterada com sucesso!', 'success');
        
        // Retoma o login usando a função centralizada _applyCloudData (evita duplicação)
        const user = App.Supabase.getCurrentUser();
        _updateHeader(user);
        try {
          const cloudData = await App.Supabase.loadAllFromCloud();
          _applyCloudData(cloudData);
        } catch (err) {
          console.error('[Auth] Falha ao recarregar dados após troca de senha:', err);
          App.UI.toast('Dados carregados parcialmente. Recarregue a página se necessário.', 'error');
        }
        if (typeof _onLoginSuccess === 'function') _onLoginSuccess(user);
      });
    }

    // Check for existing session
    const existingUser = await App.Supabase.getSession();
    if (existingUser) {
      // Already logged in — silently load data
      await _postLogin(existingUser);
    } else {
      // No session — show login screen
      _renderLoginOverlay();
    }
  }

  return { init };
})();
