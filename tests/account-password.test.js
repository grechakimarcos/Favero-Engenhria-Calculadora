'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const serviceSource = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'services', 'supabase.js'),
  'utf8'
);
const authSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'services', 'auth.js'), 'utf8');
const usersSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'users-ui.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function testAccountPanelStructure() {
  assert.match(authSource, /Informações da conta/);
  assert.match(authSource, /id="account-password-form"/);
  assert.match(authSource, /App\.Supabase\.changePassword\(currentPassword, newPassword\)/);
  assert.doesNotMatch(authSource, /Convidar novo usuário/);
  assert.doesNotMatch(authSource, /id="btn-create-user"/);
  assert.match(usersSource, /App\.Supabase\.signUp\(/);
  assert.match(authSource, /profile\.status === 'inativo'/);
  assert.match(authSource, /if \(!cloudData\?\.profile\)/);
  assert.match(authSource, /_trapAccountFocus\(e\)/);
  assert.match(indexSource, /id="account-panel"[^>]+role="dialog"[^>]+aria-modal="true"/s);
}

function createHarness(options = {}) {
  const calls = [];
  const sessionUser = {
    id: 'user-1',
    email: 'conta@favero.eng.br',
    created_at: '2026-01-02T10:00:00.000Z',
    last_sign_in_at: '2026-08-05T10:00:00.000Z',
    user_metadata: { display_name: 'Conta Teste' },
  };

  const client = {
    auth: {
      async getSession() {
        return { data: { session: { user: sessionUser } } };
      },
      async signInWithPassword(credentials) {
        calls.push({ type: 'reauth', credentials });
        if (options.reauthError) return { data: null, error: options.reauthError };
        return {
          data: { user: options.wrongUser ? { ...sessionUser, id: 'user-2' } : sessionUser },
          error: null,
        };
      },
      async updateUser(payload) {
        calls.push({ type: 'updatePassword', payload });
        if (options.updateError) return { data: null, error: options.updateError };
        return { data: { user: sessionUser }, error: null };
      },
    },
    async rpc(name, args) {
      calls.push({ type: 'rpc', name, args });
      return { data: null, error: null };
    },
    from(table) {
      if (table === 'profiles') {
        return {
          update(payload) {
            calls.push({ type: 'profileUpdate', payload });
            return {
              async eq(column, value) {
                calls.push({ type: 'profileMatch', column, value });
                if (options.profileThrow) throw options.profileThrow;
                return { error: options.profileError || null };
              },
            };
          },
        };
      }
      if (table === 'user_audit_logs') {
        return {
          async insert(rows) {
            calls.push({ type: 'audit', rows });
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const context = {
    window: {
      App: {},
      location: { origin: 'https://example.test', pathname: '/' },
      supabase: { createClient: () => client },
    },
    console: {
      log: console.log,
      error: console.error,
      debug: () => {},
      warn: (...args) => calls.push({ type: 'warning', args }),
    },
    Date,
    Error,
  };
  context.App = context.window.App;
  vm.runInNewContext(serviceSource, context, { filename: 'supabase.js' });
  return { api: context.window.App.Supabase, calls, sessionUser };
}

async function testSuccessfulChange() {
  const { api, calls, sessionUser } = createHarness();
  await api.getSession();

  const result = await api.changePassword('SenhaAtual1!', 'NovaSenha2!');
  assert.equal(result.error, null);
  assert.equal(calls[0].type, 'reauth');
  assert.equal(calls[0].credentials.email, sessionUser.email);
  assert.equal(calls[0].credentials.password, 'SenhaAtual1!');
  const passwordUpdate = calls.find(call => call.type === 'updatePassword');
  assert.equal(passwordUpdate.payload.password, 'NovaSenha2!');
  assert.equal(calls.some(call => call.type === 'rpc' && call.name === 'reset_failed_login'), true);
  assert.equal(calls.some(call => call.type === 'profileUpdate'), true);
  assert.equal(calls.some(call => call.type === 'audit'), true);
  assert.equal(api.getUserInfo().lastSignInAt, sessionUser.last_sign_in_at);
}

async function testInvalidCurrentPassword() {
  const { api, calls } = createHarness({ reauthError: new Error('Invalid login credentials') });
  await api.getSession();

  const result = await api.changePassword('incorreta', 'NovaSenha2!');
  assert.equal(result.reason, 'invalid_current_password');
  assert.equal(calls.some(call => call.type === 'updatePassword'), false);
  assert.equal(calls.some(call => call.type === 'profileUpdate'), false);
  assert.equal(calls.some(call => call.type === 'rpc' && call.name === 'log_failed_login'), true);
}

async function testRateLimitIsNotReportedAsWrongPassword() {
  const rateError = Object.assign(new Error('Too many requests'), { status: 429, code: 'over_request_rate_limit' });
  const { api, calls } = createHarness({ reauthError: rateError });
  await api.getSession();

  const result = await api.changePassword('SenhaAtual1!', 'NovaSenha2!');
  assert.equal(result.reason, 'rate_limited');
  assert.equal(calls.some(call => call.type === 'rpc' && call.name === 'log_failed_login'), false);
}

async function testUpdateFailureStopsMetadataWrites() {
  const { api, calls } = createHarness({ updateError: new Error('Password update failed') });
  await api.getSession();

  const result = await api.changePassword('SenhaAtual1!', 'NovaSenha2!');
  assert.equal(result.reason, 'update_failed');
  assert.equal(calls.some(call => call.type === 'profileUpdate'), false);
  assert.equal(calls.some(call => call.type === 'audit'), false);
}

async function testMetadataFailureDoesNotUndoPasswordSuccess() {
  const { api, calls } = createHarness({ profileThrow: new Error('Network metadata failure') });
  await api.getSession();

  const result = await api.changePassword('SenhaAtual1!', 'NovaSenha2!');
  assert.equal(result.error, null);
  assert.equal(result.profileError.message, 'Network metadata failure');
  assert.equal(calls.some(call => call.type === 'updatePassword'), true);
  assert.equal(calls.some(call => call.type === 'audit'), true);
}

(async () => {
  testAccountPanelStructure();
  await testSuccessfulChange();
  await testInvalidCurrentPassword();
  await testRateLimitIsNotReportedAsWrongPassword();
  await testUpdateFailureStopsMetadataWrites();
  await testMetadataFailureDoesNotUndoPasswordSuccess();
  console.log('Account password flow: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
