import { Client } from 'pg';

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  console.error('DIRECT_URL is not set');
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

const rand = (min, max) => Math.random() * (max - min) + min;
const randint = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randint(0, arr.length - 1)];
const money = (n) => Number(n.toFixed(2));

const categories = [
  'Apparel',
  'Electronics',
  'Home & Kitchen',
  'Beauty',
  'Sports',
  'Books',
];

const productCatalog = [
  ['Apparel', [['T-Shirt', 12, 30], ['Jeans', 35, 90], ['Hoodie', 30, 70], ['Jacket', 50, 140], ['Sneakers', 40, 120], ['Summer Dress', 25, 80], ['Wool Socks', 6, 15]]],
  ['Electronics', [['Wireless Earbuds', 20, 150], ['Bluetooth Speaker', 25, 120], ['Smart Watch', 60, 300], ['Phone Charger', 8, 30], ['USB-C Cable', 5, 20], ['Laptop Stand', 20, 60], ['Webcam', 25, 90]]],
  ['Home & Kitchen', [['Ceramic Mug', 8, 20], ['Chef Knife', 25, 90], ['Cookware Set', 60, 200], ['Water Bottle', 12, 35], ['Scented Candle', 10, 28], ['Bath Towel Set', 20, 55]]],
  ['Beauty', [['Face Serum', 18, 60], ['Moisturizer', 15, 45], ['Lipstick', 10, 30], ['Shampoo', 8, 25], ['Perfume', 30, 120], ['Sunscreen', 12, 35]]],
  ['Sports', [['Yoga Mat', 18, 50], ['Dumbbell Set', 30, 110], ['Running Shorts', 15, 40], ['Football', 15, 45], ['Resistance Bands', 10, 30], ['Sports Bottle', 10, 28]]],
  ['Books', [['Novel', 8, 20], ['Cookbook', 15, 35], ['Self-Help Book', 10, 25], ['Sci-Fi Anthology', 12, 28], ['Childrens Book', 6, 18], ['Biography', 12, 30]]],
];

const countries = ['IN', 'US', 'GB', 'CA', 'AU', 'DE', 'SG', 'AE', 'FR', 'JP'];
const firstNames = ['Aarav', 'Maya', 'Liam', 'Sofia', 'Noah', 'Aisha', 'Ethan', 'Priya', 'Lucas', 'Mia', 'Arjun', 'Emma', 'Kabir', 'Olivia', 'Daniel', 'Sara', 'Ishaan', 'Chloe', 'Rohan', 'Ava'];
const lastNames = ['Sharma', 'Smith', 'Patel', 'Johnson', 'Khan', 'Brown', 'Mehta', 'Garcia', 'Singh', 'Lee', 'Gupta', 'Muller', 'Tan', 'Rossi', 'Nair', 'Wong', 'Reddy', 'Dubois', 'Iyer', 'Chen'];
const monthFactor = [0.8, 0.85, 0.95, 1.0, 1.0, 0.95, 0.9, 0.95, 1.05, 1.15, 1.6, 1.95];

function weightedStatus() {
  const r = Math.random();
  if (r < 0.82) return 'completed';
  if (r < 0.9) return 'pending';
  if (r < 0.96) return 'cancelled';
  return 'refunded';
}

async function insertRows(table, columns, rows, batchSize = 500) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const params = [];
    const tuples = batch.map((row, r) => {
      const placeholders = columns.map((_, c) => `$${r * columns.length + c + 1}`);
      params.push(...row);
      return `(${placeholders.join(',')})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')}`,
      params,
    );
  }
}

async function main() {
  await client.connect();
  console.log('connected to sift');

  await client.query('CREATE SCHEMA IF NOT EXISTS demo');
  await client.query(`
    DROP TABLE IF EXISTS demo.order_items, demo.orders, demo.products, demo.customers, demo.categories CASCADE;
    CREATE TABLE demo.categories (id integer PRIMARY KEY, name text NOT NULL);
    CREATE TABLE demo.products (id integer PRIMARY KEY, name text NOT NULL, category_id integer NOT NULL REFERENCES demo.categories(id), price numeric(10,2) NOT NULL);
    CREATE TABLE demo.customers (id integer PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, country text NOT NULL, created_at timestamptz NOT NULL);
    CREATE TABLE demo.orders (id integer PRIMARY KEY, customer_id integer NOT NULL REFERENCES demo.customers(id), status text NOT NULL, total numeric(12,2) NOT NULL, created_at timestamptz NOT NULL);
    CREATE TABLE demo.order_items (id integer PRIMARY KEY, order_id integer NOT NULL REFERENCES demo.orders(id), product_id integer NOT NULL REFERENCES demo.products(id), quantity integer NOT NULL, unit_price numeric(10,2) NOT NULL, line_total numeric(12,2) NOT NULL);
    CREATE INDEX ON demo.products (category_id);
    CREATE INDEX ON demo.orders (customer_id);
    CREATE INDEX ON demo.orders (created_at);
    CREATE INDEX ON demo.order_items (order_id);
    CREATE INDEX ON demo.order_items (product_id);
  `);
  console.log('demo schema + tables created');

  const categoryRows = categories.map((name, i) => [i + 1, name]);
  await insertRows('demo.categories', ['id', 'name'], categoryRows);

  const products = [];
  const productRows = [];
  let pid = 1;
  for (const [catName, items] of productCatalog) {
    const catId = categories.indexOf(catName) + 1;
    for (const [name, lo, hi] of items) {
      const price = money(rand(lo, hi));
      products.push({ id: pid, price });
      productRows.push([pid, name, catId, price]);
      pid++;
    }
  }
  await insertRows('demo.products', ['id', 'name', 'category_id', 'price'], productRows);

  const customerCount = 300;
  const custStart = new Date('2024-09-01').getTime();
  const custEnd = new Date('2026-05-15').getTime();
  const customerRows = [];
  for (let i = 1; i <= customerCount; i++) {
    const fn = pick(firstNames);
    const ln = pick(lastNames);
    const created = new Date(custStart + Math.random() * (custEnd - custStart));
    const email = `${fn}.${ln}.${i}`.toLowerCase() + '@example.com';
    customerRows.push([i, `${fn} ${ln}`, email, pick(countries), created.toISOString()]);
  }
  await insertRows('demo.customers', ['id', 'name', 'email', 'country', 'created_at'], customerRows);

  const start = new Date('2025-01-01');
  const end = new Date('2026-06-20');
  const span = end.getTime() - start.getTime();
  const orderRows = [];
  const itemRows = [];
  let oid = 1;
  let itemId = 1;
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const day = new Date(t);
    const weekFactor = day.getDay() === 0 || day.getDay() === 6 ? 1.25 : 1.0;
    const trend = 1 + 0.5 * ((t - start.getTime()) / span);
    const count = Math.max(0, Math.round(6 * monthFactor[day.getMonth()] * weekFactor * trend * rand(0.7, 1.3)));
    for (let n = 0; n < count; n++) {
      const numItems = randint(1, 4);
      const chosen = new Set();
      const theseItems = [];
      let total = 0;
      for (let k = 0; k < numItems; k++) {
        const product = pick(products);
        if (chosen.has(product.id)) continue;
        chosen.add(product.id);
        const quantity = randint(1, 3);
        const line = money(quantity * product.price);
        total += line;
        theseItems.push([itemId++, oid, product.id, quantity, product.price, line]);
      }
      if (theseItems.length === 0) continue;
      const created = new Date(day);
      created.setHours(randint(8, 22), randint(0, 59), randint(0, 59), 0);
      orderRows.push([oid, randint(1, customerCount), weightedStatus(), money(total), created.toISOString()]);
      itemRows.push(...theseItems);
      oid++;
    }
  }
  await insertRows('demo.orders', ['id', 'customer_id', 'status', 'total', 'created_at'], orderRows);
  await insertRows('demo.order_items', ['id', 'order_id', 'product_id', 'quantity', 'unit_price', 'line_total'], itemRows);
  console.log(`inserted ${customerRows.length} customers, ${productRows.length} products, ${orderRows.length} orders, ${itemRows.length} order items`);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'copilot_ro') THEN
        CREATE ROLE copilot_ro NOLOGIN;
      END IF;
      EXECUTE format('GRANT copilot_ro TO %I', current_user);
    END
    $$;
    GRANT USAGE ON SCHEMA demo TO copilot_ro;
    GRANT SELECT ON ALL TABLES IN SCHEMA demo TO copilot_ro;
    ALTER DEFAULT PRIVILEGES IN SCHEMA demo GRANT SELECT ON TABLES TO copilot_ro;
  `);
  console.log('copilot_ro role + SELECT-only grants on demo ready');

  await client.query('SET ROLE copilot_ro');
  const sel = await client.query('SELECT count(*)::int AS c FROM demo.orders');
  console.log(`as copilot_ro: SELECT demo.orders -> ${sel.rows[0].c} rows (allowed)`);
  let writeBlocked = false;
  try {
    await client.query(`INSERT INTO demo.categories (id, name) VALUES (9999, 'hack')`);
  } catch (e) {
    writeBlocked = true;
    console.log(`as copilot_ro: INSERT demo.categories -> BLOCKED (${e.code})`);
  }
  if (!writeBlocked) console.log('WARNING: write was NOT blocked');
  let appBlocked = false;
  try {
    await client.query(`SELECT count(*) FROM public."User"`);
  } catch (e) {
    appBlocked = true;
    console.log(`as copilot_ro: SELECT public."User" -> BLOCKED (${e.code})`);
  }
  if (!appBlocked) console.log('NOTE: copilot_ro could read app tables');
  await client.query('RESET ROLE');

  const stats = await client.query(`
    SELECT
      (SELECT count(*) FROM demo.orders WHERE status = 'completed') AS completed_orders,
      to_char((SELECT min(created_at) FROM demo.orders), 'YYYY-MM-DD') AS first_order,
      to_char((SELECT max(created_at) FROM demo.orders), 'YYYY-MM-DD') AS last_order,
      (SELECT round(sum(total)) FROM demo.orders WHERE status = 'completed') AS completed_revenue
  `);
  console.log('summary:', stats.rows[0]);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
