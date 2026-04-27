const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const Event = require("../models/Event");

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || "http://localhost:3000";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForCompare(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripGenericWords(value) {
  return String(value || "")
    .replace(/^(gimme|give\s+me|show\s+me|tell\s+me|can\s+you|please)\s+/i, "")
    .replace(/\b(details?|info(?:rmation)?|about|for|on|event)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchCandidates(prompt) {
  const raw = String(prompt || "").trim();
  const candidates = new Set();

  if (!raw) {
    return [];
  }

  candidates.add(raw);

  const aboutMatch = raw.match(/\b(?:about|for|on|regarding)\b\s+(.+)$/i);
  if (aboutMatch && aboutMatch[1]) {
    candidates.add(aboutMatch[1].trim());
  }

  const withoutGenericWords = stripGenericWords(raw);
  if (withoutGenericWords) {
    candidates.add(withoutGenericWords);
  }

  return Array.from(candidates).filter(Boolean);
}

function tokenizeMeaningful(value) {
  const stopWords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "details", "event", "events",
    "for", "from", "get", "gimme", "give", "i", "in", "info", "information", "is",
    "it", "me", "of", "on", "please", "show", "tell", "the", "to", "want", "with",
    "you", "about", "regarding", "can"
  ]);

  return normalizeForCompare(value)
    .split(" ")
    .filter((token) => token && !stopWords.has(token));
}

function selectBestTokenMatch(events, candidates) {
  let best = null;

  for (const candidate of candidates) {
    const candidateTokens = tokenizeMeaningful(candidate);
    if (!candidateTokens.length) {
      continue;
    }

    for (const event of events) {
      const titleTokens = new Set(tokenizeMeaningful(event.title));
      const overlapCount = candidateTokens.filter((token) => titleTokens.has(token)).length;
      if (!overlapCount) {
        continue;
      }

      const ratio = overlapCount / candidateTokens.length;
      const qualifies = ratio >= 0.6 || overlapCount >= 2;
      if (!qualifies) {
        continue;
      }

      const dateWeight = event.date ? new Date(event.date).getTime() : 0;
      const rank = ratio * 1000 + overlapCount * 10 + dateWeight / 1e13;

      if (!best || rank > best.rank) {
        best = { event, rank };
      }
    }
  }

  return best ? best.event : null;
}

function getProvider() {
  return (process.env.AI_PROVIDER || "groq").toLowerCase();
}

function getClientAndModel() {
  const provider = getProvider();

  if (provider === "groq") {
    return {
      provider,
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      client: new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1"
      })
    };
  }

  return {
    provider: "openai",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    client: new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  };
}

router.post("/event-info", async (req, res) => {
  try {
    const inputPrompt = req.body.prompt || req.body.eventName;

    if (!inputPrompt || !String(inputPrompt).trim()) {
      return res.status(400).json({ error: "Prompt required" });
    }

    const normalizedPrompt = String(inputPrompt).trim();
    const searchCandidates = buildSearchCandidates(normalizedPrompt);

    let savedEvent = null;

    // Try exact and contains lookups using extracted candidate phrases.
    for (const candidate of searchCandidates) {
      const exactPattern = new RegExp(`^${escapeRegex(candidate)}$`, "i");
      const containsPattern = new RegExp(escapeRegex(candidate), "i");

      savedEvent = await Event.findOne({ title: exactPattern }).lean();
      if (savedEvent) {
        break;
      }

      savedEvent = await Event.findOne({
        $or: [
          { title: containsPattern },
          { description: containsPattern },
          { location: containsPattern }
        ]
      })
        .sort({ date: -1, _id: -1 })
        .lean();

      if (savedEvent) {
        break;
      }
    }

    if (!savedEvent) {
      const recentEvents = await Event.find({})
        .sort({ date: -1, _id: -1 })
        .limit(200)
        .lean();

      savedEvent = selectBestTokenMatch(recentEvents, searchCandidates);
    }

    if (!savedEvent) {
      return res.status(404).json({
        error: `No saved event found for \"${normalizedPrompt}\". Create an event first, then ask again.`
      });
    }

    const dateText = savedEvent.date
      ? new Date(savedEvent.date).toDateString()
      : "Not specified";
    const registrationLink = `${FRONTEND_BASE_URL}/register?eventId=${savedEvent._id}`;

    // Return database-sourced event data, optionally polished by AI.
    const dbSummary = [
      `Title: ${savedEvent.title || ""}`,
      `Description: ${savedEvent.description || ""}`,
      `Date: ${dateText}`,
      `Start Time: ${savedEvent.startTime || savedEvent.time || "Not specified"}`,
      `End Time: ${savedEvent.endTime || "Not specified"}`,
      `Location: ${savedEvent.location || ""}`
    ].join("\n");

    const { provider, client, model } = getClientAndModel();

    if (provider === "groq" && !process.env.GROQ_API_KEY) {
      return res.json({
        source: "database",
        event: savedEvent,
        registrationLink,
        result: dbSummary
      });
    }

    if (provider === "openai" && !process.env.OPENAI_API_KEY) {
      return res.json({
        source: "database",
        event: savedEvent,
        registrationLink,
        result: dbSummary
      });
    }

    let aiSummary = null;
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: "You are an event assistant. Answer using only provided database fields. Do not invent details. Do not print or expose any URL in the response text."
          },
          {
            role: "user",
            content: `User prompt: ${normalizedPrompt}\n\nSaved event details:\n${dbSummary}\n\nGive a helpful response based on this saved event.`
          }
        ],
        temperature: 0.4
      });

      aiSummary = response.choices[0].message.content;
    } catch (aiErr) {
      console.error("AI summarize warning:", {
        status: aiErr.status,
        code: aiErr.code,
        message: aiErr.message
      });
    }

    res.json({
      source: "database",
      provider,
      model,
      event: savedEvent,
      registrationLink,
      result: aiSummary || dbSummary
    });

  } catch (err) {
    const status = err.status || 500;
    const message = err.message || "AI failed";

    console.error("AI ERROR:", {
      status,
      code: err.code,
      message
    });

    res.status(status).json({
      error: message,
      code: err.code || null
    });
  }
});

module.exports = router;