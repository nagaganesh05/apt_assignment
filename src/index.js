const http = require("http");
const app = require("./app");
const { initializeSocket } = require("./socket");
const { startWorker } = require("./worker");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

initializeSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `Open http://localhost:${PORT} in your browser to see the real-time dashboard.`,
  );
  startWorker();
});
