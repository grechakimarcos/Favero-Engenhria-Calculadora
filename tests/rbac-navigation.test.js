'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.join(__dirname, '..');
const authSource = fs.readFileSync(
  path.join(projectRoot, 'js', 'services', 'auth.js'),
  'utf8',
);
const routerSource = fs.readFileSync(path.join(projectRoot, 'js', 'router.js'), 'utf8');

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(...names) {
    names.forEach(name => this.values.add(name));
  }

  remove(...names) {
    names.forEach(name => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    const shouldAdd = force === undefined ? !this.values.has(name) : Boolean(force);
    if (shouldAdd) this.values.add(name);
    else this.values.delete(name);
    return shouldAdd;
  }
}

class FakeElement {
  constructor({ id = '', dataView = null, label = '', active = false } = {}) {
    this.id = id;
    this.dataView = dataView;
    this.label = label;
    this.textContent = '';
    this.style = {};
    this.classList = new FakeClassList(active ? ['active'] : []);
  }

  getAttribute(name) {
    if (name === 'data-view') return this.dataView;
    return null;
  }

  querySelector(selector) {
    if (selector === '.nav-label') return { textContent: this.label };
    return null;
  }
}

function createHarness(initialRole = 'engenheiro') {
  let currentProfile = { role: initialRole };
  const toastCalls = [];
  const animationCalls = [];

  const navItems = [
    new FakeElement({ dataView: 'calculator', label: 'Calculadora', active: true }),
    new FakeElement({ dataView: 'historico', label: 'Histórico' }),
    new FakeElement({ dataView: 'usuarios', label: 'Gestão de Usuários' }),
    new FakeElement({ dataView: 'parametros', label: 'Parâmetros' }),
  ];
  const views = [
    new FakeElement({ id: 'view-calculator', active: true }),
    new FakeElement({ id: 'view-historico' }),
    new FakeElement({ id: 'view-usuarios' }),
    new FakeElement({ id: 'view-parametros' }),
  ];
  const title = new FakeElement({ id: 'active-view-title' });
  title.textContent = 'Calculadora';

  const elementsById = new Map([
    ['active-view-title', title],
  ]);
  const document = {
    body: new FakeElement({ id: 'body' }),
    getElementById(id) {
      return elementsById.get(id) || null;
    },
    querySelectorAll(selector) {
      if (selector === '.nav-item[data-view]') return navItems;
      if (selector === '.view') return views;
      return [];
    },
    querySelector(selector) {
      const navMatch = selector.match(/^\.nav-item\[data-view="([^"]+)"\] \.nav-label$/);
      if (navMatch) return navItems.find(item => item.dataView === navMatch[1])?.querySelector('.nav-label') || null;
      if (selector === '.view.active') return views.find(view => view.classList.contains('active')) || null;
      return null;
    },
  };

  const App = {
    Supabase: {
      getProfile: () => currentProfile,
    },
    UI: {
      toast: (...args) => toastCalls.push(args),
    },
  };
  const context = {
    window: { App },
    App,
    document,
    console: {
      log: () => {},
      error: () => {},
      debug: () => {},
      warn: () => {},
    },
    Date,
    Error,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) {
      animationCalls.push(callback);
      callback();
    },
  };

  vm.runInNewContext(authSource, context, { filename: 'js/services/auth.js' });
  vm.runInNewContext(routerSource, context, { filename: 'js/router.js' });

  return {
    App,
    navItems,
    views,
    title,
    toastCalls,
    animationCalls,
    setRole(role) {
      currentProfile = { role };
    },
  };
}

function navigationSnapshot(harness) {
  return {
    nav: harness.navItems.map(item => [item.dataView, item.classList.contains('active')]),
    views: harness.views.map(view => [view.id, view.classList.contains('active')]),
    title: harness.title.textContent,
  };
}

test('Auth.canAccessView permite áreas comuns para qualquer perfil', () => {
  const { App } = createHarness();
  const profiles = [
    { role: 'admin' },
    { role: 'gestor' },
    { role: 'engenheiro' },
    { role: 'financeiro' },
    { role: 'comercial' },
    { role: 'visitante' },
    null,
  ];

  profiles.forEach(profile => {
    assert.equal(App.Auth.canAccessView('calculator', profile), true);
    assert.equal(App.Auth.canAccessView('historico', profile), true);
  });
});

test('Auth.canAccessView restringe usuários e parâmetros exclusivamente a admin', () => {
  const { App, setRole } = createHarness();
  const restrictedViews = ['usuarios', 'parametros'];
  const nonAdminRoles = ['gestor', 'engenheiro', 'financeiro', 'comercial', 'visitante'];

  restrictedViews.forEach(viewId => {
    assert.equal(App.Auth.canAccessView(viewId, { role: 'admin' }), true);
    nonAdminRoles.forEach(role => {
      assert.equal(App.Auth.canAccessView(viewId, { role }), false, `${role} não pode acessar ${viewId}`);
    });
    assert.equal(App.Auth.canAccessView(viewId, { role: 'desconhecida' }), false);
  });

  setRole('admin');
  assert.equal(App.Auth.canAccessView('usuarios'), true, 'sem perfil explícito deve consultar o perfil atual');
  setRole('engenheiro');
  assert.equal(App.Auth.canAccessView('usuarios'), false);
});

test('Router.navigate não altera DOM nem estado de navegação quando usuários é negado', () => {
  const harness = createHarness('engenheiro');
  const before = navigationSnapshot(harness);

  const denied = harness.App.Router.navigate('usuarios');

  assert.equal(denied, false);
  assert.deepEqual(navigationSnapshot(harness), before);
  assert.deepEqual(harness.toastCalls, [['Seu perfil não possui acesso a esta área.', 'error']]);
  assert.equal(harness.animationCalls.length, 0);

  harness.setRole('admin');
  const allowedAfterDenial = harness.App.Router.navigate('usuarios');
  assert.equal(allowedAfterDenial, true, 'a negativa não pode marcar internamente a view como ativa');
  assert.equal(harness.navItems.find(item => item.dataView === 'usuarios').classList.contains('active'), true);
  assert.equal(harness.views.find(view => view.id === 'view-usuarios').classList.contains('active'), true);
  assert.equal(harness.title.textContent, 'Gestão de Usuários');
});

test('Router.navigate bloqueia parâmetros antes de qualquer efeito colateral', () => {
  const harness = createHarness('visitante');
  let settingsRenderCalls = 0;
  harness.App.SettingsUI = {
    render() {
      settingsRenderCalls += 1;
    },
  };
  const before = navigationSnapshot(harness);

  const denied = harness.App.Router.navigate('parametros');

  assert.equal(denied, false);
  assert.deepEqual(navigationSnapshot(harness), before);
  assert.equal(settingsRenderCalls, 0);
  assert.equal(harness.animationCalls.length, 0);
  assert.deepEqual(harness.toastCalls, [['Seu perfil não possui acesso a esta área.', 'error']]);
});
