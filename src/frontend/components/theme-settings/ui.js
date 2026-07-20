import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

const KEY_SKIN = 'ui.theme.skin';
const KEY_MODE = 'ui.theme.mode';

/**
 * ThemeSettings (Iter 35): behavior de un `<form>` que aplica y persiste skin+mode. Los selects
 * se pre-marcan desde `localStorage` al montar; al submit aplica en el `<html>` y guarda.
 *
 * El bootstrap (`dashboard.entry.js`) aplica lo guardado ANTES de mostrar el layout — este
 * componente maneja SOLO el cambio interactivo desde el modal.
 * @module theme-settings.ui
 * @extends {UIComponentContract}
 */
export class ThemeSettings extends UIComponentContract {
  /**
   * Precarga valores de skin y mode desde localStorage y escucha el submit del formulario.
   * @override
   */
  onMount() {
    this.skinSelect = this.element.querySelector('[name="skin"]');
    this.modeSelect = this.element.querySelector('[name="mode"]');
    if (this.skinSelect) this.skinSelect.value = readSkin();
    if (this.modeSelect) this.modeSelect.value = readMode();

    this._onSubmit = (event) => this.submit(event);
    this.element.addEventListener('submit', this._onSubmit);
  }

  /**
   * Aplica y persiste la configuración de tema (skin + mode), emite toast y cierra el modal.
   * @param {Event} event - Evento de submit del formulario.
   */
  submit(event) {
    event.preventDefault();
    const skin = this.skinSelect?.value || 'default';
    const mode = this.modeSelect?.value || 'system';
    applyTheme(skin, mode);
    try {
      window.localStorage.setItem(KEY_SKIN, skin);
      window.localStorage.setItem(KEY_MODE, mode);
    } catch { /* noop */ }
    this.emit('toast', { variant: 'success', message: 'Tema actualizado.' });
    this.emit('modal:close', { target: 'settings-modal' });
  }

  /**
   * Remueve el listener de submit.
   * @override
   */
  onDestroy() {
    if (this._onSubmit) this.element.removeEventListener('submit', this._onSubmit);
  }
}

/**
 * Lee el skin guardado en localStorage.
 * @returns {string} Nombre del skin ('default', 'glassmorphism', 'minimalist').
 */
export function readSkin() {
  try { return window.localStorage.getItem(KEY_SKIN) || 'default'; } catch { return 'default'; }
}

/**
 * Lee el mode guardado en localStorage.
 * @returns {string} Modo del tema ('light', 'dark', 'system').
 */
export function readMode() {
  try { return window.localStorage.getItem(KEY_MODE) || 'system'; } catch { return 'system'; }
}

const VALID_SKINS = ['default', 'glassmorphism', 'minimalist'];
const VALID_MODES = ['light', 'dark', 'system'];

/**
 * Bootstrap del tema (lo llama el entry ANTES de pintar): un `?skin=`/`?mode=` válido en la URL
 * GANA sobre lo guardado y se persiste (sin esto, el bootstrap pisaba el SSR y los query params
 * de prueba documentados en el PLAN quedaban muertos). Sin query → aplica lo guardado.
 */
/**
 * Bootstrap del tema: aplica skin y mode desde URL (gana sobre localStorage) o desde lo guardado.
 * Debe llamarse antes de pintar el layout para evitar flash.
 * @param {string} [search=window.location.search] - Query string de la URL.
 */
export function bootstrapTheme(search = window.location.search) {
  const params = new URLSearchParams(search);
  const urlSkin = params.get('skin');
  const urlMode = params.get('mode');
  const skin = VALID_SKINS.includes(urlSkin) ? urlSkin : readSkin();
  const mode = VALID_MODES.includes(urlMode) ? urlMode : readMode();
  try {
    if (VALID_SKINS.includes(urlSkin)) window.localStorage.setItem(KEY_SKIN, urlSkin);
    if (VALID_MODES.includes(urlMode)) window.localStorage.setItem(KEY_MODE, urlMode);
  } catch { /* noop */ }
  applyTheme(skin, mode);
}

/**
 * Aplica un tema (skin + mode) al documento HTML estableciendo atributos `data-theme` y `data-theme-mode`.
 * @param {string} skin - Nombre del skin ('default', 'glassmorphism', 'minimalist').
 * @param {string} mode - Modo del tema ('light', 'dark', 'system').
 */
export function applyTheme(skin, mode) {
  const html = document.documentElement;
  html.dataset.theme = skin;
  html.dataset.themeMode = mode;
}
