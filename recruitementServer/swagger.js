const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Recruitment API Documentation",
      version: "1.0.0",
      description: "API documentation for Recruitment Portal",
    },

    servers: [
      {
        url: "http://192.168.1.57:3500", // backend URL
      },
      {
        url: "http://192.168.1.136:3500", // backend URL
      },
    ],

    components: {
      securitySchemes: {
        sessionAuth: {
          type: "apiKey",
          in: "cookie",
          name: "session", // express-session cookie name
        },
        userAuth: {
          type: "apiKey",
          in: "cookie",
          name: "user", // your login cookie
        },
      },
    },

    // 👇 PLACE BOTH SEPARATELY (IMPORTANT)
    security: [{ sessionAuth: [] }, { userAuth: [] }],
  },

  apis: [
    path.join(__dirname, "routes/*.js"),
    path.join(__dirname, "routes/**/*.js"),
    path.join(__dirname, "recruitment/**/*.js"),
  ],
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };
