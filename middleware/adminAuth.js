const crypto = require("node:crypto");

const ADMIN_AUTH_SECRET = process.env.ADMIN_AUTH_SECRET || "change-me-admin-auth-secret";

function base64urlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signTokenPart(headerPart, payloadPart) {
  return crypto
    .createHmac("sha256", ADMIN_AUTH_SECRET)
    .update(`${headerPart}.${payloadPart}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createAdminToken(adminId) {
  const headerPart = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadPart = base64urlEncode(
    JSON.stringify({
      sub: String(adminId),
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    })
  );

  const signaturePart = signTokenPart(headerPart, payloadPart);
  return `${headerPart}.${payloadPart}.${signaturePart}`;
}

function verifyAdminToken(token) {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const expectedSignature = signTokenPart(headerPart, payloadPart);

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signaturePart);

  if (expectedBuffer.length !== actualBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64urlDecode(payloadPart));
    if (!payload || payload.role !== "admin" || !payload.sub) {
      return null;
    }

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.header("authorization") || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Admin authentication required" });
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }

  req.admin = {
    id: payload.sub,
    role: payload.role
  };

  return next();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || "").split(":");
  if (!salt || !hash) {
    return false;
  }

  const hashBuffer = Buffer.from(hash, "hex");
  const derived = crypto.scryptSync(password, salt, 64);

  if (derived.length !== hashBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(derived, hashBuffer);
}

module.exports = {
  createAdminToken,
  verifyAdminToken,
  requireAdminAuth,
  hashPassword,
  verifyPassword
};
