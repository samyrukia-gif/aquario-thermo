const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

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

app.get("/", (req, res) => {
  res.json({
    status: "Aquario API online"
  });
});

app.get("/api/status", (req, res) => {
  res.json(aquarioStatus);
});

app.get("/api/history", (req, res) => {
  res.json(historicoTemperaturas);
});

app.post("/api/temperature", (req, res) => {
  const { temperature, heaterOn } = req.body;

  if (temperature === undefined) {
    return res.status(400).json({
      error: "O campo temperature é obrigatório"
    });
  }

  aquarioStatus.temperature = temperature;

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

  res.json({
    message: "Temperatura atualizada com sucesso",
    status: aquarioStatus,
    history: historicoTemperaturas
  });
});
app.get("/api/telegram/test", async (req, res) => {
  const enviado = await enviarTelegram("✅ Teste do bot do aquário funcionando!");

  if (enviado) {
    return res.json({ ok: true, message: "Mensagem enviada para o Telegram" });
  }

  return res.status(500).json({
    ok: false,
    message: "Não foi possível enviar a mensagem. Verifique token, chat_id e se você falou com o bot."
  });
});
module.exports = app;