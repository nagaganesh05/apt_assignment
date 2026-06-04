const db = require("./db");
const { getIO } = require("./socket");

async function processEvents() {
  try {
    // SKIP LOCKED ensures multiple workers don't process the same event
    const events = await db("order_events")
      .where({ processed: false })
      .orderBy("id", "asc")
      .limit(50)
      .forUpdate()
      .skipLocked();

    if (events.length > 0) {
      const io = getIO();
      for (const event of events) {
        const payload =
          typeof event.payload === "string"
            ? JSON.parse(event.payload)
            : event.payload;

        io.emit("order_update", {
          eventType: event.event_type,
          order: payload,
        });

        await db("order_events")
          .where({ id: event.id })
          .update({ processed: true });
      }
    } else {
      // Wait before polling again to prevent high CPU usage
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (err) {
    console.error("Worker Error:", err);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } finally {
    // Continuously loop using setImmediate to yield to the event loop
    setImmediate(processEvents);
  }
}

function startWorker() {
  console.log("Starting Outbox Background Worker...");
  processEvents();
}

module.exports = { startWorker };
