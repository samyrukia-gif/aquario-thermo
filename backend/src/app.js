const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ALERTA_BAIXO = 22;
const ALERTA_ALTO = 28;

let aquarioStatus = {
  temperature: 26.4,
  heaterOn: false,
  targetTemperature: 27
};

let historicoTemperaturas = [
  {
    temperature: 26.4,
    heaterOn: false,
    time: new Date().toLocaleTimeString("pt-BR")
  }
];

let ultimoAlerta = {
  baixo: false,
  alto: false
};

async function enviarTelegram(mensagem) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram não configurado.");
    return false;
  }

  try {
    const resposta = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: mensagem
      })
    });

    const dados = await resposta.json();
    console.log("Resposta do Telegram:", dados);

    return dados.ok === true;
  } catch (erro) {
    console.error("Erro ao enviar mensagem:", erro.message);
    return false;
  }
}

async function verificarAlertas() {
  const temperatura = Number(aquarioStatus.temperature);

  if (temperatura < ALERTA_BAIXO && !ultimoAlerta.baixo) {
    await enviarTelegram(`🚨 Alerta crítico! Temperatura muito baixa: ${temperatura} °C`);
    ultimoAlerta.baixo = true;
  }

  if (temperatura >= ALERTA_BAIXO) {
    ultimoAlerta.baixo = false;
  }

  if (temperatura > ALERTA_ALTO && !ultimoAlerta.alto) {
    await enviarTelegram(`🔥 Alerta de superaquecimento! Temperatura muito alta: ${temperatura} °C`);
    ultimoAlerta.alto = true;
  }

  if (temperatura <= ALERTA_ALTO) {
    ultimoAlerta.alto = false;
  }
}

app.get("/", (req, res) => {
  res.json({ status: "Aquario API online" });
});

app.get("/api/status", (req, res) => {
  res.json(aquarioStatus);
});

app.get("/api/history", (req, res) => {
  res.json(historicoTemperaturas);
});

app.get("/api/telegram/test", async (req, res) => {
  const enviado = await enviarTelegram("✅ Teste do bot do aquário funcionando!");

  if (enviado) {
    return res.json({
      ok: true,
      message: "Mensagem enviada para o Telegram"
    });
  }

  return res.status(500).json({
    ok: false,
    message: "Não foi possível enviar a mensagem. Verifique token, chat_id e se você falou com o bot."
  });
});

app.post("/api/temperature", async (req, res) => {
  const { temperature, heaterOn } = req.body;

  if (temperature === undefined) {
    return res.status(400).json({
      error: "O campo temperature é obrigatório"
    });
  }

  aquarioStatus.temperature = Number(temperature);

  if (heaterOn !== undefined) {
    aquarioStatus.heaterOn = heaterOn;
  }

  historicoTemperaturas.push({
    temperature: Number(temperature),
    heaterOn: heaterOn ?? aquarioStatus.heaterOn,
    time: new Date().toLocaleTimeString("pt-BR")
  });

  if (historicoTemperaturas.length > 20) {
    historicoTemperaturas.shift();
  }

  await verificarAlertas();

  res.json({
    message: "Temperatura atualizada com sucesso",
    status: aquarioStatus
  });
});

module.exports = app;