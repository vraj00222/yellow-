const logEl = document.getElementById('log');
const productsEl = document.getElementById('products');

function log(msg, cls) {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  const t = new Date().toLocaleTimeString();
  line.textContent = `[${t}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}
window.__capsuleLog = log;

async function refreshProducts() {
  try {
    const res = await fetch('/api/state');
    const tables = await res.json();
    const products = tables.products || [];
    const ids = products.map((p) => p.id);
    const all = ['p1', 'p2', 'p3'];
    productsEl.innerHTML = all
      .map((id) => {
        const p = products.find((x) => x.id === id);
        if (!p) return `<div class="product gone"><span>Studio Tee (deleted)</span><span class="price">—</span></div>`;
        return `<div class="product"><span>${p.name} · stock ${p.stock}</span><span class="price">$${p.price}</span></div>`;
      })
      .join('');
    void ids;
  } catch {
    productsEl.textContent = 'backend unreachable';
  }
}

async function run(scenario) {
  log(`→ POST /api/run/${scenario}`, 'dim');
  try {
    const res = await fetch(`/api/run/${scenario}`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      log(`✓ ${scenario} OK — ${JSON.stringify(data.result)}`, 'ok');
    } else {
      log(`✗ ${scenario} crashed: ${data.error}`, 'err');
      if (data.capsuleId) log(`  ❄ frozen capsule ${data.capsuleId} → check dashboard + Telegram`, 'cap');
    }
  } catch (e) {
    log(`✗ request failed: ${e.message}`, 'err');
  }
  refreshProducts();
}

document.querySelectorAll('[data-run]').forEach((b) =>
  b.addEventListener('click', () => run(b.getAttribute('data-run'))),
);

document.querySelector('[data-deploy]').addEventListener('click', async () => {
  const res = await fetch('/api/deploy-bad', { method: 'POST' });
  const data = await res.json();
  log(`💥 ${data.message}`, 'err');
  refreshProducts();
});

document.querySelector('[data-reseed]').addEventListener('click', async () => {
  const res = await fetch('/api/reseed', { method: 'POST' });
  const data = await res.json();
  log(`↺ ${data.message}`, 'ok');
  refreshProducts();
});

document.querySelector('[data-uicrash]').addEventListener('click', () => {
  log('→ triggering a frontend crash…', 'dim');
  // Real uncaught error — capsule-client.js ships it to /ingest.
  const widget = null;
  widget.render(); // TypeError: Cannot read properties of null (reading 'render')
});

// Heal indicator: poll product state so "Studio Tee" reappears when restored.
setInterval(refreshProducts, 2500);
refreshProducts();
log('Yellow Store ready. Ship a bad deploy, then checkout. 🟡', 'dim');
