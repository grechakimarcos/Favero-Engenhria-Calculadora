'use strict';
window.App = window.App || {};

App.UsersUI = (function () {
  const tbodyId = 'users-table-body';

  let _allProfiles = [];
  let _filteredProfiles = [];
  let currentPage = 1;
  let itemsPerPage = 10;

  function generateStrongPassword() {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const nums = "0123456789";
    const spec = "!@#$%^&*_-";
    const all = upper + lower + nums + spec;
    let pwd = upper[Math.floor(Math.random() * upper.length)] + 
              lower[Math.floor(Math.random() * lower.length)] + 
              nums[Math.floor(Math.random() * nums.length)] + 
              spec[Math.floor(Math.random() * spec.length)];
    for(let i=0; i<8; i++) {
      pwd += all[Math.floor(Math.random() * all.length)];
    }
    return pwd.split('').sort(() => 0.5 - Math.random()).join('');
  }

  async function loadUsers() {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (_allProfiles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">Carregando usuários do Supabase...</td></tr>';
      const profiles = await App.Supabase.getAllProfiles();
      _allProfiles = profiles || [];
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
    const ativos = _allProfiles.filter(p => p.status !== 'inativo').length;
    const admins = _allProfiles.filter(p => p.role === 'admin').length;
    
    const now = new Date();
    const trintaDias = new Date(now.setDate(now.getDate() - 30));
    const novos = _allProfiles.filter(p => new Date(p.created_at) >= trintaDias).length;

    const bloqueados = _allProfiles.filter(p => p.locked_until && new Date(p.locked_until) > new Date()).length;
    const inativos = _allProfiles.filter(p => p.status === 'inativo').length;

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
                          (p.email || '').toLowerCase().includes(searchTerm);
      const matchRole = roleFilter ? p.role === roleFilter : true;
      
      let computedStatus = p.status || 'ativo';
      if (p.locked_until && new Date(p.locked_until) > new Date()) computedStatus = 'bloqueado';
      else if (p.must_change_password) computedStatus = 'pendente';
      
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

    paginated.forEach(p => {
      const tr = document.createElement('tr');
      
      const initials = getInitials(p.nome_completo);
      const createdDate = formatDate(p.created_at);
      const lastLogin = p.last_login_at ? formatDate(p.last_login_at) : 'Nunca acessou';

      let computedStatus = p.status || 'ativo';
      if (p.locked_until && new Date(p.locked_until) > new Date()) computedStatus = 'bloqueado';
      else if (p.must_change_password) computedStatus = 'pendente';

      let statusBadge = '';
      let statusLabel = '';
      if (computedStatus === 'bloqueado') { statusBadge = 'badge-status-bloqueado'; statusLabel = 'BLOQUEADO'; }
      else if (computedStatus === 'pendente') { statusBadge = 'badge-status-pendente'; statusLabel = '1º ACESSO'; }
      else if (computedStatus === 'ativo') { statusBadge = 'badge-status-ativo'; statusLabel = 'ATIVO'; }
      else { statusBadge = 'badge-status-inativo'; statusLabel = 'INATIVO'; }

      let roleBadge = `badge-role-${p.role || 'visitante'}`;

      tr.innerHTML = `
        <td data-label="Usuário">
          <div class="user-cell">
            <div class="user-avatar">${initials}</div>
            <div class="user-info">
              <span class="user-name">${p.nome_completo || 'Sem Nome'}</span>
              <span class="user-email">${p.email || p.id}</span>
            </div>
          </div>
        </td>
        <td data-label="Empresa">
          <div class="cell-text">${p.empresa || '-'}</div>
        </td>
        <td data-label="Cargo">
          <div class="cell-text">${p.cargo || '-'}</div>
        </td>
        <td data-label="Perfil">
          <span class="badge ${roleBadge}">${p.role || 'visitante'}</span>
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
            <button class="action-btn" title="Permissões" onclick="App.UsersUI.promptRoleUpdate('${p.id}', '${p.role}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            </button>
            <button class="action-btn" title="Editar Status" onclick="App.UsersUI.promptStatusUpdate('${p.id}', '${p.status || 'ativo'}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>
            <button class="action-btn danger" title="Excluir" onclick="App.UsersUI.promptDeleteUser('${p.id}')">
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

  // ── New User Modal ──────────────────────────────────────────────────────────
  function openNewUserModal() {
    const overlay = document.getElementById('new-user-overlay');
    if (overlay) {
      overlay.classList.add('visible');
      
      const pwdInput = document.getElementById('nu-password');
      if (pwdInput) pwdInput.value = generateStrongPassword();
    }
  }

  function closeNewUserModal() {
    const overlay = document.getElementById('new-user-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
      document.getElementById('new-user-form')?.reset();
      const feedback = document.getElementById('new-user-feedback');
      if (feedback) feedback.innerHTML = '';
    }
  }

  async function _handleNewUserSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-new-user-submit');
    const feedback = document.getElementById('new-user-feedback');
    const email = document.getElementById('nu-email').value;
    const name = document.getElementById('nu-name').value;
    const password = document.getElementById('nu-password').value;
    const role = document.getElementById('nu-role').value;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="margin:0 auto;"></span>';
    feedback.innerHTML = '';

    const { user, error } = await App.Supabase.signUp(email, password, name);

    if (error) {
      feedback.style.color = 'var(--danger)';
      feedback.innerHTML = `Erro: ${error.message}`;
      btn.disabled = false;
      btn.innerHTML = 'Criar Conta';
      return;
    }

    if (user) {
      setTimeout(async () => {
        await App.Supabase.updateProfileRole(user.id, role);
        App.UI.toast('Usuário criado com sucesso!', 'success');
        closeNewUserModal();
        _allProfiles = [];
        loadUsers(); 
        btn.disabled = false;
        btn.innerHTML = 'Criar Conta';
      }, 1000);
    } else {
      feedback.style.color = 'var(--success)';
      feedback.innerHTML = `Conta criada. Peça confirmação de email.`;
      btn.disabled = false;
      btn.innerHTML = 'Criar Conta';
    }
  }

  function init() {
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

    document.getElementById('btn-refresh-users')?.addEventListener('click', () => {
      _allProfiles = [];
      loadUsers();
      App.UI.toast('Lista atualizada!', 'success');
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
    
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('new-user-overlay')?.classList.contains('visible')) {
        closeNewUserModal();
      }
    });
  }

  async function promptRoleUpdate(userId, currentRole) {
    const newRole = window.prompt(`Qual será o novo nível de acesso?\nValores válidos: visitante, engenheiro, financeiro, comercial, gestor, admin\n\nNível atual: ${currentRole}`, currentRole);
    if (!newRole || newRole === currentRole) return;
    
    const validRoles = ['visitante', 'engenheiro', 'financeiro', 'comercial', 'gestor', 'admin'];
    if (!validRoles.includes(newRole.toLowerCase().trim())) {
      App.UI.toast('Nível de acesso inválido.', 'error');
      return;
    }
    
    const { error } = await App.Supabase.updateProfileRole(userId, newRole.toLowerCase().trim());
    if (error) {
      App.UI.toast('Erro ao atualizar permissão: ' + error.message, 'error');
    } else {
      App.UI.toast('Permissão atualizada com sucesso!', 'success');
      _allProfiles = [];
      loadUsers();
    }
  }

  async function promptStatusUpdate(userId, currentStatus) {
    const newStatus = window.prompt(`Qual será o novo status?\nValores válidos: ativo, inativo, bloqueado, pendente\n\nStatus atual: ${currentStatus || 'ativo'}`, currentStatus || 'ativo');
    if (!newStatus || newStatus === currentStatus) return;
    
    const validStatus = ['ativo', 'inativo', 'bloqueado', 'pendente'];
    if (!validStatus.includes(newStatus.toLowerCase().trim())) {
      App.UI.toast('Status inválido.', 'error');
      return;
    }
    
    const { error } = await App.Supabase.updateProfileStatus(userId, newStatus.toLowerCase().trim());
    if (error) {
      App.UI.toast('Erro ao atualizar status: ' + error.message, 'error');
    } else {
      App.UI.toast('Status atualizado com sucesso!', 'success');
      _allProfiles = [];
      loadUsers();
    }
  }

  async function promptDeleteUser(userId) {
    const p = _allProfiles.find(x => x.id === userId);
    const label = p ? (p.email || p.nome_completo) : 'este usuário';
    if (!window.confirm(`ATENÇÃO: Deseja realmente excluir ${label}?\n\nIsso removerá o perfil do banco de dados.`)) return;
    
    const { error } = await App.Supabase.deleteProfile(userId);
    if (error) {
      App.UI.toast('Erro ao excluir usuário: ' + error.message, 'error');
    } else {
      App.UI.toast('Usuário excluído com sucesso!', 'success');
      _allProfiles = [];
      loadUsers();
    }
  }

  return { init, loadUsers, openNewUserModal, closeNewUserModal, promptRoleUpdate, promptStatusUpdate, promptDeleteUser };
})();
