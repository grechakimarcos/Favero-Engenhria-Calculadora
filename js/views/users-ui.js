'use strict';
window.App = window.App || {};

App.UsersUI = (function () {
  const tbodyId = 'users-table-body';

  let _allProfiles = [];

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
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Carregando usuários do Supabase...</td></tr>';
      const profiles = await App.Supabase.getAllProfiles();
      _allProfiles = profiles || [];
    }
    
    if (_allProfiles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhum usuário encontrado (Verifique as Policies no Supabase)</td></tr>';
      return;
    }

    renderUsersTable();
  }

  function renderUsersTable() {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchTerm = document.getElementById('users-search')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('users-filter-role')?.value || '';
    const statusFilter = document.getElementById('users-filter-status')?.value || '';

    const filtered = _allProfiles.filter(p => {
      const matchSearch = (p.nome_completo || '').toLowerCase().includes(searchTerm) || 
                          (p.empresa || '').toLowerCase().includes(searchTerm);
      const matchRole = roleFilter ? p.role === roleFilter : true;
      
      let computedStatus = p.status || 'ativo';
      if (p.locked_until && new Date(p.locked_until) > new Date()) computedStatus = 'bloqueado';
      else if (p.must_change_password) computedStatus = 'pendente';
      
      const matchStatus = statusFilter ? computedStatus === statusFilter : true;

      return matchSearch && matchRole && matchStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhum usuário corresponde aos filtros.</td></tr>';
      return;
    }

    filtered.forEach(p => {
      const tr = document.createElement('tr');
      const dataStr = new Date(p.created_at).toLocaleDateString('pt-BR');
      
      const roleOptions = ['admin', 'engenheiro', 'comercial', 'financeiro', 'gestor', 'visitante']
        .map(role => `<option value="${role}" ${p.role === role ? 'selected' : ''}>${role.toUpperCase()}</option>`)
        .join('');

      let badgeHtml = '';
      if (p.locked_until && new Date(p.locked_until) > new Date()) {
        badgeHtml = `<span style="font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; background: var(--danger-dim); color: var(--danger); text-transform: uppercase;">BLOQUEADO</span>`;
      } else if (p.must_change_password) {
        badgeHtml = `<span style="font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; background: var(--warning-dim); color: var(--warning); text-transform: uppercase;">PENDENTE ACESSO</span>`;
      } else {
        const isAtivo = p.status !== 'inativo';
        badgeHtml = `<span style="font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; background: ${isAtivo ? 'var(--success-dim)' : 'var(--danger-dim)'}; color: ${isAtivo ? 'var(--success)' : 'var(--danger)'}; text-transform: uppercase;">${isAtivo ? 'ATIVO' : 'INATIVO'}</span>`;
      }

      tr.innerHTML = `
        <td>
          <div style="font-weight: 500;">${p.nome_completo || 'Sem Nome'}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Desde ${dataStr}</div>
        </td>
        <td>${p.empresa || '-'}</td>
        <td>${p.cargo || '-'}</td>
        <td>
          <select class="role-select" data-id="${p.id}" style="padding: 4px; border-radius: 4px; background: var(--bg-input); border: 1px solid var(--border); color: var(--text-primary); font-size: 0.8rem; width: 100%;">
            ${roleOptions}
          </select>
        </td>
        <td>${badgeHtml}</td>
        <td>
          <button class="btn btn-primary btn-sm btn-save-role" data-id="${p.id}" title="Salvar Permissão" style="display:none; padding: 4px 8px; font-size: 0.75rem;">
            Salvar Role
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    _bindRoleSelects();
  }

  function _bindRoleSelects() {
    const selects = document.querySelectorAll('.role-select');
    selects.forEach(select => {
      select.addEventListener('change', (e) => {
        const tr = e.target.closest('tr');
        const btn = tr.querySelector('.btn-save-role');
        if (btn) btn.style.display = 'inline-flex';
      });
    });

    const btns = document.querySelectorAll('.btn-save-role');
    btns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const btnEl = e.currentTarget;
        const id = btnEl.getAttribute('data-id');
        const tr = e.target.closest('tr');
        const select = tr.querySelector('.role-select');
        const newRole = select.value;
        
        btnEl.innerHTML = '<span class="spinner" style="width:12px;height:12px;margin:0;"></span>';
        btnEl.disabled = true;

        const { error } = await App.Supabase.updateProfileRole(id, newRole);
        
        btnEl.innerHTML = `Salvar`;
        btnEl.disabled = false;
        
        if (error) {
          App.UI.toast('Erro ao atualizar: ' + error.message, 'error');
        } else {
          App.UI.toast('Permissão atualizada com sucesso!', 'success');
          btnEl.style.display = 'none';
        }
      });
    });
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

    // Create user in Auth
    const { user, error } = await App.Supabase.signUp(email, password, name);

    if (error) {
      feedback.style.color = 'var(--danger)';
      feedback.innerHTML = `Erro: ${error.message}`;
      btn.disabled = false;
      btn.innerHTML = 'Criar Conta';
      return;
    }

    // Wait a brief moment to ensure the trigger created the profile, then update role
    if (user) {
      setTimeout(async () => {
        await App.Supabase.updateProfileRole(user.id, role);
        App.UI.toast('Usuário criado com sucesso!', 'success');
        closeNewUserModal();
        loadUsers(); // refresh table
        btn.disabled = false;
        btn.innerHTML = 'Criar Conta';
      }, 1000);
    } else {
      // Sometimes it requires email confirmation and returns user as null.
      feedback.style.color = 'var(--success)';
      feedback.innerHTML = `Conta criada. Peça para o usuário confirmar o email.`;
      btn.disabled = false;
      btn.innerHTML = 'Criar Conta';
    }
  }

  function init() {
    const menuBtn = document.getElementById('menu-usuarios');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        _allProfiles = []; // Força reload do banco ao abrir a aba
        loadUsers();
      });
    }

    // Filtros
    document.getElementById('users-search')?.addEventListener('input', renderUsersTable);
    document.getElementById('users-filter-role')?.addEventListener('change', renderUsersTable);
    document.getElementById('users-filter-status')?.addEventListener('change', renderUsersTable);

    // Gerador de senha
    document.getElementById('btn-generate-password')?.addEventListener('click', () => {
      const pwdInput = document.getElementById('nu-password');
      if (pwdInput) pwdInput.value = generateStrongPassword();
    });

    // Copiar Senha
    document.getElementById('btn-copy-password')?.addEventListener('click', () => {
      const pwdInput = document.getElementById('nu-password');
      if (pwdInput && pwdInput.value) {
        navigator.clipboard.writeText(pwdInput.value).then(() => {
          App.UI.toast('Senha copiada para a área de transferência!', 'success');
        });
      }
    });

    // New User bindings
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

  return { init, loadUsers, openNewUserModal, closeNewUserModal };
})();
