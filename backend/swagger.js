const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DONNES I.T SERVICES E-Commerce API',
      version: '1.0.0',
      description: 'Interactive REST API documentation for DONNES I.T SERVICES. Consumers browse and purchase items, while administrators manage inventory and track orders.',
      contact: {
        name: 'DONNES I.T SERVICES Operations',
        email: 'admin@donnes.co.ke'
      }
    },
    servers: [
      {
        url: 'http://localhost:8080',
        description: 'Development Server'
      }
    ]
  },
  apis: [__filename, './server.js']
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
