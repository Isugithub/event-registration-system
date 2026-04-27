const express = require("express");
const router = express.Router();

const Admin = require("../models/Admin");
const {
  createAdminToken,
  requireAdminAuth,
  hashPassword,
  verifyPassword
} = require("../middleware/adminAuth");

router.post("/signup", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existingAdmin = await Admin.findOne({ email }).lean();
    if (existingAdmin) {
      return res.status(409).json({ error: "Admin account already exists" });
    }

    const admin = new Admin({
      name,
      email,
      passwordHash: hashPassword(password)
    });

    await admin.save();

    return res.status(201).json({
      token: createAdminToken(admin._id),
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email
      }
    });
  } catch (err) {
    console.error("Admin signup error:", err);
    return res.status(500).json({ error: "Failed to create admin account" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const admin = await Admin.findOne({ email });
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({
      token: createAdminToken(admin._id),
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email
      }
    });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({ error: "Failed to login" });
  }
});

router.get("/me", requireAdminAuth, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("_id name email");
    if (!admin) {
      return res.status(404).json({ error: "Admin account not found" });
    }

    return res.json({
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email
      }
    });
  } catch (err) {
    console.error("Admin me error:", err);
    return res.status(500).json({ error: "Failed to load admin profile" });
  }
});

module.exports = router;
