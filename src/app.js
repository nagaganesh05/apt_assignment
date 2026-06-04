const express = require("express");
const cors = require("cors");
const path = require("path");
const ordersRouter = require("./routes/orders");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "client")));
app.use("/api/orders", ordersRouter);

module.exports = app;
