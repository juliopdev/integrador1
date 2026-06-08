/**
 * ES: Middleware común de autenticación para comprobar accesos administrativos.
 * Valida los tokens JWT almacenados en las cookies del cliente.
 * 
 * EN: Common authentication middleware to verify administrative access.
 * Validates the JWT tokens stored in the client cookies.
 */

/**
 * ES: Hook preHandler para asegurar que solo cuentas Superadmin puedan proceder.
 * EN: preHandler hook to ensure only Superadmin accounts can proceed.
 * 
 * @param {import('fastify').FastifyRequest} req 
 * @param {import('fastify').FastifyReply} reply 
 */
export async function requireSuperadmin(req, reply) {
  const cookieService = req.scope.resolve('cookieService');
  const tokenService = req.scope.resolve('tokenService');
  
  // ES: Parsear cookies de la cabecera 'Cookie' de la request.
  // EN: Parse cookies from request 'Cookie' header.
  const cookies = cookieService.parse(req.headers.cookie);
  const token = cookies.access_token;

  const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');

  if (!token) {
    if (acceptsHtml) {
      return reply.redirect('/dashboard/login');
    }
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'No access token provided / No se proporcionó token de acceso',
    });
  }

  try {
    const decoded = tokenService.verifyToken(token);
    
    // ES: El superadmin tiene tenantId nulo y rol 'superadmin'.
    // EN: The superadmin has null tenantId and 'superadmin' role.
    if (decoded.role !== 'superadmin' || decoded.tenantId !== null) {
      throw new Error('Forbidden: Superadmin access required / Se requiere acceso de Superadministrador');
    }

    req.adminUser = decoded;
  } catch (error) {
    if (acceptsHtml) {
      return reply.redirect('/dashboard/login');
    }
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: error.message || 'Invalid or expired access token / Token de acceso inválido o expirado',
    });
  }
}
