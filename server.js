const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const EXPECTED_DB_NAME = process.env.MONGO_DB_NAME || "event";

function buildMongoUriWithDbName(rawUri, dbName) {
  if (!rawUri) {
    throw new Error("MONGO_URI is missing in .env");
  }

  const parsed = new URL(rawUri);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/registrations", require("./routes/registrationRoutes"));
app.use("/api/ai", require("./routes/aiRoutes"));
app.use("/api/admin-auth", require("./routes/adminAuthRoutes"));

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    const mongoUri = buildMongoUriWithDbName(process.env.MONGO_URI, EXPECTED_DB_NAME);

    await mongoose.connect(mongoUri, {
      dbName: EXPECTED_DB_NAME
    });

    const activeDb = mongoose.connection.name;
    if (activeDb !== EXPECTED_DB_NAME) {
      throw new Error(
        `Connected to unexpected database "${activeDb}". Expected "${EXPECTED_DB_NAME}".`
      );
    }

    console.log("MongoDB connected");
    console.log("Database:", activeDb);

    app.listen(PORT, () => {
      console.log(`Server running on ${PORT}`);
    });
  } catch (err) {
    console.error("DB startup error:", err.message);
    process.exit(1);
  }
}

startServer();