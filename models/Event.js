const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  title: String,
  description: String,
  date: Date,
  time: String,
  startTime: String,
  endTime: String,
  location: String
});

const eventDbName = process.env.MONGO_DB_NAME || "event";
const eventDb = mongoose.connection.useDb(eventDbName, { useCache: true });

module.exports = eventDb.model("Event", eventSchema);