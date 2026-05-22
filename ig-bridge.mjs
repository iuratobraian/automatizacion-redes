import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 5680;

app.use(express.json());

app.post('/send-dm', async (req, res) => {
  const { username, message } = req.body;

  if (!username || !message) {
    return res.status(400).json({ error: 'Username y message son requeridos' });
  }

  console.log(`🚀 Bridge: Recibida petición para @${username}`);

  try {
    // Escapar comillas dobles para el comando
    const safeMessage = message.replace(/"/g, '\\"');
    const { stdout, stderr } = await execAsync(`node scripts/ig-dm.mjs --username=${username} --message="${safeMessage}"`);
    
    console.log('STDOUT:', stdout);
    if (stderr) console.error('STDERR:', stderr);

    if (stdout.includes('✅ MENSAJE ENVIADO')) {
      res.json({ success: true, output: stdout });
    } else {
      res.status(500).json({ success: false, output: stdout, error: stderr });
    }
  } catch (error) {
    console.error('❌ Bridge Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Instagram Bridge activo en http://127.0.0.1:${PORT}`);
});
