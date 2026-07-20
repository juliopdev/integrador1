/**
 * Entry point del Dashboard. Inicializa el dispatcher global, monta componentes, configura Swup
 * para navegación SPA, maneja slide-overs, confirmaciones, chat WebSocket y behaviors del wizard No-Code.
 * @module dashboard.entry
 */
import { initDispatcher } from './lib/dispatcher.js';
import { mountAll } from './lib/mount.js';
import { Input } from '../components/input/ui.js';
import { Modal } from '../components/modal/ui.js';
import { ToastStack } from '../components/toast/ui.js';
import { Form } from '../components/form/ui.js';
import { Sidebar, readSidebarCollapsed } from '../components/sidebar/ui.js';
import { ThemeSettings, bootstrapTheme, applyTheme, readSkin, readMode } from '../components/theme-settings/ui.js';
import { Textarea } from '../components/textarea/ui.js';
import { Select } from '../components/select/ui.js';
import { SearchInput } from '../components/search-input/ui.js';
import { Tabs } from '../components/tabs/ui.js';
import { ConfirmDialog } from '../components/confirm-dialog/ui.js';
import { Tooltip } from '../components/tooltip/ui.js';
import { FileUpload } from '../components/file-upload/ui.js';
import { DropdownMenu } from '../components/dropdown-menu/ui.js';
// import { ContextMenu } from '../components/context-menu/ui.js';
import { CopyButton } from '../components/copy-button/ui.js';
// import { ActivityFeed } from '../components/activity-feed/ui.js';
// import { CodeBlock } from '../components/code-block/ui.js';
import { Terminal } from '../components/terminal/ui.js';
// import { Chart } from '../components/chart/ui.js';
// import { DynamicTable } from '../components/dynamic-table/ui.js';
// import { DynamicForm } from '../components/dynamic-form/ui.js';
// import { SchemaDesigner } from '../components/schema-designer/ui.js';
import { ChatBox } from '../components/chat-box/ui.js';
import { bus } from './lib/bus.js';

// Iter 35: aplicar tema ANTES de que el CSS del skin final tome efecto (evita flash).
// La URL (?skin/?mode) gana sobre localStorage y se persiste (bootstrapTheme).
bootstrapTheme();

// Iter 34: aplica el estado colapsado ANTES de que el layout final se pinte para evitar
// flash de labels expandidos. El SSR renderiza siempre expandido; acá corregimos si aplica.
if (readSidebarCollapsed()) {
  const grid = document.querySelector('.l-dashboard-grid');
  const aside = document.querySelector('.c-sidebar');
  if (grid) grid.classList.add('l-dashboard-grid--collapsed');
  if (aside) {
    aside.classList.add('c-sidebar--collapsed');
    const btn = aside.querySelector('[data-action="sidebar:toggle"]');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

initDispatcher();
mountAll({
  '.c-form': Form,
  '.c-input': Input,
  '.c-modal': Modal,
  '.c-toast-stack': ToastStack,
  '[data-component="sidebar"]': Sidebar,
  '[data-component="theme-settings"]': ThemeSettings,
  '.c-textarea': Textarea,
  '.c-select': Select,
  '.c-search-input': SearchInput,
  '.c-tabs': Tabs,
  '.c-confirm-dialog-wrapper': ConfirmDialog,
  '.c-tooltip': Tooltip,
  '.c-file-upload': FileUpload,
  '.c-dropdown-menu': DropdownMenu,
  // '.c-context-menu': ContextMenu,
  '.c-copy-button': CopyButton,
  // '.c-activity-feed': ActivityFeed,
  // '.c-code-block': CodeBlock,
  '.c-terminal': Terminal,
  // '.c-chart': Chart,
  // '.c-dynamic-table': DynamicTable,
  // '.c-dynamic-form': DynamicForm,
  // '.c-schema-designer': SchemaDesigner,
  '.c-chat-box': ChatBox,
});

// Inicialización de Swup para navegación SPA con transiciones suaves (PJAX)
import Swup from 'swup';
const swup = new Swup();

/**
 * Actualiza la clase activa de los links del sidebar según la ruta actual.
 */
function updateSidebarActiveLinks() {
  const currentPath = window.location.pathname;
  document.querySelectorAll('.c-sidebar__link').forEach((link) => {
    // Si la ruta del link coincide exactamente con el pathname actual
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('c-sidebar__link--active');
    } else {
      link.classList.remove('c-sidebar__link--active');
    }
  });
}

// Iter 53 fix: auto-refresh de páginas Swup-aware. Reemplaza `<meta http-equiv="refresh">` cuyo
// timer queda atornillado al URL del parse (browser-level) y devolvía al usuario a la página
// anterior al navegar. Cada página con `data-refresh-seconds` renderea un `<span hidden>` que este
// handler lee tras cada `page:view`. Al cambiar de página, el timer previo se limpia y sólo dispara
// si al vencer seguimos en el mismo `pathname`. `swup.navigate` en lugar de `location.reload` para
// mantener la transición y respetar el ciclo de vida de la librería.
let autoRefreshTimer = null;
/**
 * Configura el refresco automático de la página actual basado en `data-refresh-seconds`.
 * Limpia el timer previo al navegar y verifica que el pathname coincida al vencerse.
 */
function setupAutoRefresh() {
  if (autoRefreshTimer) {
    clearTimeout(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  const marker = document.querySelector('[data-refresh-seconds]');
  if (!marker) return;
  const seconds = parseInt(marker.dataset.refreshSeconds, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const pathAtSchedule = window.location.pathname;
  autoRefreshTimer = setTimeout(() => {
    if (window.location.pathname === pathAtSchedule) {
      swup.navigate(window.location.pathname + window.location.search, { cache: false });
    }
  }, seconds * 1000);
}

// Escuchar cambios de página con Swup v4 para re-montar interactividad en el nuevo DOM
swup.hooks.on('page:view', () => {
  // Re-montar componentes solo dentro del contenedor de Swup para evitar duplicar listeners globales
  mountAll({
    '.c-form': Form,
    '.c-input': Input,
    '.c-modal': Modal,
    '.c-toast-stack': ToastStack,
    '.c-textarea': Textarea,
    '.c-select': Select,
    '.c-search-input': SearchInput,
    '.c-tabs': Tabs,
    '.c-confirm-dialog-wrapper': ConfirmDialog,
    '.c-tooltip': Tooltip,
    '.c-file-upload': FileUpload,
    '.c-dropdown-menu': DropdownMenu,
    // '.c-context-menu': ContextMenu,
    '.c-copy-button': CopyButton,
    // '.c-activity-feed': ActivityFeed,
    // '.c-code-block': CodeBlock,
    '.c-terminal': Terminal,
    // '.c-chart': Chart,
    // '.c-dynamic-table': DynamicTable,
    // '.c-dynamic-form': DynamicForm,
    // '.c-schema-designer': SchemaDesigner,
    '.c-chat-box': ChatBox,
  }, document.getElementById('swup'));

  // Sincronizar clases de estado activo en el sidebar
  updateSidebarActiveLinks();
  initChatBox();
  setupAutoRefresh();
  initNocodeColumnFields();

  // Ejecutar scripts inline dentro del contenedor de Swup para activar filtros/buscadores locales
  const container = document.getElementById('swup');
  if (container) {
    container.querySelectorAll('script').forEach((script) => {
      const newScript = document.createElement('script');
      Array.from(script.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
      newScript.appendChild(document.createTextNode(script.innerHTML));
      script.parentNode.replaceChild(newScript, script);
    });
  }
});

// Ejecutar en el load inicial también (no hay page:view en la primera visita).
setupAutoRefresh();

// Iter UX C4: slide-over lateral (usado por el Paso 5 del wizard No-Code para "añadir campo").
// Actions:
//   - `slide-over:open` con target=id  → abre el panel + muestra backdrop
//   - `slide-over:close` con target=id → cierra ese panel + oculta backdrop si es el último
//   - `slide-over:close-all`           → cierra todos (usado por el propio backdrop al click fuera)
// Foco: al abrir se enfoca el primer input focusable del body; ESC cierra el panel activo.
/**
 * Actualiza la visibilidad del backdrop de slide-over según si hay algún panel abierto.
 */
function updateSlideOverBackdrop() {
  const anyOpen = document.querySelector('.l-slide-over--open');
  const backdrop = document.querySelector('.l-slide-over-backdrop');
  if (!backdrop) return;
  backdrop.classList.toggle('l-slide-over-backdrop--visible', !!anyOpen);
}

/**
 * Abre un panel slide-over lateral por su id.
 * @param {string} id - ID del elemento slide-over.
 */
function openSlideOver(id) {
  const panel = document.getElementById(id);
  if (!panel) return;
  panel.classList.add('l-slide-over--open');
  panel.setAttribute('aria-hidden', 'false');
  updateSlideOverBackdrop();
  const firstInput = panel.querySelector('input, select, textarea, button');
  if (firstInput) setTimeout(() => firstInput.focus(), 60);
}

/**
 * Cierra un panel slide-over por su id.
 * @param {string} id - ID del elemento slide-over.
 */
function closeSlideOver(id) {
  const panel = document.getElementById(id);
  if (!panel) return;
  panel.classList.remove('l-slide-over--open');
  panel.setAttribute('aria-hidden', 'true');
  updateSlideOverBackdrop();
}

/**
 * Cierra todos los paneles slide-over abiertos y oculta el backdrop.
 */
function closeAllSlideOvers() {
  document.querySelectorAll('.l-slide-over--open').forEach((p) => {
    p.classList.remove('l-slide-over--open');
    p.setAttribute('aria-hidden', 'true');
  });
  updateSlideOverBackdrop();
}

bus.on('slide-over:open', ({ target }) => openSlideOver(target));
bus.on('slide-over:close', ({ target }) => closeSlideOver(target));
bus.on('slide-over:close-all', () => closeAllSlideOvers());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.querySelector('.l-slide-over--open')) {
    closeAllSlideOvers();
  }
});

// Iter UX A5: selección programática de un tab desde cualquier control (ej. CTA de empty-state
// "Configurar modo externo" en el tab Hospedado). El target es el `data-target-panel` del tab.
bus.on('tab:select', ({ target: panelId }) => {
  if (!panelId) return;
  const tab = document.querySelector(`.c-tabs__tab[data-target-panel="${panelId}"]`);
  if (tab) tab.click();
});

// Iter UX A2: contadores del filtro de logs en vivo. El componente Terminal emite `log:received`
// por cada línea que llega del SSE; acá incrementamos los `<span data-count-for="...">` que la
// vista pintó en el SSR. Si el elemento no existe (estamos en otra página) el handler es no-op.
bus.on('log:received', ({ level }) => {
  const incr = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const n = parseInt(el.textContent.trim(), 10);
    if (!Number.isFinite(n)) return;
    el.textContent = String(n + 1);
  };
  incr('[data-count-for="total"]');
  if (level === 'info' || level === 'warn' || level === 'error') {
    incr(`[data-count-for="${level}"]`);
  }
});

// Manejadores de acciones globales del dashboard a través del Event Bus (components.md).
// Fix seguridad: `desiredStatus` explícito (antes era toggle sin body — un reintento revertía).
/**
 * Confirmación por modal (basada en promesa) reutilizando el `ConfirmDialog` montado en el layout
 * del dashboard. Emite `confirm:show` con un `resolve`; el diálogo lo invoca con true/false al
 * confirmar/cancelar. Reemplaza a `window.confirm` (bloqueante, no themeable, inconsistente).
 */
/**
 * Abre un modal de confirmación basado en promesa usando el ConfirmDialog del layout.
 * @param {Object} opts - Opciones del diálogo de confirmación.
 * @param {string} [opts.title] - Título del modal.
 * @param {string} [opts.message] - Mensaje de confirmación.
 * @param {string} [opts.confirmLabel] - Texto del botón confirmar.
 * @param {string} [opts.variant] - Variante visual.
 * @returns {Promise<boolean>} Promesa que resuelve a true (confirmado) o false (cancelado).
 */
function openConfirm(opts) {
  return new Promise((resolve) => bus.emit('confirm:show', { ...opts, resolve }));
}

bus.on('tenant:set-status', async ({ target }) => {
  const [tenantId, desiredStatus] = String(target || '').split('|');
  if (!tenantId || !desiredStatus) return;
  const suspending = desiredStatus === 'suspended';
  const confirmed = await openConfirm({
    title: suspending ? 'Suspender tenant' : 'Activar tenant',
    message: suspending
      ? 'Se bloqueará el acceso a sus endpoints y se cerrarán sus conexiones WebSocket activas. ¿Continuar?'
      : 'Se restaurará el acceso del tenant a sus endpoints. ¿Continuar?',
    confirmLabel: suspending ? 'Suspender' : 'Activar',
    variant: suspending ? 'warning' : 'primary',
  });
  if (!confirmed) return;
  try {
    const res = await fetch(`/api-system/v1/tenants/${tenantId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desiredStatus }),
    });
    if (res.ok) {
      // Swup expone la navegación programática: si cambiamos el estado, podemos usar la navegación
      // de Swup para refrescar el contenido sin hacer un reload completo del navegador.
      swup.navigate(window.location.pathname, { cache: false });
    } else {
      const data = await res.json().catch(() => ({}));
      bus.emit('toast', { variant: 'error', message: data.message || 'No se pudo cambiar el estado.' });
    }
  } catch {
    bus.emit('toast', { variant: 'error', message: 'No se pudo conectar con el servidor.' });
  }
});

// Reenvío de invitación del Master: confirma, POSTea y da feedback por toast. El backend guarda que
// el Master siga `invited` (si ya activó → 422 MASTER_ALREADY_ACTIVE) y aplica rate-limit por-ruta.
bus.on('tenant:resend-invitation', async ({ target: tenantId }) => {
  if (!tenantId) return;
  const confirmed = await openConfirm({
    title: 'Reenviar invitación',
    message: 'Se generará un enlace de activación nuevo (invalida el anterior) y se enviará al correo del Master. ¿Continuar?',
    confirmLabel: 'Reenviar',
    variant: 'primary',
  });
  if (!confirmed) return;
  try {
    const res = await fetch(`/api-system/v1/tenants/${tenantId}/resend-invitation`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      bus.emit('toast', { variant: 'success', message: `Invitación reenviada a ${data.data?.email ?? 'el Master'}.` });
    } else {
      bus.emit('toast', { variant: 'error', message: data.message || 'No se pudo reenviar la invitación.' });
    }
  } catch {
    bus.emit('toast', { variant: 'error', message: 'No se pudo conectar con el servidor.' });
  }
});

// P4/P5: API key "frontend" — generar/regenerar la key del tenant y revelarla UNA vez en el
// modal `apikey-reveal` (en DB solo queda el hash). Copiar usa el Clipboard API.
/**
 * Genera (o regenera) una API key para un tenant, la muestra en el modal de revelación.
 * @param {string} tenantId - ID del tenant.
 * @returns {Promise<void>}
 */
async function generateApiKey(tenantId) {
  try {
    const res = await fetch(`/api-system/v1/tenants/${tenantId}/api-key`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      bus.emit('toast', { variant: 'error', message: body.message || 'No se pudo generar la key.' });
      return;
    }
    const slot = document.querySelector('#apikey-reveal [data-apikey-slot]');
    if (slot) slot.textContent = body.data.apiKey;
    bus.emit('modal:open', { target: 'apikey-reveal' });
  } catch {
    bus.emit('toast', { variant: 'error', message: 'No se pudo conectar con el servidor.' });
  }
}

bus.on('apikey:generate', ({ target: tenantId }) => generateApiKey(tenantId));

bus.on('apikey:regenerate', ({ target: tenantId }) => {
  if (!confirm('Regenerar invalida la key anterior: el front del tenant dejará de conectar hasta actualizarla. ¿Continuar?')) return;
  generateApiKey(tenantId);
});

bus.on('apikey:copy', async () => {
  const slot = document.querySelector('#apikey-reveal [data-apikey-slot]');
  const value = slot?.textContent?.trim();
  if (!value || value === '…') return;
  try {
    await navigator.clipboard.writeText(value);
    bus.emit('toast', { variant: 'success', message: 'Key copiada al portapapeles.' });
  } catch {
    bus.emit('toast', { variant: 'error', message: 'No se pudo copiar — selecciona y copia manualmente.' });
  }
});

// Iter UX P0: drawer móvil del sidebar. En viewport <768px el sidebar es fixed off-canvas y se
// abre desde el hamburger de `.l-mobile-topbar`; el overlay lo cierra. Al navegar (page:view) se
// cierra solo para que la nueva página quede limpia.
/**
 * Alterna el sidebar móvil off-canvas (viewport < 768px).
 * @param {boolean} [force] - Estado forzado (true = abrir, false = cerrar).
 */
function toggleMobileSidebar(force) {
  const aside = document.querySelector('.c-sidebar');
  const backdrop = document.querySelector('.l-sidebar-backdrop');
  if (!aside || !backdrop) return;
  const willOpen = typeof force === 'boolean' ? force : !aside.classList.contains('c-sidebar--mobile-open');
  aside.classList.toggle('c-sidebar--mobile-open', willOpen);
  backdrop.classList.toggle('l-sidebar-backdrop--visible', willOpen);
}
bus.on('sidebar:mobile-toggle', () => toggleMobileSidebar());
swup.hooks.on('page:view', () => toggleMobileSidebar(false));

// Iter UX P0: toggle rápido de tema desde el dropdown del user-pill. Cicla light → dark → system.
// Persiste vía applyTheme + localStorage (reusa el mismo mecanismo que theme-settings).
bus.on('theme:toggle-mode', () => {
  const current = readMode();
  const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
  const skin = readSkin();
  applyTheme(skin, next);
  try {
    window.localStorage.setItem('ui.theme.mode', next);
  } catch { /* noop */ }
  const label = next === 'light' ? 'Modo claro activo.' : next === 'dark' ? 'Modo oscuro activo.' : 'Tema según el sistema.';
  bus.emit('toast', { variant: 'success', message: label });
});

// Iter 52: `user:logout` viene del dropdown de sesión (footer del sidebar). Cierra la sesión
// contra el backend y redirige al login. Toast si falla — el usuario sigue viendo la app hasta
// resolver la conectividad.
bus.on('user:logout', async () => {
  try {
    const res = await fetch('/api-system/v1/logout', { method: 'POST' });
    if (res.ok) {
      window.location.assign('/dashboard/login');
    } else {
      bus.emit('toast', { variant: 'error', message: 'No se pudo cerrar la sesión.' });
    }
  } catch {
    bus.emit('toast', { variant: 'error', message: 'No se pudo conectar con el servidor.' });
  }
});

// Iter UX A4: eliminar tenant con doble confirmación (type-to-confirm). El botón envía
// `target=id|subdomain`; parseamos y armamos el modal genérico `confirm-typing-modal`. El
// verdadero DELETE lo dispara `confirm-typing:submit` cuando el input coincide.
let pendingTypingConfirm = null;

/**
 * Conflictos que el server marca como resolubles por confirmación explícita (body.details.dependencies
 * presente). Hoy sólo aplica al DELETE de providers: si el draft usa el provider, el server responde
 * 422 PROVIDER_IN_USE_BY_DRAFT y aquí ofrecemos "reintentar con force". Sobre contrato PUBLICADO
 * el server responde 422 PROVIDER_IN_USE_BY_PUBLISHED (hard block, sin force) — mostramos toast.
 */
bus.on('form:conflict', async ({ code, message, details, url, method, redirect }) => {
  if (code === 'PROVIDER_IN_USE_BY_DRAFT') {
    const depsSummary = (details?.dependencies || [])
      .map((d) => d.kind === 'resource' ? `resource "${d.name}" (${d.store})` : `estrategia "${d.name}"`)
      .slice(0, 5)
      .join(', ');
    const extra = (details?.dependencies?.length || 0) > 5 ? ` y ${details.dependencies.length - 5} más` : '';
    const confirmMsg = `${message}\n\nAfectados: ${depsSummary}${extra}.\n\n¿Deslinkear de todas formas? (los elementos quedarán huérfanos hasta que los edites o relinquees el provider).`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const res = await fetch(url, {
        method: method || 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      if (res.ok) {
        bus.emit('toast', { variant: 'success', message: 'Provider deslinkeado (forzado).' });
        if (redirect) window.location.assign(redirect);
      } else {
        const body = await res.json().catch(() => ({}));
        bus.emit('toast', { variant: 'error', message: body.message || 'No se pudo deslinkear.' });
      }
    } catch {
      bus.emit('toast', { variant: 'error', message: 'No se pudo conectar con el servidor.' });
    }
    return;
  }
  // Cualquier otro conflict sin handler específico → cae a toast informativo.
  bus.emit('toast', { variant: 'error', message: message || 'Operación no permitida.' });
});

bus.on('tenant:delete', ({ target }) => {
  const [tenantId, subdomain] = String(target || '').split('|');
  if (!tenantId || !subdomain) return;
  openTypingConfirm({
    expected: subdomain,
    message: `Vas a eliminar (soft-delete) el tenant "${subdomain}". El acceso se corta y el subdominio queda reservado. Esta acción no se puede deshacer sin restauración manual.`,
    onConfirm: async () => {
      try {
        // Fix seguridad: reenviamos el subdominio tipeado en body como confirmación server-side.
        // El backend verifica que coincida con `tenant.subdomain` (SUBDOMAIN_MISMATCH → 422).
        const res = await fetch(`/api-system/v1/tenants/${tenantId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmSubdomain: subdomain }),
        });
        if (res.ok) {
          bus.emit('toast', { variant: 'success', message: `Tenant "${subdomain}" eliminado.` });
          swup.navigate('/dashboard/tenants');
        } else {
          const data = await res.json().catch(() => ({}));
          bus.emit('toast', { variant: 'error', message: data.message || 'No se pudo eliminar el tenant.' });
        }
      } catch {
        bus.emit('toast', { variant: 'error', message: 'No se pudo conectar con el servidor.' });
      }
    },
  });
});

/**
 * Abre el modal de type-to-confirm para acciones destructivas. El submit se habilita solo cuando
 * el input coincide con el valor esperado.
 * @param {Object} opts - Opciones del modal.
 * @param {string} opts.expected - Texto que el usuario debe escribir para habilitar el botón.
 * @param {string} opts.message - Mensaje de advertencia.
 * @param {Function} opts.onConfirm - Callback asíncrono a ejecutar al confirmar.
 * @param {string} [opts.title] - Título del modal (override).
 * @param {string} [opts.confirmLabel] - Texto del botón confirmar (override).
 */
function openTypingConfirm({ expected, message, onConfirm, title, confirmLabel }) {
  const modal = document.getElementById('confirm-typing-modal');
  if (!modal) return;
  const msgEl = modal.querySelector('[data-confirm-typing-msg]');
  const expectedEl = modal.querySelector('[data-confirm-typing-expected]');
  const inputEl = modal.querySelector('[data-confirm-typing-input]');
  const submitBtn = modal.querySelector('.js-confirm-typing-submit');
  const titleEl = modal.querySelector('.c-modal__title');
  const submitLabelEl = submitBtn?.querySelector('.c-button__label');
  if (!msgEl || !expectedEl || !inputEl || !submitBtn) return;

  // Iter UX: el mismo modal sirve para eliminar tenant y para activar versión (patrón
  // "confirmación destructiva"). Título y label del submit se overridean por caller para no
  // mostrar "Confirmar eliminación" cuando se está activando una versión.
  if (title && titleEl) titleEl.textContent = title;
  if (confirmLabel && submitLabelEl) submitLabelEl.textContent = confirmLabel;

  msgEl.textContent = message;
  expectedEl.textContent = expected;
  inputEl.value = '';
  submitBtn.disabled = true;

  const onInput = () => {
    submitBtn.disabled = inputEl.value.trim() !== expected;
  };
  inputEl.addEventListener('input', onInput);
  pendingTypingConfirm = { onConfirm, cleanup: () => inputEl.removeEventListener('input', onInput) };

  bus.emit('modal:open', { target: 'confirm-typing-modal' });
  // El foco al input queda un frame después de abrir para que la animación no lo pierda.
  setTimeout(() => inputEl.focus(), 50);
}

// Iter UX: activar una versión existente del historial (rollback / roll-forward). El botón envía
// `target=tenantId|version|subdomain`; abrimos el mismo modal type-to-confirm que usamos para
// eliminar tenant (patrón "acción destructiva sobre estado productivo"). El operador debe
// escribir la versión (ej. "v2") para habilitar el confirm.
bus.on('contract:activate-version', ({ target }) => {
  const [tenantId, version, subdomain] = String(target || '').split('|');
  if (!tenantId || !version) return;
  openTypingConfirm({
    title: `Activar ${version}`,
    confirmLabel: `Activar ${version}`,
    expected: version,
    message: `Vas a activar ${version} en "${subdomain || tenantId}". El contrato activo se retira y ${version} pasa a producción. Los datos escritos bajo otras versiones se conservan; el motor aplica/oculta columnas según el schema de ${version}.`,
    onConfirm: async () => {
      try {
        // Toast inicial: la compilación puede tardar unos segundos (DDL sobre Postgres externo).
        bus.emit('toast', { variant: 'success', message: `Activando ${version}…` });
        const res = await fetch(`/api-system/v1/tenants/${tenantId}/backend/activate/${version}`, { method: 'POST' });
        if (res.ok) {
          bus.emit('toast', { variant: 'success', message: `${version} activada.` });
          // Volver al listado de backends: es donde se ve el estado agregado del tenant y
          // desde ahí decide si compone algo nuevo. Reflect the state change visually.
          swup.navigate('/dashboard/backends');
        } else {
          const data = await res.json().catch(() => ({}));
          bus.emit('toast', { variant: 'error', message: data?.error?.message || data.message || 'No se pudo activar la versión.' });
        }
      } catch {
        bus.emit('toast', { variant: 'error', message: 'No se pudo conectar con el servidor.' });
      }
    },
  });
});

// Iter UX P2.4: eliminar una versión retirada del historial. Mismo patrón type-to-confirm que
// activar. El botón envía `target=tenantId|version|subdomain`; el modal exige tipear la versión.
// Nota: la data escrita bajo esa versión persiste — el motor No-Code conserva las columnas
// físicas, solo se elimina el snapshot del contrato.
bus.on('contract:delete-version', ({ target }) => {
  const [tenantId, version, subdomain] = String(target || '').split('|');
  if (!tenantId || !version) return;
  openTypingConfirm({
    title: `Eliminar ${version}`,
    confirmLabel: `Eliminar ${version}`,
    expected: version,
    message: `Vas a eliminar ${version} del historial de "${subdomain || tenantId}". La data escrita bajo esa versión se conserva (el motor No-Code guarda las columnas físicas), pero perdés el snapshot del contrato y no podrás activarla más.`,
    onConfirm: async () => {
      try {
        const res = await fetch(`/api-system/v1/tenants/${tenantId}/backend/${version}`, { method: 'DELETE' });
        if (res.ok) {
          bus.emit('toast', { variant: 'success', message: `${version} eliminada del historial.` });
          swup.navigate(window.location.pathname + window.location.search, { cache: false });
        } else {
          const data = await res.json().catch(() => ({}));
          bus.emit('toast', { variant: 'error', message: data?.error?.message || data.message || 'No se pudo eliminar la versión.' });
        }
      } catch {
        bus.emit('toast', { variant: 'error', message: 'No se pudo conectar con el servidor.' });
      }
    },
  });
});

bus.on('confirm-typing:submit', async () => {
  if (!pendingTypingConfirm) return;
  const { onConfirm, cleanup } = pendingTypingConfirm;
  pendingTypingConfirm = null;
  cleanup?.();
  bus.emit('modal:close', { target: 'confirm-typing-modal' });
  await onConfirm();
});

// ── WIZARD NO-CODE INTERACTIVE BEHAVIORS ──────────────────────────────

// 1. Providers Step: Toggle expandable configuration forms on provider cards
document.addEventListener('click', (e) => {
  const header = e.target.closest('.l-provider-card__header-click');
  if (header) {
    const card = header.closest('.provider-card');
    const config = card.querySelector('.l-provider-card__config');
    if (config) {
      const isOpen = config.classList.contains('l-provider-card__config--open');
      const checkbox = header.querySelector('.provider-card__checkbox');
      if (isOpen) {
        config.classList.remove('l-provider-card__config--open');
        config.style.maxHeight = '0px';
        if (checkbox) {
          checkbox.classList.remove('provider-card__checkbox--checked');
          checkbox.innerHTML = '';
        }
      } else {
        config.classList.add('l-provider-card__config--open');
        config.style.maxHeight = config.scrollHeight + 'px';
        if (checkbox) {
          checkbox.classList.add('provider-card__checkbox--checked');
          checkbox.innerHTML = '<svg class="c-icon c-icon--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        }
      }
    }
  }
});

// Iter UX P4.4: autocomplete del Paso 4 (Resources & endpoints). Al escribir el nombre lógico
// del resource, sincronizamos automáticamente `physicalName` (a `<name>_db`) y `endpoint.path`
// (a `/<name>`). Ambos SIGUEN editables — si el operador ya los personalizó, no los
// sobrescribimos. La detección se hace via `dataset.prevLogical`: si el valor actual del target
// coincide con el default que hubiese generado el nombre anterior, el operador no lo editó
// manualmente y podemos actualizar sin miedo. Cuando el operador escribe algo distinto, el
// campo queda "manual" y no se toca más.
document.addEventListener('input', (e) => {
  if (!e.target.matches('form.js-resource-autocomplete input[name="name"]')) return;
  const nameInput = e.target;
  const form = nameInput.closest('form');
  const logicalValue = nameInput.value.trim();
  const prevLogical = nameInput.dataset.prevLogical || '';

  const sync = (selector, computeDefault) => {
    const target = form.querySelector(selector);
    if (!target) return;
    const expected = computeDefault(logicalValue);
    const prevDefault = computeDefault(prevLogical);
    const current = target.value;
    // "No tocado manualmente" = vacío, o igual al default anterior, o igual al default nuevo.
    if (!current || current === prevDefault || current === expected) {
      target.value = expected;
    }
  };

  sync('input[name="physicalName"]', (v) => (v ? `${v}_db` : ''));
  sync('input[name="endpoint.path"]', (v) => (v ? `/${v}` : ''));

  nameInput.dataset.prevLogical = logicalValue;
});

// 3. Finish Step: Animate compilation and deploy progress stepper
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form');
  if (form && form.action && form.action.endsWith('/backend') && !form.action.includes('/providers') && !form.action.includes('/roles') && !form.action.includes('/ws')) {
    const stepper = document.querySelector('.deploy-stepper');
    if (stepper) {
      stepper.classList.add('deploy-stepper--active');
      const step1 = stepper.querySelector('[data-step="1"]');
      const step2 = stepper.querySelector('[data-step="2"]');
      const step3 = stepper.querySelector('[data-step="3"]');
      
      if (step1) step1.className = 'deploy-step deploy-step--active';
      if (step2) step2.className = 'deploy-step';
      if (step3) step3.className = 'deploy-step';
      
      setTimeout(() => {
        if (step1) step1.className = 'deploy-step deploy-step--done';
        if (step2) step2.className = 'deploy-step deploy-step--active';
      }, 700);
      
      setTimeout(() => {
        if (step2) step2.className = 'deploy-step deploy-step--done';
        if (step3) step3.className = 'deploy-step deploy-step--active';
      }, 1800);
      
      setTimeout(() => {
        if (step3) step3.className = 'deploy-step deploy-step--done';
      }, 2800);
    }
  }
 window.location.pathname; // (dummy side-effect to avoid unused)
});

// ── STAFF INVITATION MODAL BEHAVIOR ────────────────────────────────────
bus.on('staff:invite', () => {
  bus.emit('modal:open', { target: 'invite-staff-modal' });
});

// ── TENANT SUPPORT CHAT WEBSOCKET CLIENT ───────────────────────────────
let chatSocket = null;

/**
 * Inicializa el chat de soporte técnico: carga historial vía REST, conecta WebSocket y enlaza eventos.
 * @returns {Promise<void>}
 */
async function initChatBox() {
  const chatLayout = document.querySelector('.l-chat-layout');
  const chatEl = document.querySelector('.c-chat-box');
  if (!chatLayout || !chatEl) {
    if (chatSocket) {
      try { chatSocket.close(); } catch {}
      chatSocket = null;
    }
    return;
  }

  const tenantId = chatLayout.dataset.tenantId;
  const channel = 'ws_support_global';

  // Esperar a que el componente sea montado por mountAll
  const chatBox = chatEl.__component;
  if (!chatBox) {
    setTimeout(initChatBox, 50);
    return;
  }

  if (chatSocket) {
    try { chatSocket.close(); } catch {}
    chatSocket = null;
  }

  // 1. Cargar historial de soporte
  try {
    const res = await fetch(`/api-system/v1/chat/messages?channel=${channel}`);
    if (res.ok) {
      const body = await res.json();
      chatBox.messagesEl.innerHTML = '';
      if (body.data && body.data.length > 0) {
        body.data.forEach((msg) => {
          const userEmail = window.userEmail || '';
          const own = msg.sender.email === userEmail;
          const timestamp = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
          chatBox.append({ text: msg.text, own, timestamp });
        });
      } else {
        chatBox.messagesEl.innerHTML = '<div class="u-flex u-items-center u-justify-center u-h-full u-text-muted u-text-sm" style="min-height: 200px;">Sin mensajes de soporte previos.</div>';
      }
    }
  } catch (err) {
    console.error('Error al cargar historial:', err);
  }

  // 2. Conectar canal WebSocket
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/chat?channel=${channel}`;
  chatSocket = new WebSocket(wsUrl);

  chatSocket.onopen = () => {
    bus.emit('toast', { variant: 'success', message: 'Conectado al soporte técnico.' });
  };

  chatSocket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.event === 'message') {
        // Quitar placeholder de vacío si existe
        const placeholder = chatBox.messagesEl.querySelector('.u-text-muted');
        if (placeholder) placeholder.remove();

        const userEmail = window.userEmail || '';
        const own = payload.data.sender.email === userEmail;
        
        // ChatBox añade instantáneamente el mensaje localmente al enviar para UX rápida.
        // Solo lo añadimos al recibir si viene de otro remitente.
        if (!own) {
          const timestamp = payload.data.createdAt ? new Date(payload.data.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
          chatBox.emit('chat:message', { text: payload.data.text, timestamp });
        }
      }
    } catch (err) {
      console.error('Error al procesar mensaje WS:', err);
    }
  };

  chatSocket.onclose = () => {
    console.log('Conexión de chat cerrada.');
  };

  // 3. Escuchar los submits que emite el componente de chat
  chatBox.on('chat:send', (data) => {
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(JSON.stringify({ text: data.text }));
    } else {
      bus.emit('toast', { variant: 'error', message: 'Sin conexión con el chat.' });
    }
  });
}

// Inicialización en la carga inicial de la página
initChatBox();
initNocodeColumnFields();

/**
 * Inicializa la lógica dinámica de los campos de columna No-Code: muestra/oculta wrappers
 * (target, length, check, default) según el tipo de dato seleccionado.
 */
function initNocodeColumnFields() {
  const typeSelects = document.querySelectorAll('select[id^="select-type-"]');
  typeSelects.forEach((typeSelect) => {
    const resourceName = typeSelect.id.replace('select-type-', '');
    const targetWrapper = document.getElementById(`target-wrapper-${resourceName}`);
    const lengthWrapper = document.getElementById(`length-wrapper-${resourceName}`);
    const checkWrapper = document.getElementById(`check-wrapper-${resourceName}`);

    function updateFields() {
      const type = typeSelect.value;
      if (targetWrapper) targetWrapper.style.display = type === 'relation' ? 'block' : 'none';
      if (lengthWrapper) lengthWrapper.style.display = type === 'string' ? 'block' : 'none';

      const supportsCheck = ['integer', 'float', 'string', 'text', 'boolean', 'number'].includes(type);
      if (checkWrapper) checkWrapper.style.display = supportsCheck ? 'block' : 'none';

      const defaultText = document.getElementById(`input-default-text-${resourceName}`);
      const defaultTextWrapper = document.getElementById(`default-text-wrapper-${resourceName}`);
      const defaultBool = document.getElementById(`select-default-bool-${resourceName}`);
      const defaultBoolWrapper = document.getElementById(`default-bool-wrapper-${resourceName}`);

      if (type === 'boolean') {
        if (defaultTextWrapper) defaultTextWrapper.style.display = 'none';
        if (defaultText) defaultText.removeAttribute('name');

        if (defaultBoolWrapper) defaultBoolWrapper.style.display = 'block';
        if (defaultBool) defaultBool.setAttribute('name', 'defaultValue');
      } else {
        if (defaultBoolWrapper) defaultBoolWrapper.style.display = 'none';
        if (defaultBool) defaultBool.removeAttribute('name');

        if (defaultTextWrapper) defaultTextWrapper.style.display = 'block';
        if (defaultText) {
          defaultText.setAttribute('name', 'defaultValue');
          if (['integer', 'float'].includes(type)) {
            defaultText.type = 'number';
            if (type === 'float') {
              defaultText.step = 'any';
            } else {
              defaultText.step = '1';
            }
          } else {
            defaultText.type = 'text';
            defaultText.removeAttribute('step');
          }
        }
      }
    }

    if (!typeSelect.dataset.nocodeBound) {
      typeSelect.addEventListener('change', updateFields);
      typeSelect.dataset.nocodeBound = 'true';
    }
    updateFields();
  });
}

