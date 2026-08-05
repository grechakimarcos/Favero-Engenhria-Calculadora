'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const serviceSource = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'services', 'supabase.js'),
  'utf8'
);

const FIXED_NOW = '2026-08-05T12:00:00.000Z';

class FixedDate extends Date {
  constructor(...args) {
    super(args.length > 0 ? args[0] : FIXED_NOW);
  }

  static now() {
    return new Date(FIXED_NOW).getTime();
  }
}

function createHarness(options = {}) {
  const calls = [];
  const sessionUser = {
    id: 'user-1',
    email: 'admin@favero.eng.br',
    user_metadata: { display_name: 'Administrador' },
  };
  const currentProfile = options.currentProfile || {
    id: sessionUser.id,
    nome_completo: 'Nome Original',
    empresa: 'Empresa Original',
    role: 'admin',
    status: 'ativo',
  };

  const client = {
    auth: {
      async getSession() {
        return { data: { session: { user: sessionUser } } };
      },
    },
    async rpc(name, args) {
      calls.push({ type: 'rpc', name, args });
      return { data: null, error: null };
    },
    from(table) {
      if (table === 'profiles') {
        return {
          select(columns) {
            calls.push({ type: 'profileSelect', columns });
            return {
              eq(column, value) {
                calls.push({ type: 'profileSelectMatch', column, value });
                return {
                  async maybeSingle() {
                    return {
                      data: options.loadProfileData === undefined
                        ? currentProfile
                        : options.loadProfileData,
                      error: options.loadProfileError || null,
                    };
                  },
                };
              },
            };
          },
          update(payload) {
            calls.push({ type: 'profileUpdate', payload });
            return {
              eq(column, value) {
                calls.push({ type: 'profileUpdateMatch', column, value });
                return {
                  async select() {
                    calls.push({ type: 'profileUpdateSelect' });
                    if (options.updateThrow) throw options.updateThrow;
                    if (options.updateResponse) return options.updateResponse;
                    return { data: [{ id: value, ...payload }], error: null };
                  },
                };
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
    Date: FixedDate,
    Error,
  };
  context.App = context.window.App;
  vm.runInNewContext(serviceSource, context, { filename: 'supabase.js' });

  return { api: context.window.App.Supabase, calls, sessionUser, currentProfile };
}

async function authenticate(api) {
  const user = await api.getSession();
  assert.equal(user.id, 'user-1');
}

function updateCall(calls) {
  return calls.find(call => call.type === 'profileUpdate');
}

async function testAllowListTrimAndNullNormalization() {
  const { api, calls } = createHarness();
  await authenticate(api);

  const result = await api.updateProfile('user-2', {
    nome_completo: '  Maria da Silva  ',
    telefone: '   ',
    empresa: '  Fávero Engenharia  ',
    cargo: null,
    role: '  GESTOR  ',
    email: 'nao-pode-alterar@example.test',
    id: 'outro-id',
    locked_until: '2099-01-01T00:00:00.000Z',
    failed_login_attempts: 99,
    must_change_password: true,
    password_changed_at: '2099-01-01T00:00:00.000Z',
    campo_desconhecido: 'ignorar',
  });

  assert.equal(result.error, null);
  const payload = updateCall(calls).payload;
  assert.equal(payload.nome_completo, 'Maria da Silva');
  assert.equal(payload.telefone, null);
  assert.equal(payload.empresa, 'Fávero Engenharia');
  assert.equal(payload.cargo, null);
  assert.equal(payload.role, 'gestor');
  assert.equal(payload.updated_at, FIXED_NOW);

  for (const forbidden of [
    'email', 'id', 'locked_until', 'failed_login_attempts',
    'must_change_password', 'password_changed_at', 'campo_desconhecido',
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(payload, forbidden), false, forbidden);
  }

  const audit = calls.find(call => call.type === 'audit');
  assert.equal(audit.rows[0].action, 'profile_updated');
  assert.deepEqual(
    [...audit.rows[0].details.fields].sort(),
    ['cargo', 'empresa', 'nome_completo', 'role', 'telefone'].sort()
  );
}

async function testValidationRejectsInvalidInputs() {
  const cases = [
    {
      changes: { nome_completo: '   ' },
      message: /Informe o nome completo/,
    },
    {
      changes: { role: 'super-admin' },
      message: /Perfil de acesso inválido/,
    },
    {
      changes: { status: 'suspenso' },
      message: /Status de usuário inválido/,
    },
    {
      changes: { email: 'campo-nao-editavel@example.test' },
      message: /Nenhum campo editável foi informado/,
    },
    {
      changes: { nome_completo: 'N'.repeat(101) },
      message: /no máximo 100 caracteres/,
    },
    {
      changes: { telefone: '1'.repeat(31) },
      message: /no máximo 30 caracteres/,
    },
  ];

  for (const testCase of cases) {
    const { api, calls } = createHarness();
    await authenticate(api);
    const result = await api.updateProfile('user-2', testCase.changes);
    assert.equal(result.data, null);
    assert.match(result.error.message, testCase.message);
    assert.equal(updateCall(calls), undefined);
    assert.equal(calls.some(call => call.type === 'audit'), false);
  }
}

async function testOwnPrivilegesAreProtected() {
  for (const changes of [{ role: 'visitante' }, { status: 'inativo' }]) {
    const { api, calls } = createHarness();
    await authenticate(api);

    const result = await api.updateProfile('user-1', changes);
    assert.equal(result.data, null);
    assert.match(result.error.message, /próprio perfil e status não podem ser alterados/);
    assert.equal(updateCall(calls), undefined);
    assert.equal(calls.some(call => call.type === 'audit'), false);
  }
}

async function testStatusMappings() {
  const cases = [
    {
      input: '  ATIVO  ',
      expected: {
        status: 'ativo',
        locked_until: null,
        must_change_password: false,
      },
    },
    {
      input: 'INATIVO',
      expected: {
        status: 'inativo',
        locked_until: null,
        must_change_password: false,
      },
    },
    {
      input: 'pendente',
      expected: {
        status: 'ativo',
        locked_until: null,
        must_change_password: true,
      },
    },
    {
      input: 'bloqueado',
      expected: {
        status: 'ativo',
        locked_until: '2036-08-05T12:00:00.000Z',
        must_change_password: false,
      },
    },
  ];

  for (const testCase of cases) {
    const { api, calls } = createHarness();
    await authenticate(api);
    const result = await api.updateProfile('user-2', { status: testCase.input });
    assert.equal(result.error, null);

    const payload = updateCall(calls).payload;
    assert.equal(payload.status, testCase.expected.status);
    assert.equal(payload.locked_until, testCase.expected.locked_until);
    assert.equal(payload.must_change_password, testCase.expected.must_change_password);
    assert.equal(payload.failed_login_attempts, 0);
  }
}

async function testZeroRowsIsReportedAsFailure() {
  const { api, calls } = createHarness({
    updateResponse: { data: [], error: null },
  });
  await authenticate(api);

  const result = await api.updateProfile('missing-user', { empresa: 'Empresa' });
  assert.equal(result.data, null);
  assert.match(result.error.message, /Perfil não encontrado ou sem permissão para editar/);
  assert.equal(calls.some(call => call.type === 'audit'), false);
}

async function testNetworkExceptionIsReturned() {
  const networkError = new Error('Network unavailable');
  const { api, calls } = createHarness({ updateThrow: networkError });
  await authenticate(api);

  const result = await api.updateProfile('user-2', { empresa: 'Empresa' });
  assert.equal(result.data, null);
  assert.equal(result.error, networkError);
  assert.equal(calls.some(call => call.type === 'audit'), false);
}

async function testCurrentProfileIsUpdatedAfterSuccess() {
  const { api } = createHarness();
  await authenticate(api);
  await api.loadProfile();

  const result = await api.updateProfile('user-1', {
    nome_completo: '  Nome Atualizado  ',
    telefone: '  (11) 99999-0000  ',
  });

  assert.equal(result.error, null);
  assert.equal(api.getProfile().nome_completo, 'Nome Atualizado');
  assert.equal(api.getProfile().telefone, '(11) 99999-0000');
  assert.equal(api.getProfile().empresa, 'Empresa Original');
  assert.equal(api.getProfile().role, 'admin');
}

(async () => {
  await testAllowListTrimAndNullNormalization();
  await testValidationRejectsInvalidInputs();
  await testOwnPrivilegesAreProtected();
  await testStatusMappings();
  await testZeroRowsIsReportedAsFailure();
  await testNetworkExceptionIsReturned();
  await testCurrentProfileIsUpdatedAfterSuccess();
  console.log('Profile update service: OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
