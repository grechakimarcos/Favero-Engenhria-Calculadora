'use strict';
window.App = window.App || {};

/**
 * @module Auth
 * Handles the login screen overlay, session detection, and header user info.
 * Gates the entire application behind Supabase authentication.
 */
App.Auth = (function () {

  let _onLoginSuccess = null; // callback when login succeeds
  let _accountReturnFocus = null;

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
    }

    // O perfil é a fonte de status e permissões. Sem ele, continuar com dados
    // locais permitiria que uma conta inativa contornasse a validação.
    if (!cloudData?.profile) {
      App.UI.toast('Não foi possível validar sua conta. Verifique a conexão e tente novamente.', 'error');
      await App.Supabase.signOut();
      _renderLoginOverlay();
      return;
    }
    
    if (cloudData.profile) {
      // 1. Verifica bloqueio temporário
      if (cloudData.profile.locked_until && new Date(cloudData.profile.locked_until) > new Date()) {
        const lockoutEnd = new Date(cloudData.profile.locked_until).toLocaleTimeString();
        App.UI.toast(`Conta bloqueada por segurança. Tente após ${lockoutEnd}`, 'error');
        await App.Supabase.signOut();
        _renderLoginOverlay();
        return;
      }

      // Contas desativadas não podem manter uma sessão ativa, mesmo quando as
      // credenciais do Supabase ainda forem válidas.
      if (cloudData.profile.status === 'inativo') {
        App.UI.toast('Esta conta está inativa. Fale com um administrador.', 'error');
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
    const chip = document.createElement('button');
    chip.className = 'user-chip';
    chip.id        = 'btn-account-menu';
    chip.type       = 'button';
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
    _accountReturnFocus = document.activeElement;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    panel.removeAttribute('inert');
    overlay.classList.add('visible');
    document.body.classList.add('settings-open'); // reusing this class to lock scroll
    _renderAccountContent();
    requestAnimationFrame(() => document.getElementById('btn-account-close')?.focus());
  }

  function _closeAccountModal() {
    const panel   = document.getElementById('account-panel');
    const overlay = document.getElementById('account-overlay');
    if (!panel || !overlay) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('inert', '');
    overlay.classList.remove('visible');
    document.body.classList.remove('settings-open');
    // Removes any password values from the DOM as soon as the drawer closes.
    document.getElementById('account-panel-body')?.replaceChildren();
    if (_accountReturnFocus && typeof _accountReturnFocus.focus === 'function') {
      _accountReturnFocus.focus();
    }
    _accountReturnFocus = null;
  }

  function _trapAccountFocus(event) {
    const panel = document.getElementById('account-panel');
    if (event.key !== 'Tab' || !panel?.classList.contains('open')) return;
    const focusable = Array.from(panel.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )).filter(element => element.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!panel.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function _setAccountText(container, selector, value) {
    const target = container.querySelector(selector);
    if (target) target.textContent = value;
  }

  function _getInitials(name) {
    const parts = String(name || 'U').trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0] || 'U').slice(0, 2).toUpperCase();
  }

  function _formatAccountDate(value) {
    if (!value) return 'Não informado';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Não informado';
    return date.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function _roleLabel(role) {
    const labels = {
      admin: 'Administrador',
      engenheiro: 'Engenheiro',
      financeiro: 'Financeiro',
      comercial: 'Comercial',
      gestor: 'Gestor',
      visitante: 'Visitante',
    };
    return labels[String(role || '').toLowerCase()] || 'Não informado';
  }

  function _getAccountStatus(profile) {
    if (profile.locked_until && new Date(profile.locked_until) > new Date()) {
      return { key: 'blocked', label: 'Conta bloqueada' };
    }
    if (profile.status === 'inativo') return { key: 'inactive', label: 'Conta inativa' };
    if (profile.must_change_password) return { key: 'pending', label: 'Troca de senha pendente' };
    return { key: 'active', label: 'Conta ativa' };
  }

  function _accountInfoMarkup() {
    return `
      <div class="user-card-current">
        <div class="user-card-avatar" id="account-avatar"></div>
        <div class="user-card-info">
          <span class="user-card-name" id="account-name"></span>
          <span class="user-card-email" id="account-email"></span>
          <span class="user-card-badge" id="account-status"></span>
        </div>
      </div>
      <section class="account-section" aria-labelledby="account-info-title">
        <div class="account-section-header">
          <div>
            <h3 id="account-info-title">Informações da conta</h3>
            <p>Dados vinculados ao seu acesso no sistema.</p>
          </div>
        </div>
        <dl class="account-info-grid">
          <div class="account-info-item"><dt>Perfil de acesso</dt><dd id="account-role"></dd></div>
          <div class="account-info-item"><dt>Empresa</dt><dd id="account-company"></dd></div>
          <div class="account-info-item"><dt>Cargo / função</dt><dd id="account-job"></dd></div>
          <div class="account-info-item"><dt>Telefone</dt><dd id="account-phone"></dd></div>
          <div class="account-info-item account-info-item-wide"><dt>Conta criada em</dt><dd id="account-created"></dd></div>
          <div class="account-info-item account-info-item-wide"><dt>Último acesso</dt><dd id="account-last-access"></dd></div>
          <div class="account-info-item account-info-item-wide"><dt>Última alteração de senha</dt><dd id="account-password-updated"></dd></div>
        </dl>
      </section>
      <div class="account-section-divider"><span>Segurança</span></div>`;
  }

  function _passwordToggleMarkup(id, label) {
    return `<button type="button" class="btn-toggle-pwd" id="${id}" aria-label="${label}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
      </svg>
    </button>`;
  }

  function _accountSecurityMarkup() {
    return `
      <section class="account-section account-security-section" aria-labelledby="account-security-title">
        <div class="account-section-header">
          <div>
            <h3 id="account-security-title">Redefinir senha</h3>
            <p>Confirme sua senha atual antes de criar uma nova.</p>
          </div>
        </div>
        <form class="account-password-form" id="account-password-form" novalidate>
          <div class="form-group">
            <label for="account-current-password">Senha atual</label>
            <div class="account-password-field">
              <input type="password" id="account-current-password" placeholder="Digite sua senha atual" autocomplete="current-password" required />
              ${_passwordToggleMarkup('toggle-account-current', 'Mostrar senha atual')}
            </div>
          </div>
          <div class="form-group">
            <label for="account-new-password">Nova senha</label>
            <div class="account-password-field">
              <input type="password" id="account-new-password" placeholder="Crie uma senha segura" autocomplete="new-password" required minlength="8" maxlength="128" />
              ${_passwordToggleMarkup('toggle-account-new', 'Mostrar nova senha')}
            </div>
            <div class="account-pwd-strength" aria-hidden="true"><div class="account-pwd-strength-fill" id="account-pwd-strength-fill"></div></div>
            <span class="account-pwd-strength-label" id="account-pwd-strength-label"></span>
            <span class="account-password-requirements">Use 8 ou mais caracteres, com maiúscula, minúscula, número e símbolo.</span>
          </div>
          <div class="form-group">
            <label for="account-confirm-password">Confirmar nova senha</label>
            <div class="account-password-field">
              <input type="password" id="account-confirm-password" placeholder="Repita a nova senha" autocomplete="new-password" required maxlength="128" />
              ${_passwordToggleMarkup('toggle-account-confirm', 'Mostrar confirmação da senha')}
            </div>
          </div>
          <div id="account-password-feedback" class="account-password-feedback" role="status" aria-live="polite"></div>
          <button id="btn-account-password" type="submit" class="btn btn-primary account-password-submit">Redefinir senha</button>
        </form>
      </section>`;
  }

  function _renderAccountContent() {
    const el = document.getElementById('account-panel-body');
    if (!el) return;

    const userInfo = App.Supabase.getUserInfo() || {};
    const profile  = App.Supabase.getProfile() || {};
    const name     = profile.nome_completo || userInfo.name || 'Usuário';
    const status   = _getAccountStatus(profile);

    // Only static markup is inserted. Account values are assigned with
    // textContent below so editable profile data can never become HTML.
    el.innerHTML = _accountInfoMarkup() + _accountSecurityMarkup();
    _setAccountText(el, '#account-avatar', _getInitials(name));
    _setAccountText(el, '#account-name', name);
    _setAccountText(el, '#account-email', userInfo.email || 'E-mail não informado');
    _setAccountText(el, '#account-status', status.label);
    el.querySelector('#account-status')?.setAttribute('data-status', status.key);
    _setAccountText(el, '#account-role', _roleLabel(profile.role));
    _setAccountText(el, '#account-company', profile.empresa || 'Não informado');
    _setAccountText(el, '#account-job', profile.cargo || 'Não informado');
    _setAccountText(el, '#account-phone', profile.telefone || 'Não informado');
    _setAccountText(el, '#account-created', _formatAccountDate(userInfo.createdAt || profile.created_at));
    _setAccountText(el, '#account-last-access', _formatAccountDate(profile.last_login_at || userInfo.lastSignInAt));
    _setAccountText(el, '#account-password-updated', profile.password_changed_at
      ? _formatAccountDate(profile.password_changed_at)
      : 'Ainda não registrada');

    _bindAccountEvents(el);
  }

  function _bindAccountEvents(container) {
    const pwdInput = container.querySelector('#account-new-password');
    const fill     = container.querySelector('#account-pwd-strength-fill');
    const label    = container.querySelector('#account-pwd-strength-label');

    pwdInput?.addEventListener('input', () => {
      const levels = [
        { pct: 0, color: '', text: '' },
        { pct: 25, color: '#EF4444', text: 'Muito fraca' },
        { pct: 50, color: '#F59E0B', text: 'Fraca' },
        { pct: 75, color: '#3B82F6', text: 'Boa' },
        { pct: 100, color: '#10B981', text: 'Forte' },
      ];
      const level = levels[_pwdScore(pwdInput.value)];
      if (fill) {
        fill.style.width = level.pct + '%';
        fill.style.background = level.color;
      }
      if (label) {
        label.textContent = level.text;
        label.style.color = level.color;
      }
    });

    _bindToggle(container, '#toggle-account-current', '#account-current-password');
    _bindToggle(container, '#toggle-account-new', '#account-new-password');
    _bindToggle(container, '#toggle-account-confirm', '#account-confirm-password');
    container.querySelector('#account-password-form')?.addEventListener('submit', _handleAccountPasswordChange);
  }


  function _bindToggle(container, btnSel, inputSel) {
    const btn   = container.querySelector(btnSel);
    const input = container.querySelector(inputSel);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      const baseLabel = (btn.getAttribute('aria-label') || 'senha')
        .replace(/^Mostrar\s+/i, '')
        .replace(/^Ocultar\s+/i, '');
      btn.setAttribute('aria-label', `${isText ? 'Mostrar' : 'Ocultar'} ${baseLabel}`);
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

  function _isStrongAccountPassword(password) {
    return password.length >= 8
      && /[A-Z]/.test(password)
      && /[a-z]/.test(password)
      && /\d/.test(password)
      && /[^A-Za-z0-9]/.test(password);
  }

  function _setAccountPasswordFeedback(message, type = '') {
    const feedback = document.getElementById('account-password-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.className = `account-password-feedback${type ? ` ${type}` : ''}`;
    feedback.style.display = message ? 'block' : 'none';
  }

  function _passwordChangeErrorMessage(error, reason) {
    const message = String(error?.message || '').toLowerCase();
    if (reason === 'invalid_current_password' || message.includes('invalid login credentials')) {
      return 'A senha atual está incorreta.';
    }
    if (message.includes('different from the old password') || message.includes('same password')) {
      return 'A nova senha precisa ser diferente da senha atual.';
    }
    if (reason === 'rate_limited') {
      return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
    }
    if (reason === 'reauthentication_failed') {
      return 'Não foi possível confirmar sua senha agora. Verifique a conexão e tente novamente.';
    }
    if (reason === 'account_mismatch') {
      return 'Não foi possível confirmar a conta atual. Saia e entre novamente.';
    }
    if (reason === 'not_authenticated') {
      return 'Sua sessão expirou. Entre novamente para alterar a senha.';
    }
    return 'Não foi possível redefinir a senha. Tente novamente.';
  }

  async function _handleAccountPasswordChange(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const currentPassword = form.querySelector('#account-current-password')?.value || '';
    const newPassword     = form.querySelector('#account-new-password')?.value || '';
    const confirmation    = form.querySelector('#account-confirm-password')?.value || '';
    const button          = form.querySelector('#btn-account-password');

    _setAccountPasswordFeedback('');
    if (!currentPassword) {
      _setAccountPasswordFeedback('Digite sua senha atual.', 'error');
      return;
    }
    if (!_isStrongAccountPassword(newPassword)) {
      _setAccountPasswordFeedback('A nova senha não atende aos requisitos de segurança.', 'error');
      return;
    }
    if (newPassword !== confirmation) {
      _setAccountPasswordFeedback('A confirmação não corresponde à nova senha.', 'error');
      return;
    }
    if (newPassword === currentPassword) {
      _setAccountPasswordFeedback('A nova senha precisa ser diferente da senha atual.', 'error');
      return;
    }

    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Redefinindo…';

    try {
      const { error, reason, profileError } = await App.Supabase.changePassword(currentPassword, newPassword);
      if (error) {
        const errorMessage = _passwordChangeErrorMessage(error, reason);
        if (document.getElementById('account-panel')?.classList.contains('open')) {
          _setAccountPasswordFeedback(errorMessage, 'error');
        } else {
          App.UI.toast(errorMessage, 'error');
        }
        return;
      }

      const accountPanelOpen = document.getElementById('account-panel')?.classList.contains('open');
      if (accountPanelOpen) _renderAccountContent();
      if (profileError) {
        if (accountPanelOpen) {
          _setAccountPasswordFeedback(
            'Senha alterada, mas o histórico da conta não pôde ser atualizado. A nova senha já está valendo.',
            'warning'
          );
        }
        App.UI.toast('Senha alterada; houve uma falha ao atualizar o histórico.', 'warning');
      } else {
        if (accountPanelOpen) _setAccountPasswordFeedback('Senha redefinida com sucesso.', 'success');
        App.UI.toast('Senha redefinida com sucesso!', 'success');
      }
      if (accountPanelOpen) document.getElementById('btn-account-close')?.focus();
    } catch (error) {
      console.error('[Auth] Falha inesperada ao redefinir senha:', error);
      const message = 'Não foi possível redefinir a senha. Verifique sua conexão.';
      if (document.getElementById('account-panel')?.classList.contains('open')) {
        _setAccountPasswordFeedback(message, 'error');
      } else {
        App.UI.toast(message, 'error');
      }
    } finally {
      button.disabled = false;
      button.textContent = 'Redefinir senha';
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
      _trapAccountFocus(e);
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
        const hasNumber = /\d/.test(pwd);
        const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
        
        if (pwd.length < 8 || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
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
