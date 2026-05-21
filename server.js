const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const MENUS_FILE = path.join(DATA_DIR, "menus.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const DEFAULT_MENUS = [
  { name: "훌라훌라 치킨 플레이트", description: "하와이안 데리야끼 닭꼬치", price: 19000, category: "메인" },
  { name: "지중해 해물파전", description: "해물파전", price: 12000, category: "메인" },
  { name: "야이 치불면아!", description: "불닭볶음면 + 콘마요 + 셀프주먹밥", price: 12000, category: "메인" },
  { name: "박영일과 알로하 춤을", description: "포케 나쵸", price: 9000, category: "사이드" },
  { name: "오뎅탕 속 니모를 찾아서", description: "오뎅탕", price: 8000, category: "사이드" },
  { name: "이거 누가 시켰냐", description: "파인애플 샤베트", price: 8000, category: "사이드" },
  { name: "콜라", description: "", price: 2000, category: "음료" },
  { name: "사이다", description: "", price: 2000, category: "음료" },
  { name: "코코팜", description: "", price: 2000, category: "음료" }
];

const DEFAULT_SETTINGS = {
  bankName: "토스뱅크",
  accountNumber: "1001-1413-6526",
  accountHolder: "대표자명"
};

function ensureLocalFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MENUS_FILE)) fs.writeFileSync(MENUS_FILE, JSON.stringify(DEFAULT_MENUS, null, 2));
  if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");
}

function readJson(file) {
  ensureLocalFiles();
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeJson(file, data) {
  ensureLocalFiles();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function orderNo(n) {
  return String(n).padStart(3, "0");
}

function tableCode(n) {
  return String(n).padStart(2, "0");
}

const hasDatabase = Boolean(process.env.DATABASE_URL);
let pool = null;

if (hasDatabase) {
  const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocalDb ? false : { rejectUnauthorized: false }
  });
}

function toOrder(row) {
  return {
    id: row.id,
    orderCode: row.order_code,
    tableNo: row.table_no,
    sessionId: row.session_id,
    depositName: row.deposit_name,
    items: row.items,
    total: Number(row.total),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function initDatabase() {
  if (!hasDatabase) {
    ensureLocalFiles();
    console.log("저장 방식: 로컬 JSON 파일");
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS menus (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price INTEGER NOT NULL,
      category TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_holder TEXT NOT NULL,
      CHECK (id = 1)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_code TEXT,
      table_no INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      deposit_name TEXT,
      items JSONB NOT NULL,
      total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT '입금확인 필요',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
  `);

  const menuCount = await pool.query("SELECT COUNT(*)::int AS count FROM menus");
  if (menuCount.rows[0].count === 0) {
    for (let i = 0; i < DEFAULT_MENUS.length; i++) {
      const m = DEFAULT_MENUS[i];
      await pool.query(
        "INSERT INTO menus (name, description, price, category, sort_order) VALUES ($1, $2, $3, $4, $5)",
        [m.name, m.description, m.price, m.category, i]
      );
    }
  }

  const settingCount = await pool.query("SELECT COUNT(*)::int AS count FROM app_settings");
  if (settingCount.rows[0].count === 0) {
    await pool.query(
      "INSERT INTO app_settings (id, bank_name, account_number, account_holder) VALUES (1, $1, $2, $3)",
      [DEFAULT_SETTINGS.bankName, DEFAULT_SETTINGS.accountNumber, DEFAULT_SETTINGS.accountHolder]
    );
  }

  console.log("저장 방식: PostgreSQL DATABASE_URL");
}

async function getMenus() {
  if (!hasDatabase) return readJson(MENUS_FILE);
  const result = await pool.query("SELECT name, description, price, category FROM menus ORDER BY sort_order ASC, id ASC");
  return result.rows.map(r => ({ name: r.name, description: r.description || "", price: Number(r.price), category: r.category || "" }));
}

async function saveMenus(menus) {
  if (!hasDatabase) {
    writeJson(MENUS_FILE, menus);
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM menus");
    for (let i = 0; i < menus.length; i++) {
      const m = menus[i];
      await client.query(
        "INSERT INTO menus (name, description, price, category, sort_order) VALUES ($1, $2, $3, $4, $5)",
        [m.name, m.description || "", Number(m.price), m.category || "", i]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getSettings() {
  if (!hasDatabase) return readJson(SETTINGS_FILE);
  const result = await pool.query("SELECT bank_name, account_number, account_holder FROM app_settings WHERE id = 1");
  const row = result.rows[0];
  return { bankName: row.bank_name, accountNumber: row.account_number, accountHolder: row.account_holder };
}

async function saveSettings(next) {
  if (!hasDatabase) {
    const current = readJson(SETTINGS_FILE);
    writeJson(SETTINGS_FILE, { ...current, ...next });
    return { ...current, ...next };
  }

  const current = await getSettings();
  const merged = { ...current, ...next };
  await pool.query(
    `INSERT INTO app_settings (id, bank_name, account_number, account_holder)
     VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       bank_name = EXCLUDED.bank_name,
       account_number = EXCLUDED.account_number,
       account_holder = EXCLUDED.account_holder`,
    [merged.bankName, merged.accountNumber, merged.accountHolder]
  );
  return merged;
}

async function getAllOrders() {
  if (!hasDatabase) return readJson(ORDERS_FILE).sort((a, b) => b.id - a.id);
  const result = await pool.query("SELECT * FROM orders ORDER BY id DESC");
  return result.rows.map(toOrder);
}

async function getSessionOrders(sessionId) {
  if (!hasDatabase) {
    const orders = readJson(ORDERS_FILE)
      .filter(o => o.sessionId === sessionId && o.status !== "취소")
      .sort((a, b) => a.id - b.id);
    const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    return { orders, total };
  }
  const result = await pool.query(
    "SELECT * FROM orders WHERE session_id = $1 AND status <> '취소' ORDER BY id ASC",
    [sessionId]
  );
  const orders = result.rows.map(toOrder);
  const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  return { orders, total };
}

async function createOrder({ tableNo, sessionId, items, total }) {
  if (!hasDatabase) {
    const orders = readJson(ORDERS_FILE);
    const id = orders.length > 0 ? Math.max(...orders.map(o => o.id)) + 1 : 1;
    const orderCode = orderNo(id);
    const depositName = `T${tableCode(tableNo)}-${orderCode}`;
    const order = {
      id,
      orderCode,
      tableNo,
      sessionId,
      depositName,
      items,
      total,
      status: "입금확인 필요",
      createdAt: new Date().toISOString()
    };
    orders.push(order);
    writeJson(ORDERS_FILE, orders);
    return order;
  }

  const insert = await pool.query(
    "INSERT INTO orders (table_no, session_id, items, total, status) VALUES ($1, $2, $3::jsonb, $4, '입금확인 필요') RETURNING *",
    [tableNo, sessionId, JSON.stringify(items), Number(total)]
  );
  const id = insert.rows[0].id;
  const orderCode = orderNo(id);
  const depositName = `T${tableCode(tableNo)}-${orderCode}`;
  const updated = await pool.query(
    "UPDATE orders SET order_code = $1, deposit_name = $2 WHERE id = $3 RETURNING *",
    [orderCode, depositName, id]
  );
  return toOrder(updated.rows[0]);
}

async function updateOrderStatus(id, status) {
  if (!hasDatabase) {
    const orders = readJson(ORDERS_FILE);
    const order = orders.find(o => o.id === id);
    if (!order) return null;
    order.status = status;
    order.updatedAt = new Date().toISOString();
    writeJson(ORDERS_FILE, orders);
    return order;
  }
  const result = await pool.query(
    "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    [status, id]
  );
  return result.rows[0] ? toOrder(result.rows[0]) : null;
}

async function resetOrders() {
  if (!hasDatabase) {
    writeJson(ORDERS_FILE, []);
    return;
  }

  await pool.query("TRUNCATE TABLE orders RESTART IDENTITY");
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.get("/table/:tableNo", (req, res) => {
  const tableNo = Number(req.params.tableNo);
  if (!Number.isInteger(tableNo) || tableNo < 1 || tableNo > 70) {
    return res.status(404).send("잘못된 테이블 번호입니다. 1~70번만 가능합니다.");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/api/menus", asyncRoute(async (req, res) => {
  res.json(await getMenus());
}));

app.post("/api/menus", asyncRoute(async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: "메뉴 데이터는 배열이어야 합니다." });
  await saveMenus(req.body);
  res.json({ ok: true });
}));

app.get("/api/settings", asyncRoute(async (req, res) => {
  res.json(await getSettings());
}));

app.post("/api/settings", asyncRoute(async (req, res) => {
  const settings = await saveSettings(req.body);
  res.json({ ok: true, settings });
}));

app.get("/api/orders", asyncRoute(async (req, res) => {
  res.json(await getAllOrders());
}));

app.get("/api/session/:sessionId/orders", asyncRoute(async (req, res) => {
  const sessionId = String(req.params.sessionId || "");
  if (sessionId.length < 5) return res.status(400).json({ error: "세션 정보가 잘못되었습니다." });
  const { orders, total } = await getSessionOrders(sessionId);
  res.json({ ok: true, orders, total });
}));

app.post("/api/orders", asyncRoute(async (req, res) => {
  const { tableNo, sessionId, items, total } = req.body;
  if (!Number.isInteger(tableNo) || tableNo < 1 || tableNo > 70) {
    return res.status(400).json({ error: "테이블 번호가 잘못되었습니다." });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "장바구니가 비어 있습니다." });
  }
  if (!sessionId || String(sessionId).length < 5) {
    return res.status(400).json({ error: "손님 주문 세션이 없습니다. 새로고침 후 다시 주문해주세요." });
  }
  const order = await createOrder({ tableNo, sessionId, items, total });
  res.json({ ok: true, order });
}));

app.patch("/api/orders/:id/status", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  const allowed = ["입금확인 필요", "입금확인", "제작중", "내보냄/완료", "취소"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "허용되지 않은 상태입니다." });

  const order = await updateOrderStatus(id, status);
  if (!order) return res.status(404).json({ error: "주문을 찾을 수 없습니다." });
  res.json({ ok: true, order });
}));

app.delete("/api/orders/reset", asyncRoute(async (req, res) => {
  await resetOrders();
  res.json({ ok: true });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "서버 오류가 발생했습니다.", detail: err.message });
});

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`주점 키오스크 실행 중: http://localhost:${PORT}`);
    console.log(`관리자 화면: http://localhost:${PORT}/admin`);
    console.log(`테이블 예시: http://localhost:${PORT}/table/1`);
  });
}).catch(err => {
  console.error("DB 초기화 실패:", err);
  process.exit(1);
});
