import express from "express";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.GEMINI_PROXY_PORT || 9090;

app.use(express.json());

app.post("/api/generate", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "El campo 'prompt' es requerido." });
  }

  // Sanitizar el prompt y escapar comillas dobles de forma segura para bash
  const escapedPrompt = prompt.replace(/"/g, '\\"');

  console.log(`[Gemini Proxy] Procesando prompt (${prompt.slice(0, 60)}...)`);

  try {
    // Ejecutar Gemini CLI localmente usando no-interactive prompt mode
    const { stdout, stderr } = await execAsync(`gemini -p "${escapedPrompt}"`, {
      timeout: 15000, // Timeout de 15 segundos
    });

    if (stderr && !stdout) {
      console.error(`[Gemini Proxy Error CLI] ${stderr}`);
      return res.status(500).json({ error: stderr });
    }

    const reply = stdout.trim();
    console.log(`[Gemini Proxy Success] Retornando ${reply.length} caracteres.`);
    res.json({ reply });

  } catch (err) {
    console.error(`[Gemini Proxy Error Exec] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", port: PORT });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 Gemini CLI HTTP Proxy escuchando en http://127.0.0.1:${PORT}`);
});
