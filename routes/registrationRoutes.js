const express = require("express");
const router = express.Router();
const Registration = require("../models/Registration");
const User = require("../models/User");
const Event = require("../models/Event");

// Register for Event
router.post("/", async (req, res) => {
  try {
    const { userId, eventId } = req.body;

    if (!userId || !eventId) {
      return res.status(400).json({ error: "userId and eventId are required" });
    }

    const existing = await Registration.findOne({
      user: userId,
      event: eventId
    });

    if (existing) {
      return res.status(409).json({ error: "User already registered for this event" });
    }

    const registration = new Registration({
      user: userId,
      event: eventId
    });

    await registration.save();
    res.json({ message: "Registered successfully", registration });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Failed to register" });
  }
});

// View User Registrations
router.get("/user", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: "email query is required" });
    }

    const users = await User.find({ email }).select("_id");
    if (!users.length) {
      return res.json([]);
    }

    const userIds = users.map((user) => user._id);
    const registrations = await Registration.find({ user: { $in: userIds } })
      .populate({ path: "event", model: Event })
      .sort({ registeredAt: -1 });

    res.json(registrations);
  } catch (err) {
    console.error("Fetch registrations error:", err);
    res.status(500).json({ error: "Failed to fetch registrations" });
  }
});

router.get("/:userId", async (req, res) => {
  try {
    const registrations = await Registration.find({ user: req.params.userId })
      .populate({ path: "event", model: Event })
      .sort({ registeredAt: -1 });

    res.json(registrations);
  } catch (err) {
    console.error("Fetch registrations by userId error:", err);
    res.status(500).json({ error: "Failed to fetch registrations" });
  }
});

router.delete("/cancel", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const eventId = String(req.body.eventId || "").trim();

    if (!email || !eventId) {
      return res.status(400).json({ error: "email and eventId are required" });
    }

    const users = await User.find({ email }).select("_id");
    if (!users.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const userIds = users.map((user) => user._id);
    const deleted = await Registration.findOneAndDelete({
      user: { $in: userIds },
      event: eventId
    });

    if (!deleted) {
      return res.status(404).json({ error: "Registration not found" });
    }

    res.json({ message: "Registration cancelled" });
  } catch (err) {
    console.error("Cancel registration error:", err);
    res.status(500).json({ error: "Failed to cancel registration" });
  }
});

// Cancel Registration
router.delete("/:id", async (req, res) => {
  await Registration.findByIdAndDelete(req.params.id);
  res.json({ message: "Registration cancelled" });
});

module.exports = router;