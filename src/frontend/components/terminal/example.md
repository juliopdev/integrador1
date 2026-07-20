# Button Component

## Caso 1: En la vista EJS del Dashboard:
```ejs
<!-- Envoltura de tarjeta con consola de logs SSE dentro -->
<%- include('frontend/components/card/ui', {
  title: 'Terminal Console',
  subtitle: 'Interactive command-line interface',
  body: include('frontend/components/terminal/ui', {
    id: 'build-logs',
    title: 'terminal — bash',
    sseSrc: '/api/v1/builds/stream', // URL de Fastify que emite text/event-stream
    maxLines: 200 // Máximo número de líneas que mantiene en memoria
  })
}) %>
```

## Caso 2: Del lado del Servidor (Fastify Endpoint):
```js
// Ejemplo de controlador backend emitiendo SSE
fastify.get('/api/v1/builds/stream', (request, reply) => {
  const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
  };
  reply.raw.writeHead(200, headers);

  // Enviar líneas de log iniciales
  reply.raw.write(`data: \x1b[33mi DevCo Terminal v2.4.1 – ready\x1b[0m\n\n`);
  reply.raw.write(`data: \x1b[36m> npm install @devco/ui\x1b[0m\n\n`);
  reply.raw.write(`data: · ✓ Resolved 142 packages in 1.2s\n\n`);
  reply.raw.write(`data: · ✓ Installed in 3.8s\n\n`);
  
  // Puedes seguir emitiendo líneas dinámicamente con setInterval o eventos del sistema
  const interval = setInterval(() => {
    reply.raw.write(`data: \x1b[32m✓ ✓ Build complete → dist/ (24.3 kB)\x1b[0m\n\n`);
  }, 3000);

  request.raw.on('close', () => {
    clearInterval(interval);
  });
});
```
