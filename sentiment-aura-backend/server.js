// server.js 
import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

// ========== CONFIGURATION ==========
class Config {
    static PORT = process.env.PORT || 3001;
    static API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    static MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    static NODE_ENV = process.env.NODE_ENV || "development";
    static DEBUG = process.env.DEBUG === "true";
    static API_TIMEOUT = parseInt(process.env.API_TIMEOUT || "25000");
    static RATE_LIMIT = parseInt(process.env.RATE_LIMIT || "100");

    static FRONTEND_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        process.env.FRONTEND_URL,
    ].filter(Boolean);

    static validate() {
        if (!this.API_KEY) {
            console.error("Missing GOOGLE_API_KEY / GEMINI_API_KEY in .env");
            return false;
        }
        return true;
    }

    static print() {
        if (this.NODE_ENV === "development") {
            console.log("\nSentiment Aura API Server");
            console.log("━".repeat(50));
            console.log(`Environment:     ${this.NODE_ENV}`);
            console.log(`AI Provider:     Gemini (${this.MODEL})`);
            console.log(`API Key:         ${this.API_KEY ? "Configured" : "Missing"}`);
            console.log(`Timeout:         ${this.API_TIMEOUT}ms`);
            console.log(`Debug Mode:      ${this.DEBUG ? "ON" : "OFF"}`);
            console.log(`CORS Origins:    ${this.FRONTEND_ORIGINS.length} configured`);
            console.log("━".repeat(50) + "\n");
        }
    }
}

// ========== CUSTOM ERROR CLASSES ==========
class APIError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends APIError {
    constructor(message, details = null) {
        super(message, 400, details);
    }
}

class GeminiAPIError extends APIError {
    constructor(message, statusCode = 500, details = null) {
        super(message, statusCode, details);
    }
}

class ParseError extends APIError {
    constructor(message, details = null) {
        super(message, 500, details);
    }
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

// ========== EXPRESS APP SETUP ==========
const app = express();

// Middleware
app.use(express.json({ limit: "96kb" }));
app.use(cors({
    origin: Config.FRONTEND_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));

// Request logging middleware
app.use((req, res, next) => {
    if (Config.DEBUG) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${req.method} ${req.path}`);
    }
    next();
});

// Request ID middleware for tracking
app.use((req, res, next) => {
    req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader("X-Request-ID", req.id);
    next();
});

// ========== VALIDATION ==========
function validateTextInput(text) {
    if (!text) {
        throw new ValidationError("Missing 'text' in request body", { field: "text" });
    }

    if (typeof text !== "string") {
        throw new ValidationError("'text' must be a string", {
            field: "text",
            received: typeof text
        });
    }

    if (text.trim().length === 0) {
        throw new ValidationError("'text' cannot be empty", { field: "text" });
    }

    if (text.length > 10000) {
        throw new ValidationError("'text' exceeds maximum length of 10,000 characters", {
            field: "text",
            length: text.length,
            max: 10000
        });
    }

    return text.trim();
}

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

// ========== GEMINI API CALL WITH RETRY ==========
async function callGeminiAPI(text, retries = 2) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${Config.MODEL}:generateContent?key=${Config.API_KEY}`;

    const payload = {
        contents: [{ parts: [{ text: buildPrompt(text) }] }],
        generationConfig: {
            temperature: 0.0,
            maxOutputTokens: 300,
            candidateCount: 1
        }
    };

    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            if (Config.DEBUG && attempt > 0) {
                console.log(`Retry attempt ${attempt}/${retries}`);
            }

            const { data } = await axios.post(endpoint, payload, {
                headers: { "Content-Type": "application/json" },
                timeout: Config.API_TIMEOUT
            });

            return data;

        } catch (err) {
            lastError = err;

            // Don't retry on client errors (4xx)
            if (err?.response?.status >= 400 && err?.response?.status < 500) {
                break;
            }

            // Wait before retry (exponential backoff)
            if (attempt < retries) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // All retries failed
    const status = lastError?.response?.status || 500;
    const message = lastError?.response?.data?.error?.message || lastError?.message || "Unknown error";

    throw new GeminiAPIError(
        `Gemini API call failed: ${message}`,
        status,
        {
            endpoint: Config.MODEL,
            attempts: retries + 1,
            originalError: lastError?.response?.data
        }
    );
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
        if (value > 1 && value <= 100) value /= 100;
        return Math.max(0, Math.min(1, value));
    }

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

function deriveSentimentLabel(sentiment) {
    if (sentiment < SENTIMENT_THRESHOLDS.negative) return "negative";
    if (sentiment > SENTIMENT_THRESHOLDS.positive) return "positive";
    return "neutral";
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

    const sentiment_label = parsed?.sentiment_label || deriveSentimentLabel(sentiment);

    return {
        success: true,
        data: {
            model: Config.MODEL,
            sentiment,
            sentiment_label: String(sentiment_label),
            confidence: Number(confidence.toFixed(3)),
            keywords,
            tone,
            short_summary
        },
        metadata: {
            timestamp: new Date().toISOString(),
            processing_time: null, // Will be set by endpoint
        },
        ...(Config.DEBUG && { debug: { raw: geminiRaw, rawText } })
    };
}

// ========== ERROR RESPONSE BUILDER ==========
function buildErrorResponse(error, requestId) {
    const response = {
        success: false,
        error: {
            message: error.message,
            type: error.name,
            statusCode: error.statusCode || 500,
            requestId
        },
        timestamp: new Date().toISOString()
    };

    if (Config.DEBUG && error.details) {
        response.error.details = error.details;
    }

    if (Config.DEBUG && error.stack) {
        response.error.stack = error.stack;
    }

    return response;
}

// ========== HEALTH & STATUS ENDPOINTS ==========
app.get("/", (req, res) => {
    res.json({
        name: "Sentiment Aura API",
        version: "2.0.0",
        status: "operational",
        provider: "Gemini",
        model: Config.MODEL,
        environment: Config.NODE_ENV,
        endpoints: {
            "GET /": "API information",
            "GET /api/health": "Health check",
            "GET /api/status": "Detailed status",
            "POST /process_text": "Analyze text sentiment",
            "POST /api/process_text": "Analyze text sentiment (alternative path)"
        },
        documentation: "https://github.com/bagwe-shubham1727/sentiment-aura"
    });
});

app.get("/api/health", (req, res) => {
    const isHealthy = Config.API_KEY && true;

    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
            api_key: !!Config.API_KEY,
            environment: Config.NODE_ENV
        }
    });
});

app.get("/api/status", (req, res) => {
    res.json({
        status: "operational",
        environment: Config.NODE_ENV,
        debug: Config.DEBUG,
        configuration: {
            provider: "Gemini",
            model: Config.MODEL,
            api_key_configured: !!Config.API_KEY,
            timeout: Config.API_TIMEOUT,
            cors_origins: Config.FRONTEND_ORIGINS.length
        },
        system: {
            node_version: process.version,
            platform: process.platform,
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB"
            },
            uptime: Math.round(process.uptime()) + "s"
        },
        timestamp: new Date().toISOString()
    });
});

// ========== MAIN PROCESSING ENDPOINT ==========
async function processTextHandler(req, res) {
    const startTime = Date.now();

    try {
        // Input validation
        const text = validateTextInput(req.body?.text);

        // Special case: very short text
        if (text.length < 3) {
            return res.json({
                success: true,
                data: {
                    model: Config.MODEL,
                    sentiment: 0.5,
                    sentiment_label: "neutral",
                    confidence: 0.5,
                    keywords: [],
                    tone: "neutral",
                    short_summary: text
                },
                metadata: {
                    timestamp: new Date().toISOString(),
                    processing_time: Date.now() - startTime,
                    note: "Text too short for meaningful analysis"
                }
            });
        }

        // Call Gemini API with retry
        const geminiRaw = await callGeminiAPI(text);
        const rawText = extractTextFromResponse(geminiRaw);

        // Parse response
        let parsed = parseJsonFromText(rawText);

        // Fallback: check for structured output
        if (!parsed) {
            parsed = geminiRaw?.structuredOutput || geminiRaw?.structured_output;
        }

        // Build response
        const response = buildAnalysisResponse(parsed, geminiRaw, rawText, text);
        response.metadata.processing_time = Date.now() - startTime;

        if (Config.DEBUG) {
            console.log(`Request ${req.id} completed in ${response.metadata.processing_time}ms`);
        }

        return res.json(response);

    } catch (error) {
        const errorResponse = buildErrorResponse(error, req.id);

        // Log error
        console.error(`Request ${req.id} failed:`, error.message);
        if (Config.DEBUG) {
            console.error(error.stack);
        }

        return res.status(error.statusCode || 500).json(errorResponse);
    }
}

// Register endpoint on both paths
app.post("/process_text", processTextHandler);
app.post("/api/process_text", processTextHandler);

// ========== 404 HANDLER ==========
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: {
            message: "Endpoint not found",
            type: "NotFoundError",
            statusCode: 404,
            path: req.path,
            method: req.method
        },
        timestamp: new Date().toISOString()
    });
});

// ========== GLOBAL ERROR HANDLER ==========
app.use((err, req, res, next) => {
    const errorResponse = buildErrorResponse(err, req.id);

    console.error(`Unhandled error in request ${req.id}:`, err);

    res.status(err.statusCode || 500).json(errorResponse);
});

// ========== SERVER STARTUP ==========
function startServer() {
    if (!Config.validate()) {
        console.error("\nConfiguration validation failed. Server not started.\n");
        process.exit(1);
    }

    Config.print();

    app.listen(Config.PORT, () => {
        console.log(`Server running on http://localhost:${Config.PORT}`);
        console.log(`Health check: http://localhost:${Config.PORT}/api/health`);
        console.log(`Status: http://localhost:${Config.PORT}/api/status`);
        console.log(`\nReady to process requests!\n`);
    });
}

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("\nSIGTERM received. Shutting down gracefully...");
    process.exit(0);
});

process.on("SIGINT", () => {
    console.log("\nSIGINT received. Shutting down gracefully...");
    process.exit(0);
});

startServer();