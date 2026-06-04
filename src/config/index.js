require("dotenv").config();

const config = {
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT || "3000", 10),
  session: {
    secret: process.env.SESSION_SECRET || "super_secret_dev_key_2025",
  },
  database: {
    masterType: process.env.DB_MASTER_TYPE || "json",
  },
};

module.exports = config;
