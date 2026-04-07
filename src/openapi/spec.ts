const userFields = {
  id: { type: 'integer', format: 'int32' },
  email: { type: ['string', 'null'] },
  username: { type: ['string', 'null'] },
  phone: { type: ['string', 'null'] },
  fbid: { type: ['string', 'null'] },
  googleId: { type: ['string', 'null'] },
  dataJson: { type: ['object', 'null'] },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
};

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Elaf Backend API',
    description:
      'Dokumentasi OpenAPI buat layanan user, profile, bisnis, dan auth.',
    version: '1.0.0',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          ...userFields,
          password: { type: ['string', 'null'] },
        },
      },
      Profile: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          userId: { type: 'integer' },
          name: { type: ['string', 'null'] },
          email: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          dataJson: { type: ['object', 'null'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      AuthLogin: {
        type: 'object',
        required: ['identifier', 'password'],
        properties: {
          identifier: { type: 'string' },
          password: { type: 'string' },
        },
      },
      AuthProfileUpdate: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          dataJson: { type: 'object' },
        },
      },
      ForgotPassword: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: { type: 'string' },
        },
      },
      AuthTestToken: {
        type: 'object',
        properties: {
          userId: { type: 'integer', format: 'int32' },
          customerId: { type: 'integer', format: 'int32' },
        },
        description:
          'Salah satu dari userId atau customerId wajib diisi. Hanya untuk kebutuhan testing di non-production.',
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/users': {
      get: {
        summary: 'List user',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          200: {
            description: 'Daftar user',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/User' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Buat user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/User' },
            },
          },
        },
        responses: {
          201: {
            description: 'User dibuat',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          409: {
            description: 'Bentrok data unik',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/users/{id}': {
      get: {
        summary: 'Detail user',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } },
      },
      put: {
        summary: 'Update user',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
        },
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        summary: 'Hapus user',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/profiles': {
      get: {
        summary: 'List profile',
        responses: { 200: { description: 'OK' } },
      },
      post: {
        summary: 'Upsert profile',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Profile' } } },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/profiles/{id}': {
      get: {
        summary: 'Detail profile',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detail' } },
      },
      put: {
        summary: 'Update profile',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Profile' } } },
        },
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        summary: 'Hapus profile',
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Login',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthLogin' } } },
        },
        responses: { 200: { description: 'Token' }, 401: { description: 'Unauthorized' } },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Logout',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/auth/test-token': {
      post: {
        summary: 'Generate Bearer token untuk testing (non-production only)',
        description:
          'Generate JWT Bearer token berdasarkan userId (admin) atau customerId (customer). Endpoint ini hanya aktif bila NODE_ENV bukan production.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthTestToken' },
              example: {
                userId: 1,
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Token berhasil dibuat',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    tokenType: { type: 'string', example: 'Bearer' },
                    accessToken: { type: 'string' },
                    expiresIn: { type: 'integer', description: 'Unix timestamp expiry' },
                    target: { type: 'string', enum: ['user', 'customer'] },
                    userId: { type: 'integer', nullable: true },
                    customerId: { type: 'integer', nullable: true },
                  },
                },
              },
            },
          },
          400: {
            description: 'Payload tidak valid (userId atau customerId kosong)',
          },
          403: {
            description: 'Endpoint tidak tersedia di production',
          },
          404: {
            description: 'User atau customer tidak ditemukan',
          },
        },
      },
    },
    '/auth/profile': {
      get: {
        summary: 'Profile login',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
      put: {
        summary: 'Edit profile login',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthProfileUpdate' } } },
        },
        responses: { 200: { description: 'Updated' } },
      },
    },
    '/auth/forgot-password': {
      post: {
        summary: 'Lupa password',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ForgotPassword' } } },
        },
        responses: { 200: { description: 'Token dibuat' } },
      },
    },
  },
};

export default openApiSpec;
