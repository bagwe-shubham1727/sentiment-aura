// backend/server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Mock external “AI sentiment service” endpoint using axios
async function callFakeAIService(text) {
    // Simulate a remote API call (we’ll just fake the response locally)
    // but demonstrate axios usage as if calling OpenAI, etc.
    const simulatedResponse = await axios.post("https://httpbin.org/post", {
        text,
        fake_model: "mock-sentiment-v1",
    });

    // Derive fake sentiment and keywords locally from the text
    const words = text.split(/\s+/).filter(Boolean);
    const keywords = [...new Set(words)]
        .filter((w) => w.length > 3)
        .slice(0, 5);
    const hash = [...text].reduce((a, c) => a + c.charCodeAt(0), 0);
    const sentiment = ((hash % 100) / 100).toFixed(2);

    return {
        sentiment: Number(sentiment),
        keywords,
        meta: {
            httpbin_id: simulatedResponse.data?.json?.fake_model || "mock-sentiment-v1",
            source: "axios-httpbin",
        },
    };
}


app.post("/process_text", async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || typeof text !== "string") {
            return res.status(400).json({ error: "Invalid text" });
        }

        // simulate processing delay
        await new Promise((r) => setTimeout(r, 600));

        // axios call to fake service
        const aiResult = await callFakeAIService(text);

        console.log(`Processed "${text}" →`, aiResult);
        res.json(aiResult);
    } catch (err) {
        console.error("Error in /process_text:", err.message);
        res.status(500).json({ error: "Internal server error" });
    }
});


app.get("/keywords", async (req, res) => {
    try {
        const { text } = req.query;
        if (!text) return res.status(400).json({ error: "Missing text" });

        // use axios GET to simulate external service call
        const fakeRes = await axios.get("https://httpbin.org/get", {
            params: { q: text },
        });

        const words = text.split(/\s+/).filter((w) => w.length > 4).slice(0, 5);
        res.json({
            keywords: words,
            httpbinArgs: fakeRes.data?.args,
        });
    } catch (err) {
        console.error("Error in /keywords:", err.message);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/", async (req, res) => {
    // example axios call to a public endpoint for demonstration
    const ping = await axios.get("https://api.github.com");
    res.send(`Mock Sentiment Aura backend running. GitHub API status: ${ping.status}`);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Mock backend with axios running at http://localhost:${PORT}`);
});
