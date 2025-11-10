// server.js 
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

// ========== CONSTANTS ==========
const STOPWORDS = new Set([
    "the", "and", "a", "an", "in", "on", "at", "for", "to", "of", "is", "are",
    "was", "were", "it", "this", "that", "with", "as", "by", "from", "be",
    "have", "has", "had", "i", "we", "you", "they", "he", "she", "them",
    "but", "or", "not", "so", "if", "then", "there", "their", "our", "my", "your"
]);

const SENTIMENT_THRESHOLDS = { negative: 0.4, positive: 0.6 };
const SENTIMENT_MAP = { positive: 0.8, neutral: 0.5, negative: 0.2 };

// ========== PROMPT BUILDER ==========
const buildPrompt = (text) => `
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
- keywords: choose 3–7 concise nouns/phrases that best capture the content.
- tone: a single word describing the emotional tone.
- short_summary: one short sentence capturing the gist.

Return ONLY the JSON object.

Text to analyze:
"""${text}"""
`;

// ========== GEMINI API CALL ==========
async function callGeminiAPI(text) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const payload = {
        contents: [{ parts: [{ text: buildPrompt(text) }] }],
        generationConfig: {
            temperature: 0.0,
            maxOutputTokens: 300,
            candidateCount: 1
        }
    };

    const { data } = await axios.post(endpoint, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 25000
    });

    return data;
}

// ========== TEXT EXTRACTION ==========
function extractTextFromResponse(geminiRaw) {
    const candidate = geminiRaw?.candidates?.[0] ||
        geminiRaw?.output?.[0] ||
        geminiRaw?.response;

    if (!candidate) {
        return typeof geminiRaw === "string" ? geminiRaw : JSON.stringify(geminiRaw || "");
    }

    const text = candidate?.content?.parts?.[0]?.text ||
        candidate?.content?.parts?.[0] ||
        candidate?.content ||
        candidate?.text ||
        (Array.isArray(candidate?.content) && candidate.content[0]?.text);

    return typeof text === "string" ? text : JSON.stringify(text || candidate);
}

// ========== JSON PARSING ==========
function parseJsonFromText(rawText) {
    if (!rawText || typeof rawText !== "string") return null;

    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
        return JSON.parse(match[0]);
    } catch {
        // Try cleaning common JSON issues
        const cleaned = match[0]
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]")
            .replace(/'/g, '"');

        try {
            return JSON.parse(cleaned);
        } catch {
            return null;
        }
    }
}

// ========== KEYWORD EXTRACTION ==========
function extractKeywords(text, limit = 6) {
    if (!text || typeof text !== "string") return [];

    const tokens = text
        .replace(/[^\w\s]/g, " ")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

    const freq = new Map();

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (STOPWORDS.has(token) || token.length <= 2) continue;

        freq.set(token, (freq.get(token) || 0) + 1);

        // Bigrams
        if (i + 1 < tokens.length) {
            const bigram = `${token} ${tokens[i + 1]}`;
            if (![...bigram.split(" ")].some(w => STOPWORDS.has(w))) {
                freq.set(bigram, (freq.get(bigram) || 0) + 1.2);
            }
        }
    }

    return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([word]) => word.trim());
}

// ========== FIELD NORMALIZERS ==========
function normalizeSentiment(value, label) {
    if (typeof value === "number") {
        // Handle percentage format
        if (value > 1 && value <= 100) value /= 100;
        return Math.max(0, Math.min(1, value));
    }

    // Derive from label if no numeric value
    if (label) {
        const labelLower = String(label).toLowerCase();
        return SENTIMENT_MAP[labelLower] ?? 0.5;
    }

    return 0.5;
}

function deriveConfidence(sentiment) {
    return Math.max(0.5, Math.min(0.99, 0.4 + Math.abs(sentiment - 0.5) * 1.1));
}

function deriveTone(sentiment) {
    if (sentiment >= 0.7) return "positive";
    if (sentiment <= 0.3) return "negative";
    return "neutral";
}

function deriveSummary(parsed, rawText, originalText) {
    if (parsed?.short_summary) return String(parsed.short_summary);

    const source = rawText || originalText;
    const lines = source.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    return lines.length
        ? lines.slice(0, 2).join(" ").slice(0, 220)
        : originalText.slice(0, 220);
}

// ========== RESPONSE BUILDER ==========
function buildAnalysisResponse(parsed, geminiRaw, rawText, originalText) {
    const sentiment = normalizeSentiment(parsed?.sentiment, parsed?.sentiment_label);
    const confidence = parsed?.confidence ?? deriveConfidence(sentiment);
    const tone = parsed?.tone || deriveTone(sentiment);
    const short_summary = deriveSummary(parsed, rawText, originalText);

    let keywords = Array.isArray(parsed?.keywords)
        ? parsed.keywords.map(String)
        : [];

    if (keywords.length === 0) {
        const keywordSource = short_summary || rawText || originalText;
        keywords = extractKeywords(keywordSource);
    }

    keywords = Array.from(new Set(keywords)).slice(0, 7);

    let sentiment_label = parsed?.sentiment_label || "neutral";
    if (!parsed?.sentiment_label) {
        if (sentiment < SENTIMENT_THRESHOLDS.negative) sentiment_label = "negative";
        else if (sentiment > SENTIMENT_THRESHOLDS.positive) sentiment_label = "positive";
    }

    return {
        model: MODEL,
        sentiment,
        sentiment_label: String(sentiment_label),
        confidence: Number(confidence.toFixed(3)),
        keywords,
        tone,
        short_summary,
        raw: geminiRaw
    };
}

// ========== MAIN ENDPOINT ==========
app.post("/process_text", async (req, res) => {
    try {
        const { text } = req.body ?? {};

        if (!text || typeof text !== "string") {
            return res.status(400).json({ error: "Missing 'text' in request body" });
        }

        const geminiRaw = await callGeminiAPI(text);
        const rawText = extractTextFromResponse(geminiRaw);

        let parsed = parseJsonFromText(rawText);

        // Fallback: check for structured output fields
        if (!parsed) {
            parsed = geminiRaw?.structuredOutput || geminiRaw?.structured_output;
        }

        const response = buildAnalysisResponse(parsed, geminiRaw, rawText, text);
        return res.json(response);

    } catch (err) {
        console.error("Gemini API error:", err?.response?.data || err.message);
        const status = err?.response?.status || 500;
        return res.status(status).json({
            error: err?.response?.data || err?.message || "Unknown error"
        });
    }
});

app.listen(PORT, () => {
    console.log(`Gemini proxy listening on http://localhost:${PORT} (model=${MODEL})`);
});