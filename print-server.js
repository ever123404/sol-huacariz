// ══════════════════════════════════════════════════════════
// SOL DE HUACARIZ — Servidor de Impresión Automática
// ══════════════════════════════════════════════════════════
// 
// INSTALACIÓN:
//   npm install firebase-admin node-thermal-printer axios
//
// CONFIGURACIÓN (variables de entorno en Railway/Render):
//   FIREBASE_PROJECT_ID=sol-huacariz
//   FIREBASE_PRIVATE_KEY=<tu private key>
//   FIREBASE_CLIENT_EMAIL=<tu client email>
//   PRINTER_COCINA_IP=192.168.1.101
//   PRINTER_BAR_IP=192.168.1.102
//   PRINTER_CAJA_IP=192.168.1.103
//   PRINTER_PORT=9100
//
// DESPLIEGUE GRATUITO:
//   1. Sube este archivo a GitHub (repo privado)
//   2. Conecta con Railway.app (gratis)
//   3. Agrega las variables de entorno
//   4. Las impresoras deben estar en la misma red WiFi

const admin = require('firebase-admin');
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const net = require('net');

// ── FIREBASE CONFIG ──
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
  databaseURL: 'https://sol-huacariz-default-rtdb.firebaseio.com'
});

const db = admin.database();

// ── PRINTER CONFIG ──
const PRINTERS = {
  cocina: { ip: process.env.PRINTER_COCINA_IP, port: parseInt(process.env.PRINTER_PORT) || 9100 },
  bar:    { ip: process.env.PRINTER_BAR_IP,    port: parseInt(process.env.PRINTER_PORT) || 9100 },
  caja:   { ip: process.env.PRINTER_CAJA_IP,   port: parseInt(process.env.PRINTER_PORT) || 9100 },
};

// Track processed comandas to avoid duplicates
const printed = new Set();

// ── PRINT FUNCTION ──
async function printRaw(ip, port, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error(`Timeout connecting to printer ${ip}:${port}`));
    }, 5000);

    client.connect(port, ip, () => {
      client.write(data, () => {
        clearTimeout(timeout);
        client.end();
        resolve();
      });
    });
    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ── BUILD TICKET ──
function buildEscPos(lines, cut = true) {
  const ESC = '\x1B';
  const GS  = '\x1D';
  const LF  = '\n';
  
  let data = '';
  data += ESC + '@';          // Initialize printer
  data += ESC + 'a' + '\x01'; // Center align
  
  lines.forEach(line => {
    if (line.type === 'title') {
      data += ESC + '!' + '\x38'; // Double height+width+bold
      data += line.text + LF;
      data += ESC + '!' + '\x00'; // Normal
    } else if (line.type === 'bold') {
      data += ESC + 'E' + '\x01'; // Bold on
      data += line.text + LF;
      data += ESC + 'E' + '\x00'; // Bold off
    } else if (line.type === 'section') {
      data += ESC + '!' + '\x08'; // Bold
      data += ESC + 'a' + '\x01'; // Center
      data += '--- ' + line.text + ' ---' + LF;
      data += ESC + '!' + '\x00';
      data += ESC + 'a' + '\x00'; // Left
    } else if (line.type === 'separator') {
      data += '-'.repeat(32) + LF;
    } else if (line.type === 'item') {
      data += ESC + 'a' + '\x00'; // Left
      data += ESC + 'E' + '\x01'; // Bold
      const qty = (line.qty + 'x ').padEnd(4);
      data += qty + line.name + LF;
      data += ESC + 'E' + '\x00';
      if (line.opts) data += '    ' + line.opts + LF;
      if (line.nota) data += '    Nota: ' + line.nota + LF;
    } else if (line.type === 'item_price') {
      data += ESC + 'a' + '\x00'; // Left
      data += ESC + 'E' + '\x01'; // Bold
      const qty = (line.qty + 'x ').padEnd(4);
      const price = ('S/ ' + parseFloat(line.price).toFixed(2)).padStart(10);
      const name = line.name.substring(0, 32 - 4 - 10);
      data += qty + name + price + LF;
      data += ESC + 'E' + '\x00';
      if (line.opts) data += '    ' + line.opts + LF;
      if (line.nota) data += '    Nota: ' + line.nota + LF;
    } else if (line.type === 'total') {
      data += ESC + 'a' + '\x00';
      data += '-'.repeat(32) + LF;
      data += ESC + '!' + '\x18'; // Bold + double height
      const label = 'TOTAL';
      const amount = ('S/ ' + parseFloat(line.amount).toFixed(2)).padStart(27 - label.length);
      data += label + amount + LF;
      data += ESC + '!' + '\x00';
    } else if (line.type === 'info') {
      data += ESC + 'a' + '\x00'; // Left
      data += line.text + LF;
    } else {
      data += ESC + 'a' + '\x00';
      data += (line.text || '') + LF;
    }
  });

  data += LF + LF + LF;
  if (cut) data += GS + 'V' + '\x41' + '\x00'; // Full cut
  
  return Buffer.from(data, 'binary');
}

// ── GENERATE TICKETS ──
function generateTicketCocina(comanda) {
  const lines = [];
  const cocItems = comanda.items.filter(i => i.tipo !== 'beb');
  if (!cocItems.length) return null;

  lines.push({ type: 'title', text: 'SOL DE HUACARIZ' });
  lines.push({ type: 'text', text: 'Grill & Bar - Cajamarca' });
  lines.push({ type: 'section', text: 'C O C I N A' });
  lines.push({ type: 'info', text: `Mesa: ${comanda.mesa}    Hora: ${comanda.hora}` });
  lines.push({ type: 'info', text: `Mozo: ${comanda.mesero}` });
  lines.push({ type: 'separator' });

  cocItems.forEach(item => {
    const opts = Object.values(item.opts || {}).filter(Boolean).join(' · ');
    const tag = item.cobro === 'cor' ? ' [CORTESIA]' : item.cobro === 'val' ? ' [VALE]' : '';
    lines.push({ type: 'item', qty: item.qty, name: item.nm + tag, opts: opts || null, nota: item.nota || null });
  });

  lines.push({ type: 'separator' });
  return buildEscPos(lines);
}

function generateTicketBar(comanda) {
  const lines = [];
  const barItems = comanda.items.filter(i => i.tipo === 'beb');
  if (!barItems.length) return null;

  lines.push({ type: 'title', text: 'SOL DE HUACARIZ' });
  lines.push({ type: 'text', text: 'Grill & Bar - Cajamarca' });
  lines.push({ type: 'section', text: 'B A R' });
  lines.push({ type: 'info', text: `Mesa: ${comanda.mesa}    Hora: ${comanda.hora}` });
  lines.push({ type: 'info', text: `Mozo: ${comanda.mesero}` });
  lines.push({ type: 'separator' });

  barItems.forEach(item => {
    const opts = Object.values(item.opts || {}).filter(Boolean).join(' · ');
    const tag = item.cobro === 'cor' ? ' [CORTESIA]' : item.cobro === 'val' ? ' [VALE]' : '';
    lines.push({ type: 'item', qty: item.qty, name: item.nm + tag, opts: opts || null, nota: item.nota || null });
  });

  lines.push({ type: 'separator' });
  return buildEscPos(lines);
}

function generateTicketCaja(comanda) {
  const lines = [];
  const cocItems = comanda.items.filter(i => i.tipo !== 'beb');
  const barItems = comanda.items.filter(i => i.tipo === 'beb');
  const total = comanda.items.reduce((s, i) => {
    return s + ((i.cobro === 'cob' || !i.cobro) ? parseFloat(i.pr || 0) * parseInt(i.qty || 0) : 0);
  }, 0);

  lines.push({ type: 'title', text: 'SOL DE HUACARIZ' });
  lines.push({ type: 'text', text: 'Grill & Bar - Cajamarca' });
  lines.push({ type: 'section', text: 'C A J A' });
  lines.push({ type: 'info', text: `Mesa: ${comanda.mesa}    Hora: ${comanda.hora}` });
  lines.push({ type: 'info', text: `Mozo: ${comanda.mesero}` });
  lines.push({ type: 'separator' });

  if (cocItems.length) {
    lines.push({ type: 'bold', text: 'PLATOS / GUARNICIONES' });
    cocItems.forEach(item => {
      const opts = Object.values(item.opts || {}).filter(Boolean).join(' · ');
      const tag = item.cobro === 'cor' ? ' [CORTESIA]' : item.cobro === 'val' ? ` [VALE: ${item.cobroExtra || ''}]` : '';
      lines.push({ type: 'item_price', qty: item.qty, name: item.nm + tag,
        price: (parseFloat(item.pr || 0) * parseInt(item.qty || 0)).toFixed(2),
        opts: opts || null, nota: item.nota || null });
    });
  }

  if (barItems.length) {
    lines.push({ type: 'bold', text: 'BEBIDAS' });
    barItems.forEach(item => {
      const opts = Object.values(item.opts || {}).filter(Boolean).join(' · ');
      const tag = item.cobro === 'cor' ? ' [CORTESIA]' : item.cobro === 'val' ? ` [VALE: ${item.cobroExtra || ''}]` : '';
      lines.push({ type: 'item_price', qty: item.qty, name: item.nm + tag,
        price: (parseFloat(item.pr || 0) * parseInt(item.qty || 0)).toFixed(2),
        opts: opts || null, nota: item.nota || null });
    });
  }

  lines.push({ type: 'total', amount: total.toFixed(2) });
  return buildEscPos(lines);
}

// ── PROCESS COMANDA ──
async function processComanda(key, comanda) {
  if (printed.has(key)) return;
  if (!comanda || !comanda.items || !comanda.items.length) return;
  
  printed.add(key);
  console.log(`\n📋 Nueva comanda: Mesa ${comanda.mesa} | ${comanda.hora} | ${comanda.mesero}`);

  const tasks = [];

  // Print to cocina
  const ticketCocina = generateTicketCocina(comanda);
  if (ticketCocina && PRINTERS.cocina.ip) {
    tasks.push(
      printRaw(PRINTERS.cocina.ip, PRINTERS.cocina.port, ticketCocina)
        .then(() => console.log('  ✅ Cocina imprimió'))
        .catch(e => console.error('  ❌ Cocina error:', e.message))
    );
  }

  // Print to bar
  const ticketBar = generateTicketBar(comanda);
  if (ticketBar && PRINTERS.bar.ip) {
    tasks.push(
      printRaw(PRINTERS.bar.ip, PRINTERS.bar.port, ticketBar)
        .then(() => console.log('  ✅ Bar imprimió'))
        .catch(e => console.error('  ❌ Bar error:', e.message))
    );
  }

  // Print to caja (always)
  const ticketCaja = generateTicketCaja(comanda);
  if (ticketCaja && PRINTERS.caja.ip) {
    tasks.push(
      printRaw(PRINTERS.caja.ip, PRINTERS.caja.port, ticketCaja)
        .then(() => console.log('  ✅ Caja imprimió'))
        .catch(e => console.error('  ❌ Caja error:', e.message))
    );
  }

  await Promise.all(tasks);

  // Mark as printed in Firebase
  await db.ref(`sdh/comandas/${key}/impreso`).set(true);
}

// ── LISTEN FIREBASE ──
console.log('🚀 Servidor de impresión Sol de Huacariz iniciado');
console.log(`📡 Escuchando Firebase: sol-huacariz-default-rtdb`);
console.log(`🖨  Cocina: ${PRINTERS.cocina.ip || 'NO CONFIGURADA'}`);
console.log(`🖨  Bar: ${PRINTERS.bar.ip || 'NO CONFIGURADA'}`);
console.log(`🖨  Caja: ${PRINTERS.caja.ip || 'NO CONFIGURADA'}`);

db.ref('sdh/comandas').on('child_added', async (snapshot) => {
  const key = snapshot.key;
  const comanda = snapshot.val();
  
  // Skip already printed or marked
  if (comanda && comanda.impreso) {
    printed.add(key);
    return;
  }
  
  // Small delay to ensure data is complete
  setTimeout(() => processComanda(key, comanda), 500);
});

// Keep process alive
setInterval(() => {}, 60000);
