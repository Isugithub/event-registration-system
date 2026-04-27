const express = require("express");
const router = express.Router();
const User = require("../models/User");

// Create User
router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    let user = await User.findOne({ email });

    if (user) {
      if (name && user.name !== name) {
        user.name = name;
        await user.save();
      }

      return res.json(user);
    }

    user = new User({ name, email });
    await user.save();
    res.json(user);
  } catch (err) {
    console.error("User create error:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

module.exports = router;