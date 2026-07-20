const STRIPE_API_BASE = 'https://api.stripe.com/v1';

function isValidKey(key) {
  return /^(sk|pk)_(test|live)_[A-Za-z0-9]{10,}$/.test(String(key ?? ''));
}

/**
 * Verifica que una Secret Key de Stripe sea válida consultando el endpoint `/v1/balance`.
 * Útil para test de conexión en el wizard de configuración de providers.
 *
 * @param {{ secretKey: string }} params - Parámetros de conexión.
 * @param {string} params.secretKey - Secret Key de Stripe (sk_live_... o sk_test_...).
 * @returns {Promise<boolean>} `true` si la clave es válida y la conexión es exitosa.
 */
export async function testStripeConnection({ secretKey }) {
  if (!isValidKey(secretKey)) return false;
  try {
    const res = await fetch(`${STRIPE_API_BASE}/balance`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Crea una sesión de checkout de Stripe (pago único) vía REST API.
 * Usa `mode=payment` con un solo `line_item` basado en `priceId`.
 *
 * @param {{ secretKey: string, priceId: string, successUrl: string, cancelUrl: string, metadata?: object }} params - Parámetros de la sesión.
 * @param {string} params.secretKey - Secret Key de Stripe.
 * @param {string} params.priceId - ID del precio en Stripe (price_xxx).
 * @param {string} params.successUrl - URL de redirección post-pago exitoso.
 * @param {string} params.cancelUrl - URL de redirección si el usuario cancela.
 * @param {object} [params.metadata] - Metadatos adicionales para adjuntar a la sesión.
 * @returns {Promise<{ ok: boolean, sessionId?: string, url?: string, error?: string }>} Resultado con URL de checkout o error.
 */
export async function createCheckoutSession({ secretKey, priceId, successUrl, cancelUrl, metadata }) {
  const body = new URLSearchParams();
  body.append('mode', 'payment');
  body.append('line_items[0][price]', priceId);
  body.append('line_items[0][quantity]', '1');
  body.append('success_url', successUrl);
  body.append('cancel_url', cancelUrl);
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      body.append(`metadata[${key}]`, String(value));
    }
  }
  const res = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.error?.message || `Stripe ${res.status}` };
  }
  const data = await res.json();
  return { ok: true, sessionId: data.id, url: data.url };
}
