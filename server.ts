import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Establish Backend Trust Boundary & Abuse Control
  // Rate limiting for API routes
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: "查詢次數過多，請稍後再試。" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api/", apiLimiter);

  // 2. Proxy Dictionary API with Validation
  app.get("/api/dictionary", async (req, res) => {
    const word = req.query.word as string;
    
    // Server-side validation
    if (!word || word.length > 50 || !/^[a-zA-Z\s-]+$/.test(word)) {
      return res.status(400).json({ error: "無效的單字格式" });
    }

    try {
      const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
      const response = await fetch(dictUrl);
      if (!response.ok) {
        return res.status(response.status).json({ error: "找不到單字資訊" });
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Dictionary Proxy Error:", error);
      res.status(500).json({ error: "伺服器內部錯誤" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
