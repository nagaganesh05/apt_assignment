exports.up = async function (knex) {
  // 1. Create Orders Table
  await knex.schema.createTable("orders", (table) => {
    table.increments("id").primary();
    table.string("customer_name").notNullable();
    table.string("product_name").notNullable();
    table
      .enum("status", ["pending", "shipped", "delivered"])
      .defaultTo("pending");
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  // Ensure updated_at automatically updates on any row modification
  await knex.raw(`
    ALTER TABLE orders 
    MODIFY updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  `);

  // 2. Create Outbox Events Table
  await knex.schema.createTable("order_events", (table) => {
    table.bigIncrements("id").primary();
    table.string("event_type", 20).notNullable();
    table.integer("order_id").notNullable();
    table.json("payload").notNullable();
    table.boolean("processed").defaultTo(false);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.index(["processed", "id"]); // Optimization for the worker
  });

  // 3. Create Triggers (MySQL 8.0+ JSON_OBJECT syntax)
  await knex.raw(`
    CREATE TRIGGER orders_after_insert
    AFTER INSERT ON orders
    FOR EACH ROW
    BEGIN
      INSERT INTO order_events (event_type, order_id, payload)
      VALUES ('INSERT', NEW.id, JSON_OBJECT('id', NEW.id, 'customer_name', NEW.customer_name, 'product_name', NEW.product_name, 'status', NEW.status, 'updated_at', NEW.updated_at));
    END
  `);

  await knex.raw(`
    CREATE TRIGGER orders_after_update
    AFTER UPDATE ON orders
    FOR EACH ROW
    BEGIN
      INSERT INTO order_events (event_type, order_id, payload)
      VALUES ('UPDATE', NEW.id, JSON_OBJECT('id', NEW.id, 'customer_name', NEW.customer_name, 'product_name', NEW.product_name, 'status', NEW.status, 'updated_at', NEW.updated_at));
    END
  `);

  await knex.raw(`
    CREATE TRIGGER orders_after_delete
    AFTER DELETE ON orders
    FOR EACH ROW
    BEGIN
      INSERT INTO order_events (event_type, order_id, payload)
      VALUES ('DELETE', OLD.id, JSON_OBJECT('id', OLD.id, 'customer_name', OLD.customer_name, 'product_name', OLD.product_name, 'status', OLD.status, 'updated_at', OLD.updated_at));
    END
  `);
};

exports.down = async function (knex) {
  await knex.raw("DROP TRIGGER IF EXISTS orders_after_insert");
  await knex.raw("DROP TRIGGER IF EXISTS orders_after_update");
  await knex.raw("DROP TRIGGER IF EXISTS orders_after_delete");
  await knex.schema.dropTableIfExists("order_events");
  await knex.schema.dropTableIfExists("orders");
};
