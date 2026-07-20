import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * ToastStack: escucha el evento global `toast` y apila notificaciones con auto-cierre. Cualquier
 * componente lanza una con `bus.emit('toast', { variant, message })`. Ver components.md.
 * @module toast.ui
 * @extends {UIComponentContract}
 */
export class ToastStack extends UIComponentContract {
  /**
   * Escucha el evento `toast` del bus global.
   * @override
   */
  onMount() {
    this._onToast = (payload) => this.add(payload);
    this.on('toast', this._onToast);
  }

  /**
   * Agrega una notificación toast a la pila con auto-cierre animado.
   * @param {Object} [params] - Configuración del toast.
   * @param {'info'|'success'|'warning'|'error'} [params.variant='info'] - Variante visual.
   * @param {string} [params.message=''] - Texto del toast.
   * @param {number} [params.duration=4000] - Duración en ms antes de iniciar la animación de salida.
   * @returns {HTMLElement} Elemento DOM del toast creado.
   */
  add({ variant = 'info', message = '', duration = 4000 } = {}) {
    const toast = document.createElement('div');
    toast.className = `c-toast c-toast--${variant}`;
    toast.textContent = message;
    this.element.appendChild(toast);

    const transitionMs = 300;
    setTimeout(() => {
      toast.classList.add('c-toast--exit');
      setTimeout(() => toast.remove(), transitionMs);
    }, Math.max(0, duration - transitionMs));

    return toast;
  }

  /**
   * Cancela la suscripción al evento `toast`.
   * @override
   */
  onDestroy() {
    this.off('toast', this._onToast);
  }
}
