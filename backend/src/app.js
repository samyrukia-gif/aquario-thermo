const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "Aquario API online"
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    temperature: 26.4,
    heaterOn: false,
    targetTemperature: 27
  });
});

module.exports = app;