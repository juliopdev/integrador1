import mitt from 'mitt';

/**
 * Event Bus global basado en mitt para comunicación desacoplada entre componentes.
 * Permite que cualquier componente emita o escuche eventos (abrir modal, lanzar toast, etc.)
 * sin acoplamiento directo. Ver components.md.
 *
 * @type {import('mitt').Emitter}
 */
export const bus = mitt();
