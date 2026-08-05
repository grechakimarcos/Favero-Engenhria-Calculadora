'use strict';
window.App = window.App || {};

/**
 * @module Supabase
 * Wrapper around the Supabase JS client.
 * Handles authentication and cloud data persistence.
 */
App.Supabase = (function () {

  // ── Credentials ─────────────────────────────────────────────────────────────
  const SUPABASE_URL = 'https://ntjfdratooodtxwgxxdw.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0TLsfHnDZzXbfzCgg-9IIg_ptRJnxEX';

  // ── Client ───────────────────────────────────────────────────────────────────
  let _client = null;
  let _currentUser = null;
  let _currentProfile = null;

  function _getClient() {
    if (!_client) {
      if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
        console.error('[Supabase] SDK not loaded yet.');
        return null;
      }
      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return _client;
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────

  /**
   * Sign in with email and password.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{user, error}>}
   */
  async function signIn(email, password) {
    const client = _getClient();
    if (!client) return { user: null, error: new Error('Supabase não inicializado.') };

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      await client.rpc('log_failed_login', { p_email: email });
      return { user: null, error };
    }
    
    if (data.user) {
      _currentUser = data.user;
      await client.rpc('reset_failed_login');
      await auditLog('login', { method: 'email_password' });
    }
    return { user: data?.user || null, error };
  }

  /**
   * Sign out current user.
   */
  async function signOut() {
    const client = _getClient();
    if (!client) return;
    if (_currentUser) {
      await auditLog('logout', { user: _currentUser.email });
    }
    await client.auth.signOut();
    _currentUser = null;
    _currentProfile = null;
  }

  /**
   * Get current session / user (checks persisted session).
   * @returns {Promise<object|null>}
   */
  async function getSession() {
    const client = _getClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    if (data?.session?.user) {
      _currentUser = data.session.user;
      return data.session.user;
    }
    _currentUser = null;
    _currentProfile = null;
    return null;
  }

  function getCurrentUser() {
    return _currentUser;
  }

  // ── Auth: Passwords & Audit ───────────────────────────────────────────────────
  
  async function auditLog(action, details = {}) {
    const client = _getClient();
    if (!client || !_currentUser) return;
    try {
      await client.from('user_audit_logs').insert([{
        user_id: _currentUser.id,
        action: action,
        details: details
      }]);
    } catch (e) {
      console.warn('[Audit] Erro ao registrar log', e);
    }
  }

  async function sendPasswordResetEmail(email) {
    const client = _getClient();
    if (!client) return { error: new Error('Supabase não inicializado') };
    const { data, error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    return { data, error };
  }

  async function updatePassword(newPassword) {
    const client = _getClient();
    if (!client || !_currentUser) return { error: new Error('Não autenticado') };
    
    const { data, error } = await client.auth.updateUser({ password: newPassword });
    if (!error) {
      _currentUser = data?.user || _currentUser;
      const changedAt = new Date().toISOString();
      // Atualiza metadado em profiles
      await client.from('profiles').update({
        must_change_password: false,
        password_changed_at: changedAt
      }).eq('id', _currentUser.id);
      if (_currentProfile) {
        _currentProfile.must_change_password = false;
        _currentProfile.password_changed_at = changedAt;
      }
      await auditLog('password_reset', { method: 'user_forced_change' });
    }
    return { data, error };
  }

  function _reauthFailureReason(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
      return 'invalid_current_password';
    }
    if (error?.status === 429 || code.includes('rate_limit') || code.includes('too_many')) {
      return 'rate_limited';
    }
    return 'reauthentication_failed';
  }

  async function _syncPasswordVerificationAttempts(client, succeeded, email) {
    try {
      if (succeeded) await client.rpc('reset_failed_login');
      else await client.rpc('log_failed_login', { p_email: email });
    } catch (error) {
      // Authentication remains authoritative even if the auxiliary audit RPC
      // is temporarily unavailable.
      console.warn('[Supabase] Falha ao atualizar tentativas de autenticação:', error.message);
    }
  }

  /**
   * Changes the password of the authenticated account after confirming the
   * current credential. Reauthentication prevents an unattended open session
   * from changing the account password without knowing the existing password.
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<{data?: object, error: object|null, reason?: string}>}
   */
  async function changePassword(currentPassword, newPassword) {
    const client = _getClient();
    if (!client || !_currentUser?.email) {
      return { error: new Error('Não autenticado'), reason: 'not_authenticated' };
    }

    const expectedUserId = _currentUser.id;
    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: _currentUser.email,
      password: currentPassword,
    });

    if (authError) {
      const reason = _reauthFailureReason(authError);
      if (reason === 'invalid_current_password') {
        await _syncPasswordVerificationAttempts(client, false, _currentUser.email);
      }
      return { error: authError, reason };
    }

    if (!authData?.user || authData.user.id !== expectedUserId) {
      return {
        error: new Error('Não foi possível confirmar a conta atual.'),
        reason: 'account_mismatch',
      };
    }

    _currentUser = authData.user;
    await _syncPasswordVerificationAttempts(client, true, _currentUser.email);
    const { data, error } = await client.auth.updateUser({ password: newPassword });
    if (error) return { data, error, reason: 'update_failed' };

    _currentUser = data?.user || _currentUser;
    const changedAt = new Date().toISOString();
    let profileError = null;
    try {
      const profileResult = await client
        .from('profiles')
        .update({
          must_change_password: false,
          password_changed_at: changedAt,
        })
        .eq('id', expectedUserId);
      profileError = profileResult.error || null;
    } catch (metadataError) {
      // The authentication password is already changed at this point. A
      // metadata/network failure must not report the password change as failed.
      profileError = metadataError;
    }

    if (profileError) {
      console.warn('[Supabase] Senha alterada, mas os metadados do perfil não foram atualizados:', profileError.message);
    } else if (_currentProfile) {
      _currentProfile.must_change_password = false;
      _currentProfile.password_changed_at = changedAt;
    }

    await auditLog('password_reset', { method: 'account_panel' });
    return { data, error: null, profileError: profileError || null };
  }

  // ── Data: Profiles (RBAC) ──────────────────────────────────────────────────
  async function loadProfile() {
    const client = _getClient();
    if (!client || !_currentUser) return null;
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', _currentUser.id)
      .maybeSingle();
    if (error) {
      _currentProfile = null;
      console.warn('[Supabase] loadProfile error:', error.message);
      return null;
    }
    _currentProfile = data;
    return data;
  }
  
  function getProfile() {
    return _currentProfile;
  }

  async function getAllProfiles() {
    const client = _getClient();
    if (!client || !_currentUser) return null;
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.warn('[Supabase] getAllProfiles error:', error.message);
      return null;
    }
    return (data || []).map(profile => (
      profile.id === _currentUser.id && !profile.email
        ? { ...profile, email: _currentUser.email || null }
        : profile
    ));
  }

  const PROFILE_ROLES = ['visitante', 'engenheiro', 'financeiro', 'comercial', 'gestor', 'admin'];
  const PROFILE_STATUSES = ['ativo', 'inativo', 'bloqueado', 'pendente'];

  function _profileText(value) {
    const text = value === null || value === undefined ? '' : String(value).trim();
    return text || null;
  }

  /**
   * Updates an existing profile using a strict allow-list. E-mail and security
   * metadata are intentionally excluded because they belong to Supabase Auth.
   */
  async function updateProfile(userId, changes) {
    const client = _getClient();
    if (!client || !_currentUser) return { data: null, error: new Error('Não autenticado.') };
    if (!userId) return { data: null, error: new Error('Usuário inválido.') };

    const input = changes || {};
    const editableFields = ['nome_completo', 'telefone', 'empresa', 'cargo', 'role', 'status'];
    const providedFields = editableFields.filter(field => Object.prototype.hasOwnProperty.call(input, field));
    if (providedFields.length === 0) {
      return { data: null, error: new Error('Nenhum campo editável foi informado.') };
    }
    const isOwnProfile = userId === _currentUser.id;
    if (isOwnProfile && providedFields.some(field => field === 'role' || field === 'status')) {
      return { data: null, error: new Error('O próprio perfil e status não podem ser alterados por esta tela.') };
    }

    const updates = { updated_at: new Date().toISOString() };

    if (Object.prototype.hasOwnProperty.call(input, 'nome_completo')) {
      updates.nome_completo = _profileText(input.nome_completo);
      if (!updates.nome_completo || updates.nome_completo.length < 2) {
        return { data: null, error: new Error('Informe o nome completo.') };
      }
      if (updates.nome_completo.length > 100) {
        return { data: null, error: new Error('O nome deve ter no máximo 100 caracteres.') };
      }
    }
    if (Object.prototype.hasOwnProperty.call(input, 'telefone')) {
      updates.telefone = _profileText(input.telefone);
      if (updates.telefone?.length > 30) {
        return { data: null, error: new Error('O telefone deve ter no máximo 30 caracteres.') };
      }
    }
    if (Object.prototype.hasOwnProperty.call(input, 'empresa')) {
      updates.empresa = _profileText(input.empresa);
      if (updates.empresa?.length > 100) {
        return { data: null, error: new Error('A empresa deve ter no máximo 100 caracteres.') };
      }
    }
    if (Object.prototype.hasOwnProperty.call(input, 'cargo')) {
      updates.cargo = _profileText(input.cargo);
      if (updates.cargo?.length > 100) {
        return { data: null, error: new Error('O cargo deve ter no máximo 100 caracteres.') };
      }
    }

    if (Object.prototype.hasOwnProperty.call(input, 'role')) {
      const role = String(input.role || '').toLowerCase().trim();
      if (!PROFILE_ROLES.includes(role)) return { data: null, error: new Error('Perfil de acesso inválido.') };
      updates.role = role;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'status')) {
      const status = String(input.status || '').toLowerCase().trim();
      if (!PROFILE_STATUSES.includes(status)) return { data: null, error: new Error('Status de usuário inválido.') };
      updates.failed_login_attempts = 0;
      if (status === 'bloqueado') {
        const lockEnd = new Date();
        lockEnd.setFullYear(lockEnd.getFullYear() + 10);
        updates.status = 'ativo';
        updates.locked_until = lockEnd.toISOString();
        updates.must_change_password = false;
      } else if (status === 'pendente') {
        updates.status = 'ativo';
        updates.locked_until = null;
        updates.must_change_password = true;
      } else {
        updates.status = status;
        updates.locked_until = null;
        updates.must_change_password = false;
      }
    }

    let response;
    try {
      response = await client.from('profiles').update(updates).eq('id', userId).select();
    } catch (error) {
      return { data: null, error };
    }
    if (response.error) return { data: response.data || null, error: response.error };
    const updatedProfile = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!updatedProfile) return { data: null, error: new Error('Perfil não encontrado ou sem permissão para editar.') };

    if (_currentProfile?.id === userId) _currentProfile = { ..._currentProfile, ...updatedProfile };
    await auditLog('profile_updated', {
      target_user_id: userId,
      fields: Object.keys(updates).filter(field => field !== 'updated_at'),
    });
    return { data: updatedProfile, error: null };
  }

  async function updateProfileRole(userId, newRole) {
    return updateProfile(userId, { role: newRole });
  }

  async function updateProfileStatus(userId, newStatus) {
    return updateProfile(userId, { status: newStatus });
  }

  async function deleteProfile(userId) {
    const client = _getClient();
    if (!client) return { error: { message: 'No client' } };
    
    // Utilizamos uma função RPC (delete_user_admin) para excluir o usuário da tabela auth.users.
    // Isso garante que o login seja revogado e o perfil seja excluído via CASCADE.
    const { data, error } = await client.rpc('delete_user_admin', { target_user_id: userId });
      
    return { data, error };
  }


  // ── Data: Settings ───────────────────────────────────────────────────────────

  async function loadSettings() {
    const client = _getClient();
    if (!client || !_currentUser) return null;
    const { data, error } = await client
      .from('settings')
      .select('*')
      .eq('user_id', _currentUser.id)
      .maybeSingle();
    if (error) { console.warn('[Supabase] loadSettings error:', error.message); return null; }
    return data;
  }

  async function saveSettings(settings) {
    const client = _getClient();
    if (!client || !_currentUser) return false;
    const payload = {
      user_id: _currentUser.id,
      meta_mensal: settings.metaMensal,
      imposto_simples: settings.impostoSimples,
      multiplicador_minimo: settings.multiplicadorMinimo,
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from('settings').upsert(payload, { onConflict: 'user_id' });
    if (error) { console.warn('[Supabase] saveSettings error:', error.message); return false; }
    return true;
  }

  // ── Data: Collaborators ───────────────────────────────────────────────────────

  async function loadCollaborators() {
    const client = _getClient();
    if (!client) return null;
    const { data, error } = await client
      .from('config_colaboradores')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) { console.warn('[Supabase] loadCollaborators error:', error.message); return null; }
    if (!data || data.length === 0) return null;
    return data.map(r => ({
      // Generate a stable slug-based id from the name so team references still work.
      // e.g., "Reinaldo" → "reinaldo", "Engenheiro Pleno" → uses the DB uuid as fallback
      id: r.nome
        ? r.nome.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
            .replace(/\s+/g, '_')                              // spaces → underscores
            .replace(/[^a-z0-9_]/g, '')                       // strip special chars
        : r.id,
      dbId: r.id, // keep the real UUID for DB operations
      nome: r.nome,
      cargo: r.cargo,
      custoMensal: r.custo_mensal,
      horasMensais: r.horas_mensais,
      produtividade: r.produtividade,
    }));
  }

  async function saveCollaborators(collaborators) {
    const client = _getClient();
    if (!client || !_currentUser) return false;

    if (!collaborators || collaborators.length === 0) return true;

    // Use upsert on the unique 'nome' column to avoid duplicates.
    const rows = collaborators.map(c => ({
      ...(c.dbId ? { id: c.dbId } : {}), // include real UUID if we have it
      nome: c.nome,
      cargo: c.cargo,
      custo_mensal: c.custoMensal,
      horas_mensais: c.horasMensais,
      produtividade: c.produtividade,
    }));
    const { error } = await client.from('config_colaboradores').upsert(rows, { onConflict: 'nome' });
    if (error) { console.warn('[Supabase] saveCollaborators error:', error.message); return false; }
    return true;
  }

  // ── Data: Indirect Costs ─────────────────────────────────────────────────────

  async function loadIndirectCosts() {
    const client = _getClient();
    if (!client) return null;
    const { data, error } = await client
      .from('config_custos_indiretos')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) { console.warn('[Supabase] loadIndirectCosts error:', error.message); return null; }
    if (!data || data.length === 0) return null;
    return data.map(r => ({ id: r.id, nome: r.nome, valor: r.valor }));
  }

  async function saveIndirectCosts(costs) {
    const client = _getClient();
    if (!client || !_currentUser) return false;

    if (!costs || costs.length === 0) return true;
    const rows = costs.map(c => ({
      ...(c.id && !c.id.startsWith('legacy') ? { id: c.id } : {}),
      nome: c.nome,
      valor: c.valor,
    }));
    // Upsert on unique 'nome' to prevent duplicates
    const { error } = await client.from('config_custos_indiretos').upsert(rows, { onConflict: 'nome' });
    if (error) { console.warn('[Supabase] saveIndirectCosts error:', error.message); return false; }
    return true;
  }

  // ── Data: Disciplinas ────────────────────────────────────────────────────────
  
  async function loadDisciplinas() {
    const client = _getClient();
    if (!client) return null;
    const { data, error } = await client
      .from('config_disciplinas')
      .select('*');
    if (error) { console.warn('[Supabase] loadDisciplinas error:', error.message); return null; }
    if (!data || data.length === 0) return null;
    
    const dic = {};
    data.forEach(d => {
      dic[d.key] = {
        nome: d.nome,
        areaRef: parseFloat(d.area_ref),
        horasRef: parseFloat(d.horas_ref),
        valorBase: parseFloat(d.valor_base),
        ticketMinimo: parseFloat(d.ticket_minimo),
      };
    });
    return dic;
  }

  async function saveDisciplinas(disciplinas) {
    const client = _getClient();
    if (!client || !_currentUser || !disciplinas) return false;
    
    const rows = Object.entries(disciplinas).map(([key, d]) => ({
      key: key,
      nome: d.nome,
      area_ref: d.areaRef,
      horas_ref: d.horasRef,
      valor_base: d.valorBase,
      ticket_minimo: d.ticketMinimo,
    }));
    
    const { error } = await client.from('config_disciplinas').upsert(rows, { onConflict: 'key' });
    if (error) { console.warn('[Supabase] saveDisciplinas error:', error.message); return false; }
    return true;
  }

  // ── Data: History (Cloud First) ──────────────────────────────────────────────

  async function fetchHistory() {
    const client = _getClient();
    if (!client || !_currentUser) return null;
    const { data, error } = await client
      .from('projetos_historico')
      .select('*')
      .order('saved_at', { ascending: false });
    if (error) { console.warn('[Supabase] fetchHistory error:', error.message); return null; }
    
    // Map cloud schema back to JS app schema
    return (data || []).map(r => ({
      id: r.id,
      savedAt: r.saved_at,
      project: r.project_data,
      team: r.team_data,
      costs: r.costs_data,
      settings: r.settings_data,
      result: r.result_data,
      aiPayload: r.ai_payload
    }));
  }

  async function saveProjectHistory(entry) {
    const client = _getClient();
    if (!client || !_currentUser) return false;
    
    const row = {
      id: entry.id,
      user_id: _currentUser.id,
      saved_at: entry.savedAt,
      project_data: entry.project,
      team_data: entry.team,
      costs_data: entry.costs,
      settings_data: entry.settings,
      result_data: entry.result,
      ai_payload: entry.aiPayload
    };
    
    const { error } = await client.from('projetos_historico').insert(row);
    if (error) { console.warn('[Supabase] saveProjectHistory error:', error.message); return false; }
    return true;
  }

  async function deleteProjectHistory(id) {
    const client = _getClient();
    if (!client || !_currentUser) return false;
    
    const { error } = await client.from('projetos_historico').delete().eq('id', id);
    if (error) { console.warn('[Supabase] deleteProjectHistory error:', error.message); return false; }
    return true;
  }

  async function updateProjectRealizedHours(id, horas) {
    const client = _getClient();
    if (!client || !_currentUser) return false;
    
    // As jsonb updates require reading first or complex sql, we can use an RPC or just update the whole ai_payload.
    // For simplicity, we fetch the row first, then update it.
    const { data } = await client.from('projetos_historico').select('ai_payload').eq('id', id).single();
    if (!data) return false;
    
    const newPayload = { ...data.ai_payload, horasRealizadas: horas };
    const { error } = await client.from('projetos_historico').update({ ai_payload: newPayload }).eq('id', id);
    if (error) { console.warn('[Supabase] updateRealizedHours error:', error.message); return false; }
    return true;
  }

  // ── Full Cloud Sync ──────────────────────────────────────────────────────────

  /**
   * Loads all user data from Supabase and merges into Store.
   * Called after successful login.
   */
  async function loadAllFromCloud() {
    const [profile, settings, collaborators, indirectCosts, history, disciplinas] = await Promise.all([
      loadProfile(),
      loadSettings(),
      loadCollaborators(),
      loadIndirectCosts(),
      fetchHistory(),
      loadDisciplinas(),
    ]);
    return { profile, settings, collaborators, indirectCosts, history, disciplinas };
  }

  /**
   * Saves current Store data to Supabase.
   * History is not saved in bulk anymore.
   * @param {object} state - App.Store.getState()
   */
  async function saveAllToCloud(state) {
    const results = await Promise.all([
      saveSettings(state.settings),
      saveCollaborators(state.collaborators),
      saveIndirectCosts(state.indirectCosts),
      saveDisciplinas(state.disciplinas),
    ]);
    return results.every(Boolean);
  }

  // ── Auth: Create User ────────────────────────────────────────────

  /**
   * Creates a new user via Supabase signUp.
   * Note: if "Confirm email" is enabled in Supabase, a confirmation
   * email is sent. Disable it in Dashboard → Auth → Settings for
   * immediate access (recommended for internal tools).
   * @param {string} email
   * @param {string} password
   * @param {string} [displayName]
   * @returns {Promise<{user, error}>}
   */
  async function signUp(email, password, displayName) {
    const client = _getClient();
    if (!client) return { user: null, error: new Error('Supabase não inicializado.') };
    const options = displayName ? { data: { display_name: displayName } } : {};
    // Um cliente isolado evita que o cadastro substitua a sessao atual do
    // administrador quando a confirmacao de e-mail estiver desativada.
    const isolatedClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data, error } = await isolatedClient.auth.signUp({ email, password, options });
    return { user: data?.user || null, error };
  }

  /**
   * Returns the currently logged-in user's metadata so we can show info
   * about the account without requiring the admin API.
   */
  function getUserInfo() {
    return _currentUser ? {
      id:    _currentUser.id,
      email: _currentUser.email,
      name:  _currentUser.user_metadata?.display_name || _currentUser.email.split('@')[0],
      createdAt: _currentUser.created_at,
      lastSignInAt: _currentUser.last_sign_in_at,
    } : null;
  }

  // ── Public API ──────────────────────────────────────────────────
  return {
    signIn,
    signOut,
    signUp,
    getSession,
    getCurrentUser,
    getUserInfo,
    loadProfile,
    getProfile,
    getAllProfiles,
    updateProfile,
    updateProfileRole,
    updateProfileStatus,
    deleteProfile,
    loadAllFromCloud,
    saveAllToCloud,
    saveSettings,
    saveCollaborators,
    saveIndirectCosts,
    fetchHistory,
    saveProjectHistory,
    deleteProjectHistory,
    updateProjectRealizedHours,
    auditLog,
    sendPasswordResetEmail,
    updatePassword,
    changePassword,
  };
})();
