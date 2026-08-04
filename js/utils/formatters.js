'use strict';
window.App = window.App || {};

/**
 * @module Formatters
 * Funções de formatação centralizadas, evitando duplicação entre módulos.
 * Anteriormente duplicadas em: ui.js, charts.js, reports.js, settings-ui.js
 */
App.Formatters = (function () {

  /**
   * Formata um número como moeda brasileira (R$).
   * @param {number} v
   * @returns {string}
   */
  function moeda(v) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Formata um número como percentual com 1 casa decimal.
   * @param {number} v
   * @returns {string}
   */
  function pct(v) {
    return `${(v || 0).toFixed(1)}%`;
  }

  /**
   * Formata um número como horas com 2 casas decimais.
   * @param {number} v
   * @returns {string}
   */
  function horas(v) {
    return `${(v || 0).toFixed(2)}h`;
  }

  /**
   * Formata um número com N casas decimais.
   * @param {number} v
   * @param {number} d - casas decimais (padrão 3)
   * @returns {string}
   */
  function num(v, d = 3) {
    return (v || 0).toFixed(d);
  }

  return { moeda, pct, horas, num };
})();
