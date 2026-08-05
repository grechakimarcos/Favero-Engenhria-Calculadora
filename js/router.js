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
    if (window.App?.Auth && typeof App.Auth.canAccessView === 'function' && !App.Auth.canAccessView(viewId)) {
      App.UI?.toast?.('Seu perfil não possui acesso a esta área.', 'error');
      return false;
    }
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
      // Renderiza instantaneamente com os dados em cache para não dar tela preta
      let history = App.Store.getState().history || [];
      requestAnimationFrame(() => {
        App.Charts.renderCustosLucro('chart-custo-lucro', history);
        App.Charts.renderHorasColaborador('chart-horas-colaborador', history);
        App.UI.renderHistory(history);
      });
      
      // Busca dados fresquinhos do banco de dados na nuvem e atualiza silenciosamente
      if (window.App?.Supabase) {
        App.Supabase.fetchHistory().then(newHistory => {
          if (newHistory) {
            App.Store.setState({ history: newHistory });
            App.Charts.renderCustosLucro('chart-custo-lucro', newHistory);
            App.Charts.renderHorasColaborador('chart-horas-colaborador', newHistory);
            App.UI.renderHistory(newHistory);
          }
        }).catch(err => console.error("Erro ao atualizar histórico:", err));
      }
    }

    if (viewId === 'parametros' && window.App?.SettingsUI) {
      requestAnimationFrame(() => {
        App.SettingsUI.render();
      });
    }
    return true;
  }

  return { init, navigate };
})();
