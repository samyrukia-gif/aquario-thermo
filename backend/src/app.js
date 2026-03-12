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

// regras inteligentes
const JANELA_PREVISAO = 5;
const QUEDA_RAPIDA = -1.2;
const SUBIDA_RAPIDA = 1.2;
const TEMPO_MAX_SEM_LEITURA_MS = 5 * 60 * 1000;
const TEMPO_FORA_IDEAL_MS = 30 * 60 * 1000;
const TEMPO_AQUECEDOR_SEM_SUBIR_MS = 10 * 60 * 1000;
const OSCILACAO_EXCESSIVA = 1.5;

let aquarioStatus = {
  temperature: 26.4,
  heaterOn: false,
  rainDetected: false,
  targetTemperature: TEMPERATURA_ALVO
};

let historicoTemperaturas = [
  {
    temperature: 26.4,
    heaterOn: false,
    time: new Date().toLocaleTimeString("pt-BR"),
    timestamp: Date.now()
  }
];

let estadoAlerta = {
  frio: false,
  calor: false,
  previsaoFrio: false,
  previsaoCalor: false,
  sensorOffline: false,
  aquecedorFalha: false,
  oscilacao: false,
  foraIdeal: false,
  chuva: false
};

let ultimaLeituraTimestamp = Date.now();
let foraIdealDesde = null;
let aquecedorLigadoDesde = null;
let temperaturaQuandoLigou = null;

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

async function verificarChuva() {
  const chuva = !!aquarioStatus.rainDetected;

  if (chuva && !estadoAlerta.chuva) {
    await enviarTelegram(
      `🌧️ CHUVA DETECTADA\nO sensor FC-37 detectou chuva no aquário externo.\nMonitore temperatura, nível da água e pH.`
    );
    estadoAlerta.chuva = true;
  }

  if (!chuva && estadoAlerta.chuva) {
    await enviarTelegram(
      `☁️ CHUVA ENCERRADA\nO sensor não detecta mais chuva no aquário externo.`
    );
    estadoAlerta.chuva = false;
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

  return {
    preverFrio: variacao <= QUEDA_RAPIDA && ultima > ALERTA_BAIXO,
    preverCalor: variacao >= SUBIDA_RAPIDA && ultima < ALERTA_ALTO,
    variacao
  };
}

function detectarOscilacaoExcessiva() {
  if (historicoTemperaturas.length < JANELA_PREVISAO) {
    return false;
  }

  const ultimas = historicoTemperaturas.slice(-JANELA_PREVISAO);
  const temperaturas = ultimas.map(item => Number(item.temperature));
  const max = Math.max(...temperaturas);
  const min = Math.min(...temperaturas);

  return (max - min) >= OSCILACAO_EXCESSIVA;
}

async function verificarSensorOffline() {
  const agora = Date.now();
  const semLeitura = agora - ultimaLeituraTimestamp > TEMPO_MAX_SEM_LEITURA_MS;

  if (semLeitura && !estadoAlerta.sensorOffline) {
    await enviarTelegram(
      `🚨 SENSOR OFFLINE\nO sistema está sem receber leitura de temperatura há vários minutos.\nVerifique o sensor ou a conexão da ESP32.`
    );
    estadoAlerta.sensorOffline = true;
  }

  if (!semLeitura) {
    estadoAlerta.sensorOffline = false;
  }
}

async function verificarTemperaturaForaIdeal() {
  const temperatura = Number(aquarioStatus.temperature);
  const foraIdeal = temperatura < 26 || temperatura > 27.5;

  if (foraIdeal) {
    if (!foraIdealDesde) {
      foraIdealDesde = Date.now();
    }

    const tempoFora = Date.now() - foraIdealDesde;

    if (tempoFora >= TEMPO_FORA_IDEAL_MS && !estadoAlerta.foraIdeal) {
      await enviarTelegram(
        `⚠️ TEMPERATURA FORA DO IDEAL\nTemperatura atual: ${temperatura.toFixed(1)}°C\nO aquário está fora da faixa ideal há muito tempo.`
      );
      estadoAlerta.foraIdeal = true;
    }
  } else {
    foraIdealDesde = null;
    estadoAlerta.foraIdeal = false;
  }
}

async function verificarAquecedorSemAquecer() {
  const temperatura = Number(aquarioStatus.temperature);

  if (aquarioStatus.heaterOn) {
    if (!aquecedorLigadoDesde) {
      aquecedorLigadoDesde = Date.now();
      temperaturaQuandoLigou = temperatura;
    }

    const tempoLigado = Date.now() - aquecedorLigadoDesde;
    const subiu = temperatura > temperaturaQuandoLigou + 0.2;

    if (
      tempoLigado >= TEMPO_AQUECEDOR_SEM_SUBIR_MS &&
      !subiu &&
      !estadoAlerta.aquecedorFalha
    ) {
      await enviarTelegram(
        `🚨 POSSÍVEL FALHA NO AQUECEDOR\nTemperatura atual: ${temperatura.toFixed(1)}°C\nO aquecedor está ligado há bastante tempo, mas a temperatura não sobe.`
      );
      estadoAlerta.aquecedorFalha = true;
    }

    if (subiu) {
      estadoAlerta.aquecedorFalha = false;
    }
  } else {
    aquecedorLigadoDesde = null;
    temperaturaQuandoLigou = null;
    estadoAlerta.aquecedorFalha = false;
  }
}

async function verificarOscilacao() {
  const oscilando = detectarOscilacaoExcessiva();

  if (oscilando && !estadoAlerta.oscilacao) {
    await enviarTelegram(
      `⚠️ OSCILAÇÃO DE TEMPERATURA\nA temperatura está variando demais em pouco tempo.\nVerifique sensor, posição do aquecedor ou circulação da água.`
    );
    estadoAlerta.oscilacao = true;
  }

  if (!oscilando) {
    estadoAlerta.oscilacao = false;
  }
}

async function verificarAlertasPrincipais() {
  const temperatura = Number(aquarioStatus.temperature);

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
}

async function verificarPrevisao() {
  const temperatura = Number(aquarioStatus.temperature);
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

async function verificarTudo() {
  await verificarAlertasPrincipais();
  await verificarPrevisao();
  await verificarSensorOffline();
  await verificarTemperaturaForaIdeal();
  await verificarAquecedorSemAquecer();
  await verificarOscilacao();
  await verificarChuva();
}

setInterval(() => {
  verificarSensorOffline();
}, 60000);

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
    },
    alerts: estadoAlerta
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
  const { temperature, heaterOn, rain } = req.body;

  if (temperature === undefined) {
    return res.status(400).json({
      error: "O campo temperature é obrigatório"
    });
  }

  aquarioStatus.temperature = Number(temperature);

  if (heaterOn !== undefined) {
    aquarioStatus.heaterOn = heaterOn;
  }

  if (rain !== undefined) {
    aquarioStatus.rainDetected = !!rain;
  }

  ultimaLeituraTimestamp = Date.now();

  historicoTemperaturas.push({
    temperature: Number(temperature),
    heaterOn: heaterOn ?? aquarioStatus.heaterOn,
    time: new Date().toLocaleTimeString("pt-BR"),
    timestamp: Date.now()
  });

  if (historicoTemperaturas.length > 50) {
    historicoTemperaturas.shift();
  }

  await verificarTudo();

  res.json({
    message: "Temperatura atualizada com sucesso",
    status: aquarioStatus,
    prediction: analisarTendencia(),
    alerts: estadoAlerta
  });
});

module.exports = app;