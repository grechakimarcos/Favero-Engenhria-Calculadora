'use strict';
window.App = window.App || {};

App.UsersUI = (function () {
  const tbodyId = 'users-table-body';

  let _allProfiles = [];
  let _filteredProfiles = [];
  let currentPage = 1;
  let itemsPerPage = 10;
  let _editReturnFocus = null;
  let _newUserReturnFocus = null;

  const ROLES = ['admin', 'gestor', 'engenheiro', 'financeiro', 'comercial', 'visitante'];
  const STATUSES = ['ativo', 'inativo', 'bloqueado', 'pendente'];
  const ACCESS_ITEMS = [
    { id: 'calculator', label: 'Calculadora de orçamentos' },
    { id: 'financial', label: 'Custos, margens e PDF técnico' },
    { id: 'client_pdf', label: 'PDF comercial para cliente' },
    { id: 'own_history', label: 'Próprio histórico de projetos' },
    { id: 'team_history', label: 'Histórico de toda a equipe' },
    { id: 'settings', label: 'Parâmetros gerais do escritório' },
    { id: 'users', label: 'Gestão de usuários e permissões' },
  ];
  const OPERATIONAL_ACCESS = ['calculator', 'financial', 'client_pdf', 'own_history'];
  const ROLE_INFO = Object.freeze({
    admin: {
      label: 'Administrador',
      description: 'Acesso administrativo completo, incluindo usuários, parâmetros e todos os históricos.',
      access: ACCESS_ITEMS.map(item => item.id),
    },
    gestor: {
      label: 'Gestor',
      description: 'Acesso operacional padrão. Atualmente não possui privilégios administrativos adicionais.',
      access: OPERATIONAL_ACCESS,
    },
    engenheiro: {
      label: 'Engenheiro',
      description: 'Calculadora, documentos em PDF e gerenciamento do próprio histórico.',
      access: OPERATIONAL_ACCESS,
    },
    financeiro: {
      label: 'Financeiro',
      description: 'Acesso operacional aos cálculos financeiros, PDFs e ao próprio histórico.',
      access: OPERATIONAL_ACCESS,
    },
    comercial: {
      label: 'Comercial',
      description: 'Acesso operacional à calculadora, PDFs e ao próprio histórico, incluindo os dados internos do cálculo.',
      access: OPERATIONAL_ACCESS,
    },
    visitante: {
      label: 'Visitante',
      description: 'Acesso operacional atual; não é somente leitura e permite gerenciar o próprio histórico.',
      access: OPERATIONAL_ACCESS,
    },
  });

  function getRoleDefinition(role) {
    const normalized = ROLES.includes(String(role || '').toLowerCase())
      ? String(role).toLowerCase()
      : 'visitante';
    const info = ROLE_INFO[normalized];
    return {
      id: normalized,
      label: info.label,
      description: info.description,
      permissions: ACCESS_ITEMS.map(item => ({ ...item, allowed: info.access.includes(item.id) })),
    };
  }

  function getComputedStatus(profile) {
    if (profile?.status === 'inativo') return 'inativo';
    if (profile?.locked_until && new Date(profile.locked_until) > new Date()) return 'bloqueado';
    if (profile?.must_change_password) return 'pendente';
    return 'ativo';
  }

  function _escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function _trapModalFocus(event, overlay) {
    if (event.key !== 'Tab' || !overlay?.classList.contains('visible')) return;
    const modal = overlay.querySelector('.modern-modal');
    if (!modal) return;
    const focusable = Array.from(modal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex=-1])'
    )).filter(element => element.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!modal.contains(document.activeElement)) {
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

  function _renderPermissionMatrix() {
    const container = document.getElementById('users-permissions-matrix');
    if (!container) return;
    const definitions = ROLES.map(getRoleDefinition);
    container.innerHTML = `
      <table class="permissions-matrix-table">
        <thead><tr><th scope="col">Recurso</th>${definitions.map(role => `<th scope="col"><span class="badge badge-role-${role.id}">${role.label}</span></th>`).join('')}</tr></thead>
        <tbody>${ACCESS_ITEMS.map(item => `
          <tr>
            <th scope="row">${item.label}</th>
            ${definitions.map(role => {
              const allowed = role.permissions.find(permission => permission.id === item.id)?.allowed;
              return `<td><span class="permission-state ${allowed ? 'allowed' : 'denied'}" aria-label="${allowed ? 'Permitido' : 'Sem acesso'}">${allowed ? '✓' : '—'}</span></td>`;
            }).join('')}
          </tr>`).join('')}</tbody>
      </table>`;
    const note = document.getElementById('users-permissions-note');
    if (note) {
      note.textContent = 'Permissões atuais: os cinco perfis não administrativos compartilham o mesmo acesso operacional. Somente o Administrador acessa parâmetros, todos os históricos e a gestão de usuários. Mudanças de perfil ou status passam a valer na próxima validação da sessão.';
    }
  }

  function _renderRolePreview(containerId, role) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const definition = getRoleDefinition(role);
    container.dataset.role = definition.id;
    container.classList.add('role-preview--detailed');
    container.innerHTML = `
      <div class="role-preview-heading">
        <span class="badge badge-role-${definition.id}">${definition.label}</span>
        <span>${definition.description}</span>
      </div>
      <ul class="role-preview-list">
        ${definition.permissions.map(permission => `<li class="${permission.allowed ? 'allowed' : 'denied'}"><span aria-hidden="true">${permission.allowed ? '✓' : '—'}</span>${permission.label}</li>`).join('')}
      </ul>`;
  }

  function generateStrongPassword() {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const nums = '0123456789';
    const spec = '!@#$%^&*_-';
    const all = upper + lower + nums + spec;

    function secureIndex(length) {
      if (!window.crypto?.getRandomValues) {
        throw new Error('O navegador não oferece geração segura de senha.');
      }
      const range = 0x100000000;
      const limit = range - (range % length);
      const random = new Uint32Array(1);
      do window.crypto.getRandomValues(random);
      while (random[0] >= limit);
      return random[0] % length;
    }

    const chars = [
      upper[secureIndex(upper.length)],
      lower[secureIndex(lower.length)],
      nums[secureIndex(nums.length)],
      spec[secureIndex(spec.length)],
    ];
    for (let i = 0; i < 8; i += 1) {
      chars.push(all[secureIndex(all.length)]);
    }
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = secureIndex(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }

  async function loadUsers() {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (_allProfiles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">Carregando usuários do Supabase...</td></tr>';
      const profiles = await App.Supabase.getAllProfiles();
      if (profiles === null) {
        tbody.innerHTML = '<tr><td colspan="8" class="users-table-message users-table-message--error">Não foi possível carregar os usuários. Verifique sua conexão e permissão de administrador.</td></tr>';
        return;
      }
      _allProfiles = profiles;
    }
    
    if (_allProfiles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">Nenhum usuário encontrado (Verifique as Policies no Supabase)</td></tr>';
      return;
    }

    renderKPIs();
    applyFilters();
  }

  function getInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  function formatDate(dateString) {
    if (!dateString) return '-';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('pt-BR');
  }

  function renderKPIs() {
    const grid = document.getElementById('users-kpi-grid');
    if (!grid) return;

    const total = _allProfiles.length;
    const ativos = _allProfiles.filter(p => getComputedStatus(p) === 'ativo').length;
    const admins = _allProfiles.filter(p => p.role === 'admin').length;
    
    const now = new Date();
    const trintaDias = new Date(now.setDate(now.getDate() - 30));
    const novos = _allProfiles.filter(p => new Date(p.created_at) >= trintaDias).length;

    const bloqueados = _allProfiles.filter(p => getComputedStatus(p) === 'bloqueado').length;
    const inativos = _allProfiles.filter(p => getComputedStatus(p) === 'inativo').length;

    grid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Total de Usuários</span>
          <div class="kpi-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div>
        </div>
        <div class="kpi-value">${total}</div>
        <div class="kpi-subtext">Registrados no sistema</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Usuários Ativos</span>
          <div class="kpi-icon" style="color: #10b981; background: rgba(16, 185, 129, 0.1);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg></div>
        </div>
        <div class="kpi-value">${ativos}</div>
        <div class="kpi-subtext"><span style="color: #10b981;">+${Math.round((ativos/total)*100 || 0)}%</span> da base total</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Administradores</span>
          <div class="kpi-icon" style="color: #8b5cf6; background: rgba(139, 92, 246, 0.1);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></div>
        </div>
        <div class="kpi-value">${admins}</div>
        <div class="kpi-subtext">Acesso total permitido</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Novos (30 dias)</span>
          <div class="kpi-icon" style="color: #3b82f6; background: rgba(59, 130, 246, 0.1);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div>
        </div>
        <div class="kpi-value">${novos}</div>
        <div class="kpi-subtext">Adicionados recentemente</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Bloqueados</span>
          <div class="kpi-icon" style="color: #f97316; background: rgba(249, 115, 22, 0.1);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></div>
        </div>
        <div class="kpi-value">${bloqueados}</div>
        <div class="kpi-subtext">Por excesso de tentativas</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Inativos</span>
          <div class="kpi-icon" style="color: #ef4444; background: rgba(239, 68, 68, 0.1);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg></div>
        </div>
        <div class="kpi-value">${inativos}</div>
        <div class="kpi-subtext">Contas desativadas</div>
      </div>
    `;
  }

  function applyFilters() {
    const searchTerm = document.getElementById('users-search')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('users-filter-role')?.value || '';
    const statusFilter = document.getElementById('users-filter-status')?.value || '';

    renderActiveFilters(roleFilter, statusFilter);

    _filteredProfiles = _allProfiles.filter(p => {
      const matchSearch = (p.nome_completo || '').toLowerCase().includes(searchTerm) || 
                          (p.empresa || '').toLowerCase().includes(searchTerm) ||
                          (p.email || '').toLowerCase().includes(searchTerm) ||
                          (p.id || '').toLowerCase().includes(searchTerm);
      const matchRole = roleFilter ? p.role === roleFilter : true;
      
      const computedStatus = getComputedStatus(p);
      const matchStatus = statusFilter ? computedStatus === statusFilter : true;

      return matchSearch && matchRole && matchStatus;
    });

    currentPage = 1;
    renderUsersTable();
  }

  function renderActiveFilters(role, status) {
    const container = document.getElementById('users-active-filters');
    if (!container) return;
    container.innerHTML = '';

    if (role) {
      container.innerHTML += `<div class="filter-chip">PERFIL: ${role.toUpperCase()} <button onclick="document.getElementById('users-filter-role').value=''; document.getElementById('users-filter-role').dispatchEvent(new Event('change'));"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div>`;
    }
    if (status) {
      container.innerHTML += `<div class="filter-chip">STATUS: ${status.toUpperCase()} <button onclick="document.getElementById('users-filter-status').value=''; document.getElementById('users-filter-status').dispatchEvent(new Event('change'));"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div>`;
    }
  }

  function clearFilters() {
    document.getElementById('users-search').value = '';
    document.getElementById('users-filter-role').value = '';
    document.getElementById('users-filter-status').value = '';
    applyFilters();
  }

  function renderUsersTable() {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';

    if (_filteredProfiles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">Nenhum usuário corresponde aos filtros.</td></tr>';
      renderPagination();
      return;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginated = _filteredProfiles.slice(startIndex, endIndex);
    const currentUserId = App.Supabase.getCurrentUser?.()?.id;

    paginated.forEach(p => {
      const tr = document.createElement('tr');
      
      const initials = getInitials(p.nome_completo);
      const createdDate = formatDate(p.created_at);
      const lastLogin = p.last_login_at ? formatDate(p.last_login_at) : 'Nunca acessou';

      const computedStatus = getComputedStatus(p);

      let statusBadge = '';
      let statusLabel = '';
      if (computedStatus === 'bloqueado') { statusBadge = 'badge-status-bloqueado'; statusLabel = 'BLOQUEADO'; }
      else if (computedStatus === 'pendente') { statusBadge = 'badge-status-pendente'; statusLabel = '1º ACESSO'; }
      else if (computedStatus === 'ativo') { statusBadge = 'badge-status-ativo'; statusLabel = 'ATIVO'; }
      else { statusBadge = 'badge-status-inativo'; statusLabel = 'INATIVO'; }

      const role = getRoleDefinition(p.role);
      const isSelf = Boolean(currentUserId && currentUserId === p.id);
      const displayName = _escapeHtml(p.nome_completo || 'Sem nome');
      const displayEmail = _escapeHtml(p.email || (p.id ? `ID: ${p.id}` : 'Sem identificador'));
      const displayCompany = _escapeHtml(p.empresa || '-');
      const displayJob = _escapeHtml(p.cargo || '-');
      const safeId = _escapeHtml(p.id || '');

      tr.innerHTML = `
        <td data-label="Usuário">
          <div class="user-cell">
            <div class="user-avatar">${_escapeHtml(initials)}</div>
            <div class="user-info">
              <span class="user-name">${displayName}${isSelf ? ' <span class="current-user-tag">Você</span>' : ''}</span>
              <span class="user-email">${displayEmail}</span>
            </div>
          </div>
        </td>
        <td data-label="Empresa">
          <div class="cell-text">${displayCompany}</div>
        </td>
        <td data-label="Cargo">
          <div class="cell-text">${displayJob}</div>
        </td>
        <td data-label="Perfil">
          <span class="badge badge-role-${role.id}" title="${_escapeHtml(role.description)}">${role.label}</span>
        </td>
        <td data-label="Status">
          <span class="badge ${statusBadge}">${statusLabel}</span>
        </td>
        <td data-label="Último Acesso">
          <div class="cell-text">${lastLogin}</div>
        </td>
        <td data-label="Cadastro">
          <div class="cell-text">${createdDate}</div>
        </td>
        <td data-label="Ações" style="text-align: right;">
          <div class="row-actions" style="justify-content: flex-end;">
            <button type="button" class="action-btn" data-user-action="edit" data-user-id="${safeId}" title="Editar cadastro" aria-label="Editar cadastro de ${displayName}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>
            </button>
            <button type="button" class="action-btn danger" data-user-action="delete" data-user-id="${safeId}" title="${isSelf ? 'Não é permitido excluir a própria conta' : 'Excluir usuário'}" aria-label="Excluir ${displayName}" ${isSelf ? 'disabled' : ''}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    renderPagination();
  }

  function renderPagination() {
    const total = _filteredProfiles.length;
    const totalPages = Math.ceil(total / itemsPerPage) || 1;
    
    document.getElementById('pagination-info').innerText = 
      `Mostrando ${total === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1}-${Math.min(currentPage * itemsPerPage, total)} de ${total} registros`;

    const prevBtn = document.getElementById('btn-prev-page');
    const nextBtn = document.getElementById('btn-next-page');
    
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;

    const pagesContainer = document.getElementById('pagination-pages');
    pagesContainer.innerHTML = '';

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 || 
        i === totalPages || 
        (i >= currentPage - 1 && i <= currentPage + 1)
      ) {
        const div = document.createElement('div');
        div.className = `page-item ${i === currentPage ? 'active' : ''}`;
        div.innerText = i;
        div.onclick = () => { currentPage = i; renderUsersTable(); };
        pagesContainer.appendChild(div);
      } else if (
        i === currentPage - 2 || 
        i === currentPage + 2
      ) {
        const span = document.createElement('span');
        span.innerText = '...';
        span.style.color = 'var(--text-muted)';
        span.style.alignSelf = 'center';
        pagesContainer.appendChild(span);
      }
    }
  }

  // ── Edit User Modal ────────────────────────────────────────────────────────
  function _setEditFeedback(message, type) {
    const feedback = document.getElementById('user-edit-feedback');
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.className = 'user-edit-feedback' + (type ? ` ${type}` : '');
  }

  function openEditUser(userId, trigger) {
    const profile = _allProfiles.find(item => item.id === userId);
    const overlay = document.getElementById('user-edit-overlay');
    const form = document.getElementById('user-edit-form');
    if (!profile || !overlay || !form) {
      App.UI.toast('Não foi possível abrir o cadastro deste usuário.', 'error');
      return;
    }

    const currentUserId = App.Supabase.getCurrentUser?.()?.id;
    const isSelf = Boolean(currentUserId && currentUserId === profile.id);
    const status = getComputedStatus(profile);
    const role = getRoleDefinition(profile.role).id;
    const profileEmail = String(profile.email || '').trim();
    const identityIdentifier = profileEmail || (profile.id ? `ID do perfil: ${profile.id}` : 'E-mail não disponível');
    const original = {
      nome_completo: String(profile.nome_completo || '').trim(),
      telefone: String(profile.telefone || '').trim(),
      empresa: String(profile.empresa || '').trim(),
      cargo: String(profile.cargo || '').trim(),
      role,
      status,
    };

    document.getElementById('eu-id').value = profile.id;
    const emailInput = document.getElementById('eu-email');
    emailInput.value = profileEmail;
    emailInput.placeholder = profileEmail ? '' : 'E-mail não disponível no perfil';
    document.getElementById('eu-name').value = original.nome_completo;
    document.getElementById('eu-phone').value = original.telefone;
    document.getElementById('eu-company').value = original.empresa;
    document.getElementById('eu-job-title').value = original.cargo;
    document.getElementById('eu-role').value = role;
    document.getElementById('eu-status').value = status;

    const avatar = document.getElementById('eu-avatar');
    const identityName = document.getElementById('eu-identity-name');
    const identityEmail = document.getElementById('eu-identity-email');
    const identityStatus = document.getElementById('eu-identity-status');
    if (avatar) avatar.textContent = getInitials(profile.nome_completo);
    if (identityName) identityName.textContent = profile.nome_completo || 'Sem nome';
    if (identityEmail) identityEmail.textContent = identityIdentifier;
    if (identityStatus) {
      const statusLabels = {
        ativo: 'Ativo',
        inativo: 'Inativo',
        bloqueado: 'Bloqueado',
        pendente: '1º acesso',
      };
      identityStatus.textContent = statusLabels[status] || 'Usuário';
      identityStatus.dataset.status = status;
    }

    const roleSelect = document.getElementById('eu-role');
    const statusSelect = document.getElementById('eu-status');
    roleSelect.disabled = isSelf;
    statusSelect.disabled = isSelf;
    const selfWarning = document.getElementById('eu-self-warning');
    if (selfWarning) selfWarning.hidden = !isSelf;

    form.dataset.userId = profile.id;
    form.dataset.isSelf = String(isSelf);
    form.dataset.original = JSON.stringify(original);
    _renderRolePreview('eu-role-preview', role);
    _setEditFeedback('');

    _editReturnFocus = trigger || document.activeElement;
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => document.getElementById('eu-name')?.focus());
  }

  function closeEditUserModal() {
    const overlay = document.getElementById('user-edit-overlay');
    const form = document.getElementById('user-edit-form');
    overlay?.classList.remove('visible');
    overlay?.setAttribute('aria-hidden', 'true');
    form?.reset();
    if (form) {
      delete form.dataset.userId;
      delete form.dataset.isSelf;
      delete form.dataset.original;
    }
    _setEditFeedback('');
    if (_editReturnFocus && typeof _editReturnFocus.focus === 'function') _editReturnFocus.focus();
    _editReturnFocus = null;
  }

  async function _handleEditUserSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = document.getElementById('btn-user-edit-submit');
    if (!submitButton || submitButton.disabled) return;

    const userId = form.dataset.userId;
    const isSelf = form.dataset.isSelf === 'true';
    const name = document.getElementById('eu-name').value.trim();
    const role = document.getElementById('eu-role').value;
    const status = document.getElementById('eu-status').value;
    if (name.length < 2) {
      _setEditFeedback('Informe o nome completo do usuário.', 'error');
      document.getElementById('eu-name').focus();
      return;
    }
    if (!isSelf && !ROLES.includes(role)) {
      _setEditFeedback('Selecione um perfil de acesso válido.', 'error');
      return;
    }
    if (!isSelf && !STATUSES.includes(status)) {
      _setEditFeedback('Selecione um status válido.', 'error');
      return;
    }

    const values = {
      nome_completo: name,
      telefone: document.getElementById('eu-phone').value.trim(),
      empresa: document.getElementById('eu-company').value.trim(),
      cargo: document.getElementById('eu-job-title').value.trim(),
      role,
      status,
    };
    const original = JSON.parse(form.dataset.original || '{}');
    const editableKeys = isSelf
      ? ['nome_completo', 'telefone', 'empresa', 'cargo']
      : ['nome_completo', 'telefone', 'empresa', 'cargo', 'role', 'status'];
    const changed = editableKeys.some(key => String(values[key] || '') !== String(original[key] || ''));
    if (!changed) {
      _setEditFeedback('Nenhuma alteração foi realizada.', 'info');
      return;
    }

    const payload = {};
    editableKeys.forEach(key => { payload[key] = values[key]; });
    const originalContent = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    submitButton.innerHTML = '<span class="spinner" aria-hidden="true"></span> Salvando…';
    _setEditFeedback('Salvando alterações…', 'info');

    try {
      const { data, error } = await App.Supabase.updateProfile(userId, payload);
      if (error || !data) throw error || new Error('O perfil não foi atualizado.');
      _allProfiles = _allProfiles.map(profile => profile.id === userId
        ? { ...profile, ...data, email: profile.email || data.email }
        : profile);
      renderKPIs();
      applyFilters();
      closeEditUserModal();
      App.UI.toast('Cadastro atualizado com sucesso!', 'success');
    } catch (error) {
      console.error('[UsersUI] Falha ao atualizar cadastro:', error);
      _setEditFeedback(error?.message || 'Não foi possível atualizar o cadastro.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      submitButton.innerHTML = originalContent;
    }
  }

  // ── New User Modal ──────────────────────────────────────────────────────────
  function openNewUserModal() {
    const overlay = document.getElementById('new-user-overlay');
    if (overlay) {
      _newUserReturnFocus = document.activeElement;
      overlay.classList.add('visible');
      overlay.setAttribute('aria-hidden', 'false');
      const pwdInput = document.getElementById('nu-password');
      if (pwdInput) pwdInput.value = generateStrongPassword();
      _renderRolePreview('nu-role-preview', document.getElementById('nu-role')?.value || 'engenheiro');
      requestAnimationFrame(() => document.getElementById('nu-email')?.focus());
    }
  }

  function closeNewUserModal() {
    const overlay = document.getElementById('new-user-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.getElementById('new-user-form')?.reset();
      const feedback = document.getElementById('new-user-feedback');
      if (feedback) feedback.textContent = '';
      _renderRolePreview('nu-role-preview', document.getElementById('nu-role')?.value || 'engenheiro');
      if (_newUserReturnFocus && typeof _newUserReturnFocus.focus === 'function') {
        _newUserReturnFocus.focus();
      }
      _newUserReturnFocus = null;
    }
  }

  async function _completeNewUserProfile(userId, profileData) {
    let lastResult = { data: null, error: new Error('Perfil ainda não disponível.') };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 500));
      lastResult = await App.Supabase.updateProfile(userId, profileData);
      if (!lastResult.error && lastResult.data) return lastResult;
    }
    return lastResult;
  }

  async function _handleNewUserSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-new-user-submit');
    const feedback = document.getElementById('new-user-feedback');
    const email = document.getElementById('nu-email').value.trim();
    const name = document.getElementById('nu-name').value.trim();
    const password = document.getElementById('nu-password').value;
    const role = document.getElementById('nu-role').value;
    const company = document.getElementById('nu-company')?.value.trim() || '';
    const jobTitle = document.getElementById('nu-job-title')?.value.trim() || '';
    const phone = document.getElementById('nu-phone')?.value.trim() || '';

    if (!ROLES.includes(role)) {
      feedback.textContent = 'Selecione um perfil de acesso válido.';
      feedback.style.color = 'var(--danger)';
      return;
    }

    btn.disabled = true;
    const originalContent = btn.innerHTML;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Criando…';
    feedback.textContent = '';

    let signUpResult;
    try {
      signUpResult = await App.Supabase.signUp(email, password, name);
    } catch (requestError) {
      signUpResult = { user: null, error: requestError };
    }
    const { user, error } = signUpResult;

    if (error) {
      feedback.style.color = 'var(--danger)';
      feedback.textContent = `Erro: ${error.message}`;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.innerHTML = originalContent;
      return;
    }

    if (user) {
      const profileResult = await _completeNewUserProfile(user.id, {
        nome_completo: name,
        telefone: phone,
        empresa: company,
        cargo: jobTitle,
        role,
        status: 'pendente',
      });
      if (!profileResult.error && profileResult.data) {
        App.UI.toast('Usuário criado com sucesso!', 'success');
        closeNewUserModal();
        _allProfiles = [];
        await loadUsers();
      } else {
        feedback.style.color = 'var(--danger)';
        feedback.textContent = 'A conta foi criada, mas o cadastro complementar não pôde ser salvo: ' + (profileResult.error?.message || 'erro desconhecido');
      }
    } else {
      feedback.style.color = 'var(--success)';
      feedback.textContent = 'Conta criada. Peça a confirmação do e-mail.';
    }
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.innerHTML = originalContent;
  }

  function init() {
    _renderPermissionMatrix();
    _renderRolePreview('nu-role-preview', document.getElementById('nu-role')?.value || 'engenheiro');

    const menuBtn = document.getElementById('menu-usuarios');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        _allProfiles = [];
        loadUsers();
      });
    }

    // Filtros
    document.getElementById('users-search')?.addEventListener('input', applyFilters);
    document.getElementById('users-filter-role')?.addEventListener('change', applyFilters);
    document.getElementById('users-filter-status')?.addEventListener('change', applyFilters);
    document.getElementById('btn-clear-filters')?.addEventListener('click', clearFilters);

    // Paginação & Ações
    document.getElementById('users-per-page')?.addEventListener('change', (e) => {
      itemsPerPage = parseInt(e.target.value, 10);
      currentPage = 1;
      renderUsersTable();
    });

    document.getElementById('btn-prev-page')?.addEventListener('click', () => {
      if (currentPage > 1) { currentPage--; renderUsersTable(); }
    });

    document.getElementById('btn-next-page')?.addEventListener('click', () => {
      const totalPages = Math.ceil(_filteredProfiles.length / itemsPerPage);
      if (currentPage < totalPages) { currentPage++; renderUsersTable(); }
    });

    document.getElementById('btn-refresh-users')?.addEventListener('click', async () => {
      _allProfiles = [];
      await loadUsers();
      App.UI.toast('Lista atualizada!', 'success');
    });

    document.getElementById(tbodyId)?.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-user-action]');
      if (!actionButton || actionButton.disabled) return;
      const userId = actionButton.dataset.userId;
      if (actionButton.dataset.userAction === 'edit') openEditUser(userId, actionButton);
      if (actionButton.dataset.userAction === 'delete') promptDeleteUser(userId);
    });

    // Modal Events
    document.getElementById('btn-generate-password')?.addEventListener('click', () => {
      const pwdInput = document.getElementById('nu-password');
      if (pwdInput) pwdInput.value = generateStrongPassword();
    });

    document.getElementById('btn-copy-password')?.addEventListener('click', () => {
      const pwdInput = document.getElementById('nu-password');
      if (pwdInput && pwdInput.value) {
        navigator.clipboard.writeText(pwdInput.value).then(() => {
          App.UI.toast('Senha copiada para a área de transferência!', 'success');
        });
      }
    });

    document.getElementById('btn-add-user')?.addEventListener('click', openNewUserModal);
    document.getElementById('btn-new-user-close')?.addEventListener('click', closeNewUserModal);
    document.getElementById('btn-cancel-new-user')?.addEventListener('click', closeNewUserModal);
    document.getElementById('new-user-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'new-user-overlay') closeNewUserModal();
    });
    document.getElementById('new-user-form')?.addEventListener('submit', _handleNewUserSubmit);
    document.getElementById('nu-role')?.addEventListener('change', (event) => {
      _renderRolePreview('nu-role-preview', event.target.value);
    });

    document.getElementById('btn-user-edit-close')?.addEventListener('click', closeEditUserModal);
    document.getElementById('btn-cancel-user-edit')?.addEventListener('click', closeEditUserModal);
    document.getElementById('user-edit-overlay')?.addEventListener('click', (event) => {
      if (event.target.id === 'user-edit-overlay') closeEditUserModal();
    });
    document.getElementById('user-edit-form')?.addEventListener('submit', _handleEditUserSubmit);
    document.getElementById('eu-role')?.addEventListener('change', (event) => {
      _renderRolePreview('eu-role-preview', event.target.value);
    });
    
    document.addEventListener('keydown', e => {
      const editOverlay = document.getElementById('user-edit-overlay');
      const newOverlay = document.getElementById('new-user-overlay');
      if (e.key === 'Tab') {
        _trapModalFocus(e, editOverlay?.classList.contains('visible') ? editOverlay : newOverlay);
        return;
      }
      if (e.key !== 'Escape') return;
      if (editOverlay?.classList.contains('visible')) {
        closeEditUserModal();
      } else if (newOverlay?.classList.contains('visible')) {
        closeNewUserModal();
      }
    });
  }

  async function promptDeleteUser(userId) {
    const currentUserId = App.Supabase.getCurrentUser?.()?.id;
    if (currentUserId && currentUserId === userId) {
      App.UI.toast('Não é permitido excluir a própria conta.', 'error');
      return;
    }
    const p = _allProfiles.find(x => x.id === userId);
    const label = p ? (p.email || p.nome_completo) : 'este usuário';
    if (!window.confirm(`ATENÇÃO: Deseja realmente excluir ${label}?\n\nIsso removerá o perfil do banco de dados.`)) return;
    
    const { error } = await App.Supabase.deleteProfile(userId);
    if (error) {
      App.UI.toast('Erro ao excluir usuário: ' + error.message, 'error');
    } else {
      App.UI.toast('Usuário excluído com sucesso!', 'success');
      _allProfiles = [];
      await loadUsers();
    }
  }

  return {
    init,
    loadUsers,
    openNewUserModal,
    closeNewUserModal,
    openEditUser,
    closeEditUserModal,
    promptDeleteUser,
    getRoleDefinition,
    getComputedStatus,
  };
})();
