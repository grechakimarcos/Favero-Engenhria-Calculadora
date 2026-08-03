/**
 * @module Router
 * Handles SPA routing and Sidebar toggling.
 */

window.App = window.App || {};

App.Router = (function () {
  let _activeView = 'calculator';

  function init() {
    // Bind Sidebar toggle
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('app-sidebar');

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        // Rotate the icon as visual feedback
        const svg = toggleBtn.querySelector('svg');
        if (svg) svg.style.transform = sidebar.classList.contains('collapsed') ? 'rotate(90deg)' : '';
      });
    }

    // Bind Navigation items
    const navItems = document.querySelectorAll('.nav-item[data-view]');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = item.getAttribute('data-view');
        if (viewId) navigate(viewId);
      });
    });
  }

  function navigate(viewId) {
    if (_activeView === viewId) return;

    // Update Nav
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-view') === viewId);
    });

    // Update Views
    document.querySelectorAll('.view').forEach(view => {
      view.classList.toggle('active', view.id === `view-${viewId}`);
    });

    // Update Header Title
    const titleEl = document.getElementById('active-view-title');
    if (titleEl) {
      const activeNav = document.querySelector(`.nav-item[data-view="${viewId}"] .nav-label`);
      titleEl.textContent = activeNav ? activeNav.textContent : 'Calculadora de Engenharia';
    }

    _activeView = viewId;

    // Re-render history charts when switching to the historico view
    if (viewId === 'historico' && window.App?.Charts && window.App?.Store) {
      const history = App.Store.getState().history;
      requestAnimationFrame(() => {
        App.Charts.renderHistoricoValores('chart-historico', history);
        App.Charts.renderHorasComparativo('chart-horas-comparativo', history);
        App.UI.renderHistory(history);
      });
    }

    if (viewId === 'parametros' && window.App?.SettingsUI) {
      requestAnimationFrame(() => {
        App.SettingsUI.render();
      });
    }
  }

  return { init, navigate };
})();
