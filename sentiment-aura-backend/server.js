// server.js (fixed: robust rawModelText handling)
import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json({ limit: "96kb" }));
app.use(cors());

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!API_KEY) {
    console.error("Missing GOOGLE_API_KEY / GEMINI_API_KEY in .env - exiting");
    process.exit(1);
}

/* ---------- prompt builder ---------- */
function buildPrompt(text) {
    return `
You are an analysis engine. Analyze the following text and respond ONLY with valid JSON (no explanation, no extra text).

The JSON must contain exactly these fields:
{
  "sentiment": <number between 0 and 1>,
  "sentiment_label": <"negative" | "neutral" | "positive">,
  "confidence": <number between 0 and 1>,
  "keywords": [ array of 3-7 short keywords or key phrases ],
  "tone": <single-word emotion label, e.g. "joyful", "angry", "calm">,
  "short_summary": <one-sentence summary>
}

Guidelines:
- sentiment: 0 = very negative, 0.5 = neutral, 1 = very positive.
- sentiment_label: map sentiment to "negative" if <0.4, "neutral" if between 0.4 and 0.6, "positive" if >0.6.
- confidence: how confident you are that the sentiment label is correct (0..1).
- keywords: choose 3–7 concise nouns/phrases that best capture the content (no stopwords, avoid punctuation).
- tone: a single word describing the emotional tone (prefer common single-token words).
- short_summary: one short sentence capturing the gist.

Return ONLY the JSON object. Example (do not output this example — it is for formatting guidance):
{
  "sentiment": 0.82,
  "sentiment_label": "positive",
  "confidence": 0.9,
  "keywords": ["product launch", "team", "excitement"],
  "tone": "joyful",
  "short_summary": "The speaker is excited about the product launch and proud of the team."
}

Text to analyze:
"""${text}"""
`;
}

/* ---------- call Gemini (axios / REST) ---------- */
async function callGeminiAPI(text) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const payload = {
        contents: [
            {
                parts: [{ text: buildPrompt(text) }],
            },
        ],
        generationConfig: {
            temperature: 0.0,
            maxOutputTokens: 300,
            candidateCount: 1,
        },
    };

    const headers = { "Content-Type": "application/json" };
    const { data } = await axios.post(endpoint, payload, { headers, timeout: 25000 });
    return data;
}

/* ---------- fallback keyword extractor ---------- */
function extractKeywordsFallback(text, limit = 5) {
    if (!text || typeof text !== "string") return [];

    const stopwords = new Set([
        "the", "and", "a", "an", "in", "on", "at", "for", "to", "of", "is", "are", "was", "were", "it",
        "this", "that", "with", "as", "by", "from", "be", "have", "has", "had", "i", "we", "you", "they",
        "he", "she", "them", "but", "or", "not", "so", "if", "then", "there", "their", "our", "my", "your",
    ]);

    const tokens = text
        .replace(/[^\w\s]/g, " ")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

    const freq = new Map();
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (stopwords.has(t) || t.length <= 2) continue;
        freq.set(t, (freq.get(t) || 0) + 1);
        if (i + 1 < tokens.length) {
            const b = `${t} ${tokens[i + 1]}`;
            if (![...b.split(" ")].some((w) => stopwords.has(w))) {
                freq.set(b, (freq.get(b) || 0) + 1.2);
            }
        }
    }

    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    const picks = sorted.slice(0, limit).map((p) => p[0]);
    return picks.map((k) => k.trim());
}

/* ---------- robust JSON parse helper ---------- */
function parseJsonFromText(rawText) {
    if (!rawText || typeof rawText !== "string") return null;
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        return JSON.parse(match[0]);
    } catch (e) {
        let cleaned = match[0].replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/'/g, '"');
        try {
            return JSON.parse(cleaned);
        } catch (e2) {
            return null;
        }
    }
}

/* ---------- main endpoint ---------- */
app.post("/process_text", async (req, res) => {
    try {
        const { text } = req.body ?? {};
        if (!text || typeof text !== "string") return res.status(400).json({ error: "Missing 'text' in request body" });

        // call Gemini
        const geminiRaw = await callGeminiAPI(text);

        // Candidate extraction: support multiple response shapes
        const candidate = geminiRaw?.candidates?.[0] || geminiRaw?.output?.[0] || geminiRaw?.response || null;

        // Build a safe string for rawModelText (always a string)
        let rawModelText = "";
        if (!candidate) {
            // if geminiRaw is a string use it; otherwise stringify for debugging
            rawModelText = typeof geminiRaw === "string" ? geminiRaw : JSON.stringify(geminiRaw || "");
        } else {
            // Try common nested fields, fall back to JSON string of candidate
            rawModelText =
                (candidate?.content?.parts?.[0]?.text) ||
                (candidate?.content?.parts?.[0]) ||
                candidate?.content ||
                candidate?.text ||
                (Array.isArray(candidate?.content) && candidate.content[0]?.text) ||
                JSON.stringify(candidate);
            // ensure string
            if (typeof rawModelText !== "string") {
                try {
                    rawModelText = JSON.stringify(rawModelText);
                } catch (e) {
                    rawModelText = String(rawModelText || "");
                }
            }
        }

        // parse JSON from text (only pass strings)
        let parsed = null;
        if (typeof rawModelText === "string") parsed = parseJsonFromText(rawModelText);

        // fallback: structuredOutput fields
        if (!parsed) {
            if (geminiRaw?.structuredOutput) parsed = geminiRaw.structuredOutput;
            else if (geminiRaw?.structured_output) parsed = geminiRaw.structured_output;
        }

        // normalized response fields
        let sentiment = null;
        let sentiment_label = "neutral";
        let confidence = null;
        let keywords = [];
        let tone = null;
        let short_summary = "";

        if (parsed && typeof parsed === "object") {
            if (typeof parsed.sentiment === "number") sentiment = parsed.sentiment;
            if (parsed.sentiment_label) sentiment_label = String(parsed.sentiment_label);
            if (typeof parsed.confidence === "number") confidence = parsed.confidence;
            if (Array.isArray(parsed.keywords)) keywords = parsed.keywords.map(String);
            if (parsed.tone) tone = String(parsed.tone);
            if (parsed.short_summary) short_summary = String(parsed.short_summary);
        }

        // If sentiment missing but label exists, map label -> numeric
        if (sentiment === null && parsed && parsed.sentiment_label) {
            const lab = String(parsed.sentiment_label).toLowerCase();
            if (lab === "positive") sentiment = 0.8;
            if (lab === "neutral") sentiment = 0.5;
            if (lab === "negative") sentiment = 0.2;
        }

        // confidence heuristic
        if (confidence === null) {
            if (typeof sentiment === "number") confidence = Math.max(0.5, Math.min(0.99, 0.4 + Math.abs(sentiment - 0.5) * 1.1));
            else confidence = 0.6;
        }

        // normalize sentiment
        if (typeof sentiment === "number") {
            if (sentiment > 1 && sentiment <= 100) sentiment = sentiment / 100;
            sentiment = Math.max(0, Math.min(1, Number(sentiment) || 0.5));
        } else {
            sentiment = 0.5;
        }

        // If keywords empty, run fallback extractor using best source available
        if (!Array.isArray(keywords) || keywords.length === 0) {
            const sourceForKeywords = (short_summary && typeof short_summary === "string" && short_summary) || (rawModelText && String(rawModelText)) || text;
            keywords = extractKeywordsFallback(sourceForKeywords, 6);
        }

        // tone fallback
        if (!tone) {
            if (sentiment >= 0.7) tone = "positive";
            else if (sentiment <= 0.3) tone = "negative";
            else tone = "neutral";
        }

        // short_summary fallback - use parsed.short_summary if present, else create from rawModelText or original text
        if (!short_summary) {
            if (parsed?.short_summary) short_summary = String(parsed.short_summary);
            else {
                // safe: rawModelText is string here
                const s = typeof rawModelText === "string" ? rawModelText : String(rawModelText || "");
                // try to pick first non-empty line or truncate
                const firstLines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                short_summary = firstLines.length ? firstLines.slice(0, 2).join(" ").slice(0, 220) : text.slice(0, 220);
            }
        }

        // dedupe keywords & limit
        keywords = Array.from(new Set((keywords || []).map(String))).slice(0, 7);

        return res.json({
            model: MODEL,
            sentiment,
            sentiment_label,
            confidence: Number(confidence.toFixed(3)),
            keywords,
            tone,
            short_summary,
            raw: geminiRaw,
        });
    } catch (err) {
        console.error("Gemini axios error:", err?.response?.data || err.message || err);
        const status = err?.response?.status || 500;
        return res.status(status).json({ error: err?.response?.data || err?.message || "Unknown error" });
    }
});

app.listen(PORT, () => {
    console.log(`Gemini proxy listening on http://localhost:${PORT}  (model=${MODEL})`);
});
