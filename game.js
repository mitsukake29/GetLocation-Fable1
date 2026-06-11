"use strict";

/* =========================================================
 * ゲットリッチ・リバイバル
 * LINE ゲットリッチへのオマージュとして作られたボードゲーム
 * ========================================================= */

// ---------- 定数 ----------
const MAX_ROUNDS = 30;
const START_MONEY = 20000;
const SALARY = 3000;
const START_LANDING_BONUS = 1000;
const ISLAND_REST = 2;

const LEVEL_NAMES = ["", "別荘", "ビル", "ホテル", "ランドマーク"];
const LEVEL_ICONS = ["", "🏠", "🏢", "🏨", "🗼"];
// レベルごとの増築コスト（土地価格に対する倍率）。レベル1は購入価格に含む
const UPGRADE_RATE = [0, 0, 0.6, 1.0, 1.4];
// レベルごとの通行料（土地価格に対する倍率）
const TOLL_RATE = [0, 0.4, 1.0, 2.0, 4.0];
const MAX_LEVEL = 4;

// 日本の偉人キャラクター。stats が内部数値（本家のキャラカード能力に相当）
const DEFAULT_STATS = {
  buyRate: 1,      // 購入・増築・買収費の倍率（小さいほど得）
  tollGain: 1,     // 受け取る通行料の倍率
  tollPay: 1,      // 支払う通行料の倍率（小さいほど得）
  salaryRate: 1,   // 給料の倍率
  islandEscape: 0, // 無人島からゾロ目以外で脱出できる確率
  gaugePower: 1,   // ゲージインパクトの効きの強さ
  doubleBoost: 0,  // ゾロ目になる追加確率
};

const CHARACTERS = [
  { name: "織田信長", emoji: "⚔️", title: "天下布武",
    desc: "購入・買収費 5%引き／受取通行料 +10%",
    stats: { buyRate: 0.95, tollGain: 1.10 } },
  { name: "豊臣秀吉", emoji: "🐒", title: "人たらし",
    desc: "給料 +30%／支払通行料 10%引き",
    stats: { salaryRate: 1.30, tollPay: 0.90 } },
  { name: "徳川家康", emoji: "🦝", title: "泰平の徳",
    desc: "受取通行料 +15%／無人島脱出率 +25%",
    stats: { tollGain: 1.15, islandEscape: 0.25 } },
  { name: "卑弥呼", emoji: "🔮", title: "鬼道の巫女",
    desc: "ゲージの効き +60%／無人島脱出率 +20%",
    stats: { gaugePower: 1.6, islandEscape: 0.20 } },
  { name: "坂本龍馬", emoji: "⛵", title: "風雲児",
    desc: "ゾロ目率 +8%／給料 +15%",
    stats: { doubleBoost: 0.08, salaryRate: 1.15 } },
  { name: "紫式部", emoji: "📜", title: "雅の才媛",
    desc: "支払通行料 15%引き／購入費 3%引き",
    stats: { tollPay: 0.85, buyRate: 0.97 } },
];

const statOf = (p, key) => (p.stats && key in p.stats ? p.stats[key] : DEFAULT_STATS[key]);

const GROUP_COLORS = {
  A: "#8e44ad", B: "#16a085", C: "#e67e22", D: "#2980b9",
  E: "#c0392b", F: "#27ae60", G: "#d35400", H: "#f39c12",
};

// 出目→キューブの向き（f1=前面, f2=右, f3=上, f4=下, f5=左, f6=背面）
const DIE_ORIENT = {
  1: "rotateX(0deg) rotateY(0deg)",
  2: "rotateY(-90deg)",
  3: "rotateX(-90deg)",
  4: "rotateX(90deg)",
  5: "rotateY(90deg)",
  6: "rotateY(180deg)",
};

// ---------- 盤面定義（32マス・時計回り） ----------
function buildTiles() {
  const city = (name, group, price) => ({ type: "city", name, group, price, owner: null, level: 0 });
  const t = [];
  t[0] = { type: "start", name: "スタート" };
  t[1] = city("台北", "A", 1200);
  t[2] = city("バンコク", "A", 1400);
  t[3] = city("シンガポール", "A", 1600);
  t[4] = city("ソウル", "B", 1800);
  t[5] = { type: "chance", name: "チャンス" };
  t[6] = city("北京", "B", 2000);
  t[7] = city("上海", "B", 2200);
  t[8] = { type: "island", name: "無人島" };
  t[9] = city("シドニー", "C", 2400);
  t[10] = city("ドバイ", "C", 2600);
  t[11] = city("カイロ", "C", 2800);
  t[12] = city("モスクワ", "D", 3000);
  t[13] = { type: "chance", name: "チャンス" };
  t[14] = city("ベルリン", "D", 3200);
  t[15] = city("ローマ", "D", 3400);
  t[16] = { type: "olympic", name: "オリンピック" };
  t[17] = city("マドリード", "E", 3600);
  t[18] = city("パリ", "E", 3800);
  t[19] = city("ロンドン", "E", 4000);
  t[20] = city("トロント", "F", 4200);
  t[21] = { type: "chance", name: "チャンス" };
  t[22] = city("シカゴ", "F", 4400);
  t[23] = city("ニューヨーク", "F", 4600);
  t[24] = { type: "travel", name: "世界旅行" };
  t[25] = city("リオ", "G", 4800);
  t[26] = city("ロサンゼルス", "G", 5000);
  t[27] = city("ハワイ", "G", 5200);
  t[28] = city("京都", "H", 5600);
  t[29] = { type: "tax", name: "税務署" };
  t[30] = city("大阪", "H", 6000);
  t[31] = city("東京", "H", 6500);
  return t;
}

// マス番号 → グリッド座標（9x9、左上が1,1）
function tileGridPos(i) {
  if (i <= 8) return { row: 9, col: 9 - i };        // 下辺：右→左
  if (i <= 16) return { row: 9 - (i - 8), col: 1 };  // 左辺：下→上
  if (i <= 24) return { row: 1, col: 1 + (i - 16) }; // 上辺：左→右
  return { row: 1 + (i - 24), col: 9 };              // 右辺：上→下
}

// ---------- チャンスカード ----------
const CHANCE_CARDS = [
  { art: "💰", title: "宝くじ大当たり！", desc: "賞金 2,000G を受け取る", apply: async (p) => { gainMoney(p, 2000); } },
  { art: "🧾", title: "スピード違反", desc: "罰金 1,000G を支払う", apply: async (p) => { await payToBank(p, 1000); } },
  { art: "🏁", title: "スタートへ進む", desc: "スタートに移動して給料を受け取る", apply: async (p) => { await teleport(p, 0, true); } },
  { art: "🏝️", title: "嵐に巻き込まれた！", desc: "無人島へ流される（2回休み）", apply: async (p) => { await teleport(p, 8, false); } },
  { art: "🎂", title: "誕生日パーティー", desc: "全員から 500G ずつもらう", apply: async (p) => {
      for (const o of state.players) {
        if (o !== p && o.alive) await transfer(o, p, 500);
      }
    } },
  { art: "✈️", title: "緊急出張", desc: "好きなマスへ移動できる", apply: async (p) => { await doTravel(p); } },
  { art: "💼", title: "臨時ボーナス", desc: "給料日！3,000G を受け取る", apply: async (p) => { gainMoney(p, SALARY); } },
  { art: "📉", title: "株価大暴落", desc: "所持金の10%を失う", apply: async (p) => { await payToBank(p, Math.floor(p.money * 0.1)); } },
];

// ---------- 状態 ----------
const state = {
  tiles: [],
  players: [],
  round: 1,
  currentIdx: 0,
  olympicTile: null, // 開催都市のマス番号
  gameOver: false,
};

// ---------- ユーティリティ ----------
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 「12万8875」のような万表記
const fmt = (n) => {
  n = Math.floor(n);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 10000) return sign + abs.toLocaleString("ja-JP");
  const man = Math.floor(abs / 10000);
  const rest = abs % 10000;
  return sign + man.toLocaleString("ja-JP") + "万" + (rest ? String(rest).padStart(4, "0") : "");
};
const rand = (n) => Math.floor(Math.random() * n);

function log(msg, strong = false) {
  const el = document.createElement("div");
  if (strong) el.className = "log-strong";
  el.textContent = msg;
  $("log").prepend(el);
}

function centerMsg(msg) {
  const el = $("center-msg");
  el.textContent = msg;
  el.classList.remove("pop");
  void el.offsetWidth; // アニメーション再トリガー
  if (msg) el.classList.add("pop");
}

// モーダルで選択肢を表示し、選ばれた値を返す
function choose(title, bodyHTML, options) {
  return new Promise((resolve) => {
    $("modal-title").textContent = title;
    $("modal-body").innerHTML = bodyHTML;
    const btns = $("modal-buttons");
    btns.innerHTML = "";
    for (const opt of options) {
      const b = document.createElement("button");
      b.className = "modal-btn" + (opt.secondary ? " secondary" : "");
      b.textContent = opt.label;
      b.onclick = () => {
        $("modal").classList.add("hidden");
        resolve(opt.value);
      };
      btns.appendChild(b);
    }
    $("modal").classList.remove("hidden");
  });
}

// セレクトボックス付きモーダル
function chooseFromList(title, bodyText, items) {
  return new Promise((resolve) => {
    $("modal-title").textContent = title;
    const body = $("modal-body");
    body.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = bodyText;
    const sel = document.createElement("select");
    items.forEach((it, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = it.label;
      sel.appendChild(o);
    });
    body.appendChild(p);
    body.appendChild(sel);
    const btns = $("modal-buttons");
    btns.innerHTML = "";
    const b = document.createElement("button");
    b.className = "modal-btn";
    b.textContent = "決定";
    b.onclick = () => {
      $("modal").classList.add("hidden");
      resolve(items[+sel.value].value);
    };
    btns.appendChild(b);
    $("modal").classList.remove("hidden");
  });
}

// カード演出（OKのみ）
async function showCard(art, title, desc) {
  await choose(title, `<div class="card-art">${art}</div>${desc}`, [{ label: "OK", value: true }]);
}

// ---------- 資産計算 ----------
function investedValue(tile) {
  let v = tile.price; // レベル1まで含む
  for (let lv = 2; lv <= tile.level; lv++) v += Math.floor(tile.price * UPGRADE_RATE[lv]);
  return v;
}

function upgradeCost(tile) {
  return Math.floor(tile.price * UPGRADE_RATE[tile.level + 1]);
}

function ownsFullLine(player, group) {
  return state.tiles
    .filter((t) => t.type === "city" && t.group === group)
    .every((t) => t.owner === player.id);
}

function tollOf(tile) {
  if (tile.owner === null || tile.level === 0) return 0;
  let toll = Math.floor(tile.price * TOLL_RATE[tile.level]);
  const owner = state.players[tile.owner];
  if (ownsFullLine(owner, tile.group)) toll *= 2;
  if (state.olympicTile === state.tiles.indexOf(tile)) toll *= 2;
  return toll;
}

function acquireCost(tile) {
  return investedValue(tile) * 2;
}

function totalAssets(player) {
  let v = player.money;
  for (const t of state.tiles) {
    if (t.type === "city" && t.owner === player.id) v += investedValue(t);
  }
  return v;
}

function playerCities(player) {
  return state.tiles.filter((t) => t.type === "city" && t.owner === player.id);
}

// ---------- お金の移動 ----------
function gainMoney(p, amount) {
  p.money += amount;
  log(`${p.emoji} ${p.name} が ${fmt(amount)} を獲得`);
  floatText(p.pos, `+${fmt(amount)}`, "#ffe96b");
  renderPlayers();
}

// 支払い。足りなければ資産を売却し、それでも無理なら破産
async function payToBank(p, amount) {
  await settle(p, amount, null);
}

async function transfer(from, to, amount) {
  await settle(from, amount, to);
}

async function settle(p, amount, receiver) {
  if (amount <= 0) return;
  // 足りない場合は安い物件から強制売却（売値は投資額の80%）
  while (p.money < amount) {
    const cities = playerCities(p).sort((a, b) => investedValue(a) - investedValue(b));
    if (cities.length === 0) break;
    const t = cities[0];
    const sale = Math.floor(investedValue(t) * 0.8);
    if (state.olympicTile === state.tiles.indexOf(t)) state.olympicTile = null;
    t.owner = null;
    t.level = 0;
    p.money += sale;
    log(`${p.emoji} ${p.name} は支払いのため ${t.name} を ${fmt(sale)} で売却…`, true);
    renderTile(state.tiles.indexOf(t));
  }
  const paid = Math.min(p.money, amount);
  p.money -= paid;
  floatText(p.pos, `-${fmt(paid)}`, "#ff8a7a");
  if (receiver) {
    receiver.money += paid;
    if (receiver.pos !== p.pos) floatText(receiver.pos, `+${fmt(paid)}`, "#ffe96b");
    log(`${p.emoji} ${p.name} → ${receiver.emoji} ${receiver.name} に ${fmt(paid)} 支払い`);
  } else {
    log(`${p.emoji} ${p.name} が ${fmt(paid)} を支払い`);
  }
  if (paid < amount) bankrupt(p);
  renderPlayers();
}

function bankrupt(p) {
  p.alive = false;
  for (const t of state.tiles) {
    if (t.type === "city" && t.owner === p.id) {
      if (state.olympicTile === state.tiles.indexOf(t)) state.olympicTile = null;
      t.owner = null;
      t.level = 0;
      renderTile(state.tiles.indexOf(t));
    }
  }
  log(`💥 ${p.emoji} ${p.name} は破産した！`, true);
  renderPlayers();
}

// ---------- 描画 ----------
// CSS 3D の直方体（屋上面＋四方の壁）。w/d はタイルに対する%、h/z はpx
function boxHTML(cls, w, d, h, z) {
  return `<div class="box ${cls}" style="--w:${w};--d:${d};--h:${h}px;--z:${z}px">` +
    `<i class="bf top"></i><i class="bf front"></i><i class="bf back"></i>` +
    `<i class="bf left"></i><i class="bf right"></i></div>`;
}

// レベル別の建物（別荘→ビル→ホテル→ランドマーク）
function buildingHTML(level) {
  if (level <= 0) return "";
  let h = `<div class="bld lv${level}">`;
  if (level === 1) {
    h += boxHTML("b-villa-body", "42%", "36%", 16, 0);
    h += boxHTML("b-villa-roof", "52%", "46%", 8, 16);
  } else if (level === 2) {
    h += boxHTML("b-bldg", "38%", "32%", 30, 0);
    h += boxHTML("b-cap", "28%", "24%", 4, 30);
  } else if (level === 3) {
    h += boxHTML("b-hotel-base", "54%", "42%", 13, 0);
    h += boxHTML("b-hotel-tower", "36%", "29%", 30, 13);
    h += boxHTML("b-cap", "24%", "20%", 5, 43);
  } else {
    h += boxHTML("b-lm-base", "56%", "44%", 12, 0);
    h += boxHTML("b-lm-mid", "40%", "32%", 22, 12);
    h += boxHTML("b-lm-spire", "22%", "18%", 26, 34);
    h += boxHTML("b-lm-tip", "11%", "9%", 9, 60);
  }
  return h + "</div>";
}

// 盤面上に浮かぶお金の増減テキスト
function floatText(tileIdx, text, color) {
  const tileEl = $(`tile-${tileIdx}`);
  if (!document.body || !tileEl || !tileEl.getBoundingClientRect) return;
  const r = tileEl.getBoundingClientRect();
  const fx = document.createElement("div");
  fx.className = "float-money";
  fx.textContent = text;
  fx.style.left = `${r.left + r.width / 2}px`;
  fx.style.top = `${r.top}px`;
  fx.style.color = color;
  document.body.appendChild(fx);
  setTimeout(() => fx.remove(), 1400);
}

function renderBoard() {
  const board = $("board");
  board.innerHTML = "";
  // 中央の池
  const pond = document.createElement("div");
  pond.id = "pond";
  pond.style.gridRow = "2 / 9";
  pond.style.gridColumn = "2 / 9";
  pond.innerHTML = `<span class="pond-logo">GET RICH</span><span class="pond-sub">REVIVAL</span>`;
  board.appendChild(pond);

  state.tiles.forEach((tile, i) => {
    const div = document.createElement("div");
    div.className = "tile";
    div.id = `tile-${i}`;
    const { row, col } = tileGridPos(i);
    div.style.gridRow = row;
    div.style.gridColumn = col;
    board.appendChild(div);
    renderTile(i);
  });
}

function renderTile(i) {
  const tile = state.tiles[i];
  const div = $(`tile-${i}`);
  div.className = "tile";
  let inner = "";
  let stand = "";
  let topStyle = "";

  let building = "";
  if (tile.type === "city") {
    div.classList.add("city");
    const c = GROUP_COLORS[tile.group];
    topStyle = `background:linear-gradient(180deg, ${c}, ${c} 55%, rgba(0,0,0,0.25))`;
    inner += `<div class="tile-name">${tile.name}</div>`;
    if (tile.owner !== null) {
      const owner = state.players[tile.owner];
      div.classList.add("owned");
      topStyle += `;outline-color:${owner.color}`;
      inner += `<div class="tile-sub">${fmt(tollOf(tile))}</div>`;
      inner += `<div class="owner-dot" style="background:${owner.color}"></div>`;
      inner += `<div class="lv-flat">${LEVEL_ICONS[tile.level]}</div>`;
      building = buildingHTML(tile.level);
    } else {
      inner += `<div class="tile-sub">${fmt(tile.price)}</div>`;
    }
    if (state.olympicTile === i) inner += `<div class="olympic-mark">🔥</div>`;
  } else {
    const icons = { start: "🏁", chance: "🎁", island: "🏝️", olympic: "🔥", travel: "✈️", tax: "🏛️" };
    div.classList.add(["start", "island", "olympic", "travel"].includes(tile.type) ? "corner" : "special");
    inner += `<div class="tile-name">${tile.name}</div>`;
    stand += `<span class="sicon">${icons[tile.type]}</span>`;
  }

  const tokens = state.players
    .filter((p) => p.alive && p.pos === i)
    .map((p) => `<span class="tok" style="--tc:${p.color}">${p.emoji}</span>`)
    .join("");
  if (tokens) stand += `<span class="tokens">${tokens}</span>`;

  div.innerHTML =
    `<div class="tile-top" style="${topStyle}">${inner}</div>` +
    building +
    `<div class="stand">${stand}</div>`;
}

function renderAllTokens() {
  state.tiles.forEach((_, i) => renderTile(i));
}

function renderPlayers() {
  const hud = $("hud");
  hud.innerHTML = "";
  // 総資産順位（破産者は最下位）
  const ranked = [...state.players].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return totalAssets(b) - totalAssets(a);
  });
  state.players.forEach((p, idx) => {
    const rank = ranked.indexOf(p) + 1;
    const card = document.createElement("div");
    card.className = `hud-card c${idx}`;
    if (idx === state.currentIdx && p.alive && !state.gameOver) card.classList.add("current");
    if (!p.alive) card.classList.add("dead");
    const status = !p.alive ? "💥 破産"
      : p.islandTurns > 0 ? `🏝️ ${p.islandTurns}回休み`
      : p.human ? "あなた" : "CPU";
    if (!state.prevMoney) state.prevMoney = {};
    const flash = state.prevMoney[p.id] !== undefined && state.prevMoney[p.id] !== p.money;
    state.prevMoney[p.id] = p.money;
    card.innerHTML = `
      <div class="hud-rank r${rank}">${rank}位</div>
      <div class="hud-avatar" style="border-color:${p.color}">${p.emoji}</div>
      <div class="hud-info">
        <div class="hud-name">${p.name}<span>${status}</span></div>
        <div class="hud-money${flash ? " flash" : ""}">💵 ${fmt(p.money)}</div>
        <div class="hud-assets">総資産 ${fmt(totalAssets(p))} ／ 🏙️ ${playerCities(p).length}都市</div>
      </div>`;
    hud.appendChild(card);
  });
  $("round-info").textContent = `ラウンド ${Math.min(state.round, MAX_ROUNDS)} / ${MAX_ROUNDS}`;
}

function highlightTile(i) {
  document.querySelectorAll(".active-tile").forEach((el) => el.classList.remove("active-tile"));
  if (i !== null) $(`tile-${i}`).classList.add("active-tile");
}

// ---------- サイコロ（ゲージインパクト） ----------
// gauge: 0(左=小さい目が出やすい)〜1(右=大きい目が出やすい)。あくまで「出やすくなる」だけ
function weightedFace(bias, power) {
  const w = [];
  for (let f = 1; f <= 6; f++) {
    w.push(Math.max(0.15, 1 + bias * power * (f - 3.5) / 2.5));
  }
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let f = 0; f < 6; f++) {
    r -= w[f];
    if (r <= 0) return f + 1;
  }
  return 6;
}

async function rollDice(gauge, p) {
  const c1 = $("cube1"), c2 = $("cube2");
  c1.className = "cube spin-a";
  c2.className = "cube spin-b";
  await wait(650);
  const bias = (gauge - 0.5) * 2;
  const power = statOf(p, "gaugePower");
  const a = weightedFace(bias, power);
  let b = weightedFace(bias, power);
  if (a !== b && Math.random() < statOf(p, "doubleBoost")) b = a; // キャラ能力：ゾロ目補正
  c1.className = "cube";
  c2.className = "cube";
  c1.style.transform = DIE_ORIENT[a];
  c2.style.transform = DIE_ORIENT[b];
  await wait(480);
  return [a, b];
}

// 人間用：ゲージを往復させ、ボタンを押した瞬間の位置を返す
function waitForGaugeStop() {
  return new Promise((resolve) => {
    const btn = $("roll-btn");
    const wrap = $("gauge-wrap");
    const cursor = $("gauge-cursor");
    wrap.classList.remove("hidden");
    btn.classList.remove("hidden");
    let g = 0, dir = 1;
    const timer = setInterval(() => {
      g += dir * 0.035;
      if (g >= 1) { g = 1; dir = -1; }
      if (g <= 0) { g = 0; dir = 1; }
      cursor.style.left = `${g * 100}%`;
    }, 16);
    btn.onclick = () => {
      clearInterval(timer);
      btn.classList.add("hidden");
      wrap.classList.add("hidden");
      resolve(g);
    };
  });
}

// プレイヤー種別に応じてゲージ値を決めてサイコロを振る
async function rollForPlayer(p) {
  let gauge;
  if (p.human) {
    gauge = await waitForGaugeStop();
  } else {
    gauge = Math.random();
    await wait(900);
  }
  return rollDice(gauge, p);
}

// ---------- 移動 ----------
async function movePlayer(p, steps) {
  for (let s = 0; s < steps; s++) {
    const prev = p.pos;
    p.pos = (p.pos + 1) % 32;
    renderTile(prev);
    renderTile(p.pos);
    if (p.pos === 0) {
      const sal = Math.floor(SALARY * statOf(p, "salaryRate"));
      gainMoney(p, sal);
      log(`${p.emoji} ${p.name} がスタートを通過！給料 ${fmt(sal)}`);
    }
    await wait(160);
  }
  highlightTile(p.pos);
}

async function teleport(p, dest, salaryOnWrap) {
  const prev = p.pos;
  if (salaryOnWrap && dest <= p.pos) {
    gainMoney(p, Math.floor(SALARY * statOf(p, "salaryRate")));
  }
  p.pos = dest;
  renderTile(prev);
  renderTile(dest);
  highlightTile(dest);
  log(`${p.emoji} ${p.name} は ${state.tiles[dest].name} へ移動`);
  if (dest === 8) p.islandTurns = ISLAND_REST;
  await wait(400);
  if (dest !== 8 && dest !== p.lastResolved) {
    await resolveTile(p);
  }
}

// ---------- マス処理 ----------
async function resolveTile(p) {
  const tile = state.tiles[p.pos];
  p.lastResolved = p.pos;
  switch (tile.type) {
    case "start":
      gainMoney(p, START_LANDING_BONUS);
      centerMsg(`スタートぴったり！ボーナス ${fmt(START_LANDING_BONUS)}`);
      break;
    case "city":
      await resolveCity(p, tile);
      break;
    case "chance":
      await resolveChance(p);
      break;
    case "island":
      p.islandTurns = ISLAND_REST;
      centerMsg(`${p.name} は無人島に漂着… ${ISLAND_REST}回休み！`);
      log(`${p.emoji} ${p.name} は無人島に漂着（${ISLAND_REST}回休み）`);
      break;
    case "olympic":
      await resolveOlympic(p);
      break;
    case "travel":
      p.travelPending = true;
      centerMsg(`${p.name} は世界旅行へ！次のターンに好きなマスへ飛べる`);
      log(`${p.emoji} ${p.name} は世界旅行のチケットを手に入れた`);
      break;
    case "tax": {
      const tax = Math.floor(p.money * 0.1);
      centerMsg(`税務署！所持金の10%（${fmt(tax)}）を納税`);
      await payToBank(p, tax);
      break;
    }
  }
  renderPlayers();
}

async function resolveCity(p, tile) {
  const i = p.pos;
  if (tile.owner === null) {
    // --- 購入 ---
    const price = Math.floor(tile.price * statOf(p, "buyRate"));
    if (p.money < price) {
      centerMsg(`${tile.name} は ${fmt(price)}。資金不足で買えない…`);
      return;
    }
    let buy;
    if (p.human) {
      buy = await choose(
        `${tile.name} を購入しますか？`,
        `価格：<b>${fmt(price)}</b>（別荘付き）<br>通行料：${fmt(Math.floor(price * TOLL_RATE[1]))}〜`,
        [
          { label: "購入する", value: true },
          { label: "やめる", value: false, secondary: true },
        ]
      );
    } else {
      buy = cpuWantsToBuy(p, tile);
      await wait(500);
    }
    if (buy) {
      p.money -= price;
      tile.owner = p.id;
      tile.level = 1;
      centerMsg(`${p.name} が ${tile.name} を購入！`);
      log(`${p.emoji} ${p.name} が ${tile.name} を ${fmt(price)} で購入`);
      if (ownsFullLine(p, tile.group)) log(`🎉 ${p.name} が ${tile.name} のラインを独占！通行料2倍！`, true);
      renderTile(i);
    }
  } else if (tile.owner === p.id) {
    // --- 増築 ---
    if (tile.level >= MAX_LEVEL) return;
    const cost = Math.floor(upgradeCost(tile) * statOf(p, "buyRate"));
    if (p.money < cost) return;
    let up;
    const nextName = LEVEL_NAMES[tile.level + 1];
    if (p.human) {
      up = await choose(
        `${tile.name} を増築しますか？`,
        `${LEVEL_ICONS[tile.level + 1]} <b>${nextName}</b> を建設：${fmt(cost)}<br>` +
          (tile.level + 1 === MAX_LEVEL ? "🗼 ランドマークは買収されません！" : `通行料が ${fmt(Math.floor(tile.price * TOLL_RATE[tile.level + 1]))} にアップ`),
        [
          { label: "増築する", value: true },
          { label: "やめる", value: false, secondary: true },
        ]
      );
    } else {
      up = p.money - cost > 4000;
      await wait(500);
    }
    if (up) {
      p.money -= cost;
      tile.level++;
      centerMsg(`${tile.name} に ${nextName} が建った！`);
      log(`${p.emoji} ${p.name} が ${tile.name} を ${nextName} に増築`);
      renderTile(i);
    }
  } else {
    // --- 通行料 → 買収 ---
    const owner = state.players[tile.owner];
    // キャラ能力（支払い割引・受取アップ）を反映
    const toll = Math.floor(tollOf(tile) * statOf(p, "tollPay") * statOf(owner, "tollGain"));
    centerMsg(`${owner.name} の ${tile.name}！通行料 ${fmt(toll)}`);
    log(`${p.emoji} ${p.name} は ${owner.name} の ${tile.name} に到着（通行料 ${fmt(toll)}）`);
    await wait(600);
    await transfer(p, owner, toll);
    if (!p.alive) return;

    if (tile.level < MAX_LEVEL) {
      const cost = Math.floor(acquireCost(tile) * statOf(p, "buyRate"));
      if (p.money >= cost) {
        let take;
        if (p.human) {
          take = await choose(
            `${tile.name} を買収しますか？`,
            `${owner.emoji} ${owner.name} から <b>${fmt(cost)}</b>（資産価値の2倍）で買収できます`,
            [
              { label: "買収する！", value: true },
              { label: "やめる", value: false, secondary: true },
            ]
          );
        } else {
          take = cpuWantsToAcquire(p, tile, cost);
          await wait(400);
        }
        if (take) {
          p.money -= cost;
          owner.money += cost;
          tile.owner = p.id;
          centerMsg(`💥 ${p.name} が ${tile.name} を買収した！`);
          log(`💥 ${p.emoji} ${p.name} が ${owner.name} から ${tile.name} を ${fmt(cost)} で買収！`, true);
          if (ownsFullLine(p, tile.group)) log(`🎉 ${p.name} が ${tile.name} のラインを独占！`, true);
          renderTile(i);
        }
      }
    }
  }
}

async function resolveChance(p) {
  const card = CHANCE_CARDS[rand(CHANCE_CARDS.length)];
  centerMsg(`チャンスカード：${card.title}`);
  log(`🎁 ${p.emoji} ${p.name} のチャンスカード「${card.title}」`);
  if (p.human) {
    await showCard(card.art, card.title, card.desc);
  } else {
    await wait(900);
  }
  await card.apply(p);
}

async function resolveOlympic(p) {
  const cities = playerCities(p);
  if (cities.length === 0) {
    centerMsg("オリンピック開催地…でも都市を持っていない！");
    return;
  }
  let tile;
  if (p.human) {
    tile = await chooseFromList(
      "🔥 オリンピック開催！",
      "自分の都市を1つ選ぶと、その都市の通行料が2倍になります（開催地は世界に1つ）",
      cities.map((c) => ({ label: `${c.name}（現在 ${fmt(tollOf(c))}）`, value: c }))
    );
  } else {
    tile = cities.reduce((a, b) => (tollOf(a) >= tollOf(b) ? a : b));
    await wait(600);
  }
  const prevOlympic = state.olympicTile;
  state.olympicTile = state.tiles.indexOf(tile);
  if (prevOlympic !== null) renderTile(prevOlympic);
  renderTile(state.olympicTile);
  centerMsg(`🔥 ${tile.name} でオリンピック開催！通行料2倍！`);
  log(`🔥 ${p.emoji} ${p.name} が ${tile.name} をオリンピック開催地に指定！`, true);
}

// ---------- 世界旅行 ----------
async function doTravel(p) {
  let dest;
  if (p.human) {
    const items = state.tiles
      .map((t, i) => ({ label: `${i}: ${t.name}${t.type === "city" && t.owner === null ? `（${fmt(t.price)}）` : ""}`, value: i }))
      .filter((it) => it.value !== p.pos);
    dest = await chooseFromList("✈️ 世界旅行", "行き先のマスを選んでください", items);
  } else {
    dest = cpuTravelDest(p);
    await wait(600);
  }
  p.lastResolved = -1;
  await teleport(p, dest, true);
}

// ---------- CPU 思考 ----------
function cpuWantsToBuy(p, tile) {
  const reserve = state.round < 10 ? 2500 : 4000;
  if (p.money - tile.price < reserve) return false;
  return true;
}

function cpuWantsToAcquire(p, tile, cost) {
  if (p.money - cost < 5000) return false;
  // ライン完成するなら積極的に
  const group = state.tiles.filter((t) => t.type === "city" && t.group === tile.group);
  const ownedByMe = group.filter((t) => t.owner === p.id).length;
  if (ownedByMe === group.length - 1) return true;
  return cost < p.money * 0.35;
}

function cpuTravelDest(p) {
  // 1) 買える最高額の空き都市 2) 増築できる自都市 3) スタート
  const buyable = state.tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.type === "city" && t.owner === null && p.money - t.price > 2500)
    .sort((a, b) => b.t.price - a.t.price);
  if (buyable.length) return buyable[0].i;
  const upgradable = state.tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.type === "city" && t.owner === p.id && t.level < MAX_LEVEL && p.money - upgradeCost(t) > 3000)
    .sort((a, b) => b.t.price - a.t.price);
  if (upgradable.length) return upgradable[0].i;
  return 0;
}

// ---------- ターン進行 ----------
async function gameLoop() {
  while (!state.gameOver) {
    const p = state.players[state.currentIdx];
    if (p.alive) {
      await takeTurn(p);
      if (checkGameEnd()) break;
    }
    // 次のプレイヤーへ（盤面1周でラウンド+1）
    state.currentIdx = (state.currentIdx + 1) % state.players.length;
    if (state.currentIdx === 0) {
      state.round++;
      if (state.round > MAX_ROUNDS) {
        endGame("規定ラウンド終了！");
        break;
      }
    }
    renderPlayers();
  }
}

async function takeTurn(p) {
  renderPlayers();
  $("turn-banner").textContent = `${p.emoji} ${p.name} のターン`;
  highlightTile(p.pos);
  let again = true;
  let doubleCount = 0;

  // 世界旅行チケット
  if (p.travelPending) {
    p.travelPending = false;
    centerMsg(`${p.name} は世界旅行で移動！`);
    await doTravel(p);
    return;
  }

  // 無人島
  if (p.islandTurns > 0) {
    centerMsg(`${p.name} は無人島… ゾロ目が出れば脱出！`);
    const [a, b] = await rollForPlayer(p);
    const luckyEscape = a !== b && Math.random() < statOf(p, "islandEscape");
    if (a === b || luckyEscape) {
      p.islandTurns = 0;
      log(`🏝️ ${p.emoji} ${p.name} は${a === b ? "ゾロ目" : "キャラ能力"}で無人島を脱出！`);
      centerMsg(a === b ? "ゾロ目で脱出成功！" : `${p.name} の能力で脱出成功！`);
      await wait(500);
      await movePlayer(p, a + b);
      p.lastResolved = -1;
      await resolveTile(p);
    } else {
      p.islandTurns--;
      log(`🏝️ ${p.emoji} ${p.name} は脱出失敗…（あと${p.islandTurns}回休み）`);
      centerMsg("脱出失敗…");
      await wait(700);
    }
    return;
  }

  while (again && p.alive && !state.gameOver) {
    again = false;
    centerMsg("");
    const [a, b] = await rollForPlayer(p);
    const isDouble = a === b;
    if (isDouble) doubleCount++;

    if (doubleCount >= 3) {
      log(`🚨 ${p.emoji} ${p.name} はゾロ目3連続！スピード違反で無人島へ！`, true);
      await teleport(p, 8, false);
      break;
    }

    log(`${p.emoji} ${p.name} のサイコロ：${a} + ${b} = ${a + b}${isDouble ? "（ゾロ目！）" : ""}`);
    await wait(350);
    await movePlayer(p, a + b);
    p.lastResolved = -1;
    await resolveTile(p);

    if (isDouble && p.alive && p.islandTurns === 0 && !p.travelPending) {
      centerMsg("ゾロ目！もう一度サイコロを振れる！");
      await wait(600);
      again = true;
    }
  }
}

// ---------- 終了判定 ----------
function checkGameEnd() {
  const alive = state.players.filter((p) => p.alive);
  if (alive.length <= 1) {
    endGame(alive.length === 1 ? `${alive[0].name} 以外全員破産！` : "全員破産！");
    return true;
  }
  return false;
}

function endGame(reason) {
  state.gameOver = true;
  const ranking = [...state.players].sort((x, y) => {
    if (x.alive !== y.alive) return x.alive ? -1 : 1;
    return totalAssets(y) - totalAssets(x);
  });
  const winner = ranking[0];
  log(`🏆 ゲーム終了：${reason}`, true);
  log(`🏆 優勝は ${winner.emoji} ${winner.name}！（総資産 ${fmt(totalAssets(winner))}）`, true);
  renderPlayers();

  const lines = ranking
    .map((p, i) => `${["🥇", "🥈", "🥉", "4."][i]} ${p.emoji} ${p.name} — ${p.alive ? "総資産 " + fmt(totalAssets(p)) : "破産"}`)
    .join("<br>");
  choose(`🏆 優勝：${winner.emoji} ${winner.name}！`, `${reason}<br><br>${lines}`, [
    { label: "もう一度遊ぶ", value: true },
  ]).then(() => location.reload());
}

// ---------- セットアップ ----------
let selectedChar = 0;
let selectedCpu = 2;

function initSetup() {
  const charArea = $("char-select");
  CHARACTERS.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "char-btn" + (i === 0 ? " selected" : "");
    b.innerHTML = `${c.emoji}<span class="char-name">${c.name}</span>` +
      `<span class="char-title">${c.title}</span>` +
      `<span class="char-desc">${c.desc}</span>`;
    b.onclick = () => {
      selectedChar = i;
      document.querySelectorAll(".char-btn").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
    };
    charArea.appendChild(b);
  });

  document.querySelectorAll(".cpu-btn").forEach((b) => {
    b.onclick = () => {
      selectedCpu = +b.dataset.cpu;
      document.querySelectorAll(".cpu-btn").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
    };
  });

  $("start-btn").onclick = startGame;
}

function startGame() {
  state.tiles = buildTiles();
  const colors = ["var(--p0)", "var(--p1)", "var(--p2)", "var(--p3)"];
  const colorHex = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71"];

  // CPUは残りの偉人からランダムに選出
  const order = [selectedChar];
  const rest = CHARACTERS.map((_, i) => i).filter((i) => i !== selectedChar);
  while (order.length < 1 + selectedCpu) {
    order.push(rest.splice(rand(rest.length), 1)[0]);
  }

  state.players = order.map((charIdx, id) => ({
    id,
    name: CHARACTERS[charIdx].name,
    emoji: CHARACTERS[charIdx].emoji,
    title: CHARACTERS[charIdx].title,
    stats: CHARACTERS[charIdx].stats,
    color: colorHex[id],
    human: id === 0,
    money: START_MONEY,
    pos: 0,
    alive: true,
    islandTurns: 0,
    travelPending: false,
    lastResolved: -1,
  }));

  $("setup-screen").classList.add("hidden");
  $("game-screen").classList.remove("hidden");
  renderBoard();
  renderPlayers();
  log("🎲 ゲームスタート！全員 " + fmt(START_MONEY) + " からスタート");
  gameLoop();
}

initSetup();
