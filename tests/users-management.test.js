'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.join(__dirname, '..');
const usersSource = fs.readFileSync(
  path.join(projectRoot, 'js', 'views', 'users-ui.js'),
  'utf8',
);
const indexSource = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

function createUsersUIHarness() {
  const context = {
    window: { App: {} },
    console,
    Date,
  };
  context.App = context.window.App;
  vm.runInNewContext(usersSource, context, { filename: 'js/views/users-ui.js' });
  return context.window.App.UsersUI;
}

function toLocal(value) {
  return JSON.parse(JSON.stringify(value));
}

function allowedIds(definition) {
  return definition.permissions
    .filter(permission => permission.allowed)
    .map(permission => permission.id);
}

function assertSingleId(id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const occurrences = indexSource.match(new RegExp(`id=["']${escaped}["']`, 'g')) || [];
  assert.equal(occurrences.length, 1, `o ID #${id} deve existir exatamente uma vez`);
}

const UsersUI = createUsersUIHarness();

test('expõe os helpers públicos de perfil e status', () => {
  assert.equal(typeof UsersUI.getRoleDefinition, 'function');
  assert.equal(typeof UsersUI.getComputedStatus, 'function');
});

test('administrador possui os sete acessos da matriz', () => {
  const definition = toLocal(UsersUI.getRoleDefinition('admin'));
  assert.equal(definition.id, 'admin');
  assert.equal(definition.label, 'Administrador');
  assert.equal(definition.permissions.length, 7);
  assert.deepEqual(allowedIds(definition), [
    'calculator',
    'financial',
    'client_pdf',
    'own_history',
    'team_history',
    'settings',
    'users',
  ]);
  assert.equal(definition.permissions.every(permission => permission.allowed), true);
});

test('os cinco perfis operacionais possuem somente os quatro acessos atuais', () => {
  const operationalRoles = ['gestor', 'engenheiro', 'financeiro', 'comercial', 'visitante'];
  const expectedAllowed = ['calculator', 'financial', 'client_pdf', 'own_history'];
  const expectedDenied = ['team_history', 'settings', 'users'];

  operationalRoles.forEach(role => {
    const definition = toLocal(UsersUI.getRoleDefinition(role));
    assert.equal(definition.id, role);
    assert.equal(definition.permissions.length, 7, `${role} deve participar de toda a matriz`);
    assert.deepEqual(allowedIds(definition), expectedAllowed, `${role} recebeu acessos diferentes do contrato atual`);
    assert.deepEqual(
      definition.permissions.filter(permission => !permission.allowed).map(permission => permission.id),
      expectedDenied,
      `${role} não deve receber privilégios administrativos`,
    );
  });
});

test('role desconhecida usa visitante como fallback seguro', () => {
  const fallback = toLocal(UsersUI.getRoleDefinition('super-admin-inexistente'));
  const visitor = toLocal(UsersUI.getRoleDefinition('visitante'));

  assert.equal(fallback.id, 'visitante');
  assert.equal(fallback.label, 'Visitante');
  assert.deepEqual(fallback, visitor);
  assert.equal(UsersUI.getRoleDefinition(null).id, 'visitante');
  assert.equal(UsersUI.getRoleDefinition('ADMIN').id, 'admin');
});

test('status calculado respeita a prioridade inativo, bloqueado, pendente e ativo', () => {
  const futureLock = '2999-12-31T23:59:59.000Z';
  const expiredLock = '2000-01-01T00:00:00.000Z';

  assert.equal(UsersUI.getComputedStatus({
    status: 'inativo',
    locked_until: futureLock,
    must_change_password: true,
  }), 'inativo', 'inativo deve prevalecer sobre bloqueio e primeiro acesso');

  assert.equal(UsersUI.getComputedStatus({
    status: 'ativo',
    locked_until: futureLock,
    must_change_password: true,
  }), 'bloqueado', 'bloqueio vigente deve prevalecer sobre primeiro acesso');

  assert.equal(UsersUI.getComputedStatus({
    status: 'ativo',
    locked_until: expiredLock,
    must_change_password: true,
  }), 'pendente', 'bloqueio expirado não deve ocultar a troca de senha pendente');

  assert.equal(UsersUI.getComputedStatus({
    status: 'ativo',
    locked_until: null,
    must_change_password: false,
  }), 'ativo');
  assert.equal(UsersUI.getComputedStatus({}), 'ativo');
  assert.equal(UsersUI.getComputedStatus(null), 'ativo');
});

test('HTML contém uma única matriz e todos os IDs contratuais do modal de edição', () => {
  [
    'users-permissions-title',
    'users-permissions-matrix',
    'users-permissions-note',
    'user-edit-overlay',
    'user-edit-modal',
    'user-edit-title',
    'user-edit-description',
    'btn-user-edit-close',
    'user-edit-form',
    'eu-id',
    'eu-email',
    'eu-name',
    'eu-phone',
    'eu-company',
    'eu-job-title',
    'eu-role',
    'eu-status',
    'eu-role-preview',
    'eu-self-warning',
    'user-edit-feedback',
    'btn-cancel-user-edit',
    'btn-user-edit-submit',
  ].forEach(assertSingleId);

  assert.match(
    indexSource,
    /id="user-edit-overlay"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="user-edit-title"[^>]*aria-describedby="user-edit-description"/s,
  );
  assert.match(indexSource, /id="users-permissions-matrix"[^>]*role="region"/s);
  assert.match(indexSource, /id="eu-email"[^>]*readonly[^>]*aria-readonly="true"/s);
  assert.match(indexSource, /id="user-edit-feedback"[^>]*role="status"[^>]*aria-live="polite"/s);
});

test('gestão de usuários não depende mais de window.prompt', () => {
  assert.doesNotMatch(usersSource, /\bwindow\s*\.\s*prompt\s*\(/);
});

test('senha provisória usa aleatoriedade criptográfica do navegador', () => {
  assert.match(usersSource, /crypto\?\.getRandomValues|crypto\.getRandomValues/);
  assert.doesNotMatch(usersSource, /Math\.random\s*\(/);
});
