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

app.get("/", (req, res) => {
  res.json({
    status: "Aquario API online"
  });
});

app.get("/api/status", (req, res) => {
  res.json(aquarioStatus);
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

  res.json({
    message: "Temperatura atualizada com sucesso",
    status: aquarioStatus
  });
});

module.exports = app;