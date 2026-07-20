/**
 * Entry point para los portales de autenticación (login/activación).
 * Inicializa el dispatcher global y monta los componentes interactivos (Form, Input, ToastStack).
 * @module auth.entry
 */
import { initDispatcher } from './lib/dispatcher.js';
import { mountAll } from './lib/mount.js';
import { Input } from '../components/input/ui.js';
import { ToastStack } from '../components/toast/ui.js';
import { Form } from '../components/form/ui.js';

initDispatcher();
mountAll({
  '.c-form': Form,
  '.c-input': Input,
  '.c-toast-stack': ToastStack,
});
