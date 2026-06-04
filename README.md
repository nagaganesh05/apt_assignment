# Real-Time Orders System

A real-time notification system that automatically pushes database changes to connected clients using the **Outbox Pattern** with MySQL triggers and Socket.io.

## Architecture Overview

This system implements the **Transactional Outbox Pattern**, a robust approach for reliable event propagation from database to clients without polling from the client side.

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Client    │────▶│   Express API   │────▶│     MySQL DB    │     │   Clients   │
│  (Browser)  │     │   + Socket.io   │     │  + Triggers     │────▶│ (WebSocket) │
└─────────────┘     └──────────────────┘     └─────────────────┘     └─────────────┘
                            │                       │                        ▲
                            │                       ▼                        │
                            │              ┌──────────────────┐              │
                            │              │  order_events    │              │
                            │              │  (Outbox Table)  │              │
                            │              └──────────────────┘              │
                            │                       │                        │
                            │                       ▼                        │
                            └─────────────┬──────────────────────────────────┘
                                          │
                                   ┌──────────────────┐
                                   │  Background      │
                                   │  Worker          │
                                   │  (Polls outbox)  │
                                   └──────────────────┘
```

## Why This Approach?

### Design Decisions

1. **Outbox Pattern over Direct Triggers with External Calls**
   - Database triggers write to an `order_events` table instead of calling external services directly
   - Ensures atomicity: the event is stored within the same transaction as the data change
   - Prevents blocking the main transaction on external service availability

2. **Background Worker over Direct Trigger-to-Socket**
   - MySQL triggers cannot directly emit Socket.io events (different processes)
   - A background worker polls the outbox table efficiently using `SKIP LOCKED`
   - Enables horizontal scaling: multiple worker instances can process events concurrently

3. **Socket.io over Server-Sent Events (SSE)**
   - Full-duplex communication (bi-directional)
   - Automatic reconnection handling
   - Room/channel support for future scalability
   - Better browser compatibility

4. **Efficient Polling Strategy**
   - Worker uses `FOR UPDATE SKIP LOCKED` to prevent duplicate processing
   - Processes events in batches (50 at a time)
   - Uses `setImmediate` to yield to the event loop, preventing CPU starvation
   - Exponential backoff when no events are pending

### Scalability Considerations

- **Horizontal Scaling**: Multiple worker instances can safely process events due to `SKIP LOCKED`
- **Database Load**: Indexes on `(processed, id)` ensure efficient event queries
- **Memory Efficient**: Events are deleted/marked processed after emission
- **Connection Handling**: Socket.io handles connection pooling and reconnection

## Project Structure

```
/workspace
├── src/
│   ├── index.js        # Application entry point
│   ├── app.js          # Express app configuration
│   ├── db.js           # Knex database connection
│   ├── socket.js       # Socket.io initialization
│   ├── worker.js       # Background outbox processor
│   └── routes/
│       └── orders.js   # Order CRUD API endpoints
├── migrations/
│   └── events.js       # Database schema + triggers
├── client/
│   └── index.html      # Real-time dashboard
├── knexfile.js         # Knex configuration
├── package.json        # Dependencies
└── .env                # Environment variables
```

## Prerequisites

- Node.js 16+ 
- MySQL 8.0+ (required for JSON functions in triggers)
- npm or yarn

## Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Edit `.env` with your MySQL credentials:

```env
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=realtime_orders
DB_PORT=3306
PORT=3000
```

### 3. Create Database

```sql
CREATE DATABASE realtime_orders;
```

### 4. Run Migrations

This creates the `orders` table, `order_events` outbox table, and database triggers:

```bash
npm run migrate
```

### 5. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

## Usage

### Web Dashboard

Open `http://localhost:3000` in your browser. The dashboard provides:

- **Live Event Feed**: Shows all INSERT, UPDATE, DELETE events in real-time
- **Test Buttons**: Create, update, and delete random orders to test the system

Open the dashboard in **multiple browser tabs or windows** to see real-time synchronization.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List all orders |
| POST | `/api/orders` | Create new order |
| PUT | `/api/orders/:id` | Update an order |
| DELETE | `/api/orders/:id` | Delete an order |

### Example: Create Order via cURL

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customer_name":"John Doe","product_name":"Laptop","status":"pending"}'
```

All connected clients will immediately receive the update via WebSocket.

## How It Works

### 1. Database Triggers

When any INSERT, UPDATE, or DELETE occurs on the `orders` table, MySQL triggers automatically:

```sql
-- Example: After INSERT trigger
CREATE TRIGGER orders_after_insert
AFTER INSERT ON orders
FOR EACH ROW
BEGIN
  INSERT INTO order_events (event_type, order_id, payload)
  VALUES ('INSERT', NEW.id, JSON_OBJECT(...));
END
```

The trigger captures the full row state as JSON and stores it in `order_events`.

### 2. Background Worker

The worker continuously polls for unprocessed events:

```javascript
const events = await db("order_events")
  .where({ processed: false })
  .orderBy("id", "asc")
  .limit(50)
  .forUpdate()
  .skipLocked();
```

Key features:
- `FOR UPDATE`: Locks selected rows
- `SKIP LOCKED`: Skips rows locked by other workers
- Batch processing: Handles up to 50 events per iteration

### 3. Socket.io Broadcasting

For each processed event, the worker emits:

```javascript
io.emit("order_update", {
  eventType: event.event_type,
  order: payload
});
```

All connected clients receive the update instantly.

## Testing Real-Time Updates

1. Start the server: `npm run dev`
2. Open `http://localhost:3000` in **two different browser windows**
3. In one window, click "Create Random Order"
4. Observe both windows receive the update simultaneously
5. Try "Update" and "Delete" buttons to see all event types

## Alternative Approaches Considered

| Approach | Pros | Cons | Why Not Chosen |
|----------|------|------|----------------|
| **Client Polling** | Simple to implement | High latency, wasteful requests, poor scalability | Violates requirement of no frequent polling |
| **Change Data Capture (CDC)** | Non-invasive, works with existing DB | Requires additional infrastructure (Debezium, Kafka) | Overkill for this use case |
| **PostgreSQL LISTEN/NOTIFY** | Native push mechanism | Requires PostgreSQL, not MySQL | Team standardizing on MySQL |
| **Direct Trigger → HTTP Call** | Low latency | Blocks transaction, unreliable if service down | Risky: DB transaction depends on app availability |

## Future Enhancements

1. **Event Archival**: Move processed events to a history table instead of keeping them indefinitely
2. **Acknowledgment System**: Track which clients have received which events
3. **Room-based Subscriptions**: Allow clients to subscribe to specific order updates
4. **Rate Limiting**: Prevent abuse of the API endpoints
5. **Metrics & Monitoring**: Add Prometheus metrics for event processing latency

## License

MIT
