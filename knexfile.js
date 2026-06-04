require("dotenv").config();

module.exports = {
  development: {
    client: "mysql2",
    connection: {
      host: process.env.DB_HOST || "127.0.0.1",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "realtime_orders",
      port: process.env.DB_PORT || 3306,
    },
    migrations: {
      directory: "./migrations",
    },
  },
};
