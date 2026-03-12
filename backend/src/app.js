const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ALERTA_BAIXO = 22;
const ALERTA_ALTO = 28;
const TEMPERATURA_ALVO = 27;

// configuração da previsão
const JANELA_PREVISAO = 5; // quantidade de leituras analisadas
const QUEDA_RAPIDA = -1.2; // queda total nas últimas leituras
const SUBIDA_RAPIDA = 1.2; // subida total nas últimas leituras

let aquarioStatus = {
  temperature: 26.4,
  heaterOn: false,
  targetTemperature: TEMPERATURA_ALVO
};

let historicoTemperaturas = [
  {
    temperature: 26.4,
    heaterOn: false,
    time: new Date().toLocaleTimeString("pt-BR")
  }
];

let estadoAlerta = {
  frio: false,
  calor: false,
  previsaoFrio: false,
  previsaoCalor: false
};

async function enviarTelegram(mensagem) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram não configurado.");
    return false;
  }

  try {
    const resposta = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: mensagem
        })
      }
    );

    const dados = await resposta.json();
    console.log("Resposta Telegram:", dados);
    return dados.ok === true;
  } catch (erro) {
    console.error("Erro ao enviar Telegram:", erro.message);
    return false;
  }
}

function analisarTendencia() {
  if (historicoTemperaturas.length < JANELA_PREVISAO) {
    return {
      preverFrio: false,
      preverCalor: false,
      variacao: 0
    };
  }

  const ultimas = historicoTemperaturas.slice(-JANELA_PREVISAO);
  const primeira = Number(ultimas[0].temperature);
  const ultima = Number(ultimas[ultimas.length - 1].temperature);
  const variacao = ultima - primeira;

  const preverFrio = variacao <= QUEDA_RAPIDA && ultima > ALERTA_BAIXO;
  const preverCalor = variacao >= SUBIDA_RAPIDA && ultima < ALERTA_ALTO;

  return {
    preverFrio,
    preverCalor,
    variacao
  };
}

async function verificarAlertas() {
  const temperatura = Number(aquarioStatus.temperature);

  // alertas reais
  if (temperatura > ALERTA_ALTO && !estadoAlerta.calor) {
    await enviarTelegram(
      `🚨 ALERTA AQUÁRIO\nTemperatura: ${temperatura.toFixed(1)}°C\nRisco para os peixes: água muito quente.`
    );
    estadoAlerta.calor = true;
    estadoAlerta.frio = false;
    return;
  }

  if (temperatura < ALERTA_BAIXO && !estadoAlerta.frio) {
    await enviarTelegram(
      `🥶 ALERTA AQUÁRIO\nTemperatura: ${temperatura.toFixed(1)}°C\nRisco para os peixes: água muito fria.`
    );
    estadoAlerta.frio = true;
    estadoAlerta.calor = false;
    return;
  }

  // voltou ao normal
  if (
    temperatura >= ALERTA_BAIXO &&
    temperatura <= ALERTA_ALTO &&
    (estadoAlerta.frio || estadoAlerta.calor)
  ) {
    await enviarTelegram(
      `✅ AQUÁRIO ESTABILIZADO\nTemperatura: ${temperatura.toFixed(1)}°C\nA água voltou para a faixa segura.`
    );
    estadoAlerta.frio = false;
    estadoAlerta.calor = false;
  }

  // análise de tendência
  const tendencia = analisarTendencia();

  if (tendencia.preverFrio && !estadoAlerta.previsaoFrio) {
    await enviarTelegram(
      `⚠️ PREVISÃO DE FRIO\nTemperatura atual: ${temperatura.toFixed(1)}°C\nA temperatura está caindo rapidamente.\nVerifique o aquecedor antes que a água fique crítica.`
    );
    estadoAlerta.previsaoFrio = true;
  }

  if (!tendencia.preverFrio) {
    estadoAlerta.previsaoFrio = false;
  }

  if (tendencia.preverCalor && !estadoAlerta.previsaoCalor) {
    await enviarTelegram(
      `⚠️ PREVISÃO DE SUPERAQUECIMENTO\nTemperatura atual: ${temperatura.toFixed(1)}°C\nA temperatura está subindo rapidamente.\nVerifique o ambiente, iluminação ou aquecimento.`
    );
    estadoAlerta.previsaoCalor = true;
  }

  if (!tendencia.preverCalor) {
    estadoAlerta.previsaoCalor = false;
  }
}

app.get("/", (req, res) => {
  res.json({ status: "Aquario API online" });
});

app.get("/api/status", (req, res) => {
  const tendencia = analisarTendencia();

  res.json({
    ...aquarioStatus,
    prediction: {
      preverFrio: tendencia.preverFrio,
      preverCalor: tendencia.preverCalor,
      variacao: tendencia.variacao
    }
  });
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
    message: "Não foi possível enviar a mensagem."
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

  if (historicoTemperaturas.length > 30) {
    historicoTemperaturas.shift();
  }

  await verificarAlertas();

  res.json({
    message: "Temperatura atualizada com sucesso",
    status: aquarioStatus,
    prediction: analisarTendencia()
  });
});

module.exports = app;