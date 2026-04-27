const express = require("express");
const router = express.Router();

const Event = require("../models/Event");
const { requireAdminAuth } = require("../middleware/adminAuth");

// Create Event
router.post("/", requireAdminAuth, async (req, res) => {
  try {
    console.log("Incoming Data:", req.body);

    const event = new Event(req.body);
    await event.save();

    console.log("Saved:", event);

    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save event" });
  }
});

// Get All Events
router.get("/", async (req, res) => {
  try {
    const events = await Event.find();
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// Get Single Event
router.get("/:id", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

module.exports = router;