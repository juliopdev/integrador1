/**
 * Monta los componentes con comportamiento presentes en el DOM: por cada `[selector, Clase]` del
 * registro, instancia y monta una clase por nodo encontrado. Devuelve las instancias (para destruir).
 * @param {Record<string, typeof import('../contracts/ui-component.contract.js').UIComponentContract>} registry - Mapa de selectores CSS a clases de componentes.
 * @param {Document|HTMLElement} [root=document] - Raíz donde buscar los selectores.
 * @returns {Array<import('../contracts/ui-component.contract.js').UIComponentContract>} Arreglo de instancias montadas.
 * @example
 * mountAll({ '.c-form': Form, '.c-input': Input })
 */
export function mountAll(registry, root = document) {
  const instances = [];
  for (const [selector, Component] of Object.entries(registry)) {
    root.querySelectorAll(selector).forEach((el) => {
      const instance = new Component(el);
      el.__component = instance;
      instance.mount();
      instances.push(instance);
    });
  }
  return instances;
}
