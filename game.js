"use strict";

/* =========================================================
 * ゲットリッチ・リバイバル
 * LINE ゲットリッチへのオマージュとして作られたボードゲーム
 * ========================================================= */

// ---------- 定数 ----------
const MAX_ROUNDS = 30;
const START_MONEY = 50000000;        // 5000万
const SALARY = 6000000;              // 600万
const START_LANDING_BONUS = 2000000; // 200万
const ISLAND_REST = 2;

// レベル：1=別荘 → 2=ビル → 3=ランドマーク（都市ごとの名物建築）
const LEVEL_NAMES = ["", "別荘", "ビル", "ランドマーク"];
const LEVEL_ICONS = ["", "🏠", "🏢", "🗼"];
const MAX_LEVEL = 3;

// すべて土地価格 P に対する倍率（例：P=500万 の都市）
const TOLL_RATE = [0, 1.6, 4, 10];      // 着地時の通行料（別荘800万/ビル2000万/LM5000万）
const PASS_RATE = 6;                    // ランドマークは通過するだけで 6P（3000万）
const OWN_UPGRADE_RATE = [0, 0, 1.5, 2.5];  // 自分の土地の増築費
const TAKEOVER_RATE = [0, 0, 3, 8];     // 買収して1段階建て替える費用（→ビル1500万/→LM4000万）
const VALUE_RATE = [0, 1, 2.5, 5];      // 資産価値（売却・総資産の計算用）

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

// ---------- サウンド（Web Audio APIでその場で合成・外部ファイル不使用） ----------
const SFX = (() => {
  const ok = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  let ctx = null;
  const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

  function tone(freq, dur, { type = "sine", vol = 0.16, delay = 0, slide = 0 } = {}) {
    if (!ok) return;
    const c = ac(), t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise(dur, { vol = 0.12, delay = 0, freq = 1800 } = {}) {
    if (!ok) return;
    const c = ac(), t = c.currentTime + delay;
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  }

  return {
    unlock() { if (ok && ac().resume) ac().resume(); },
    click() { tone(660, 0.06, { type: "square", vol: 0.07 }); },
    chargeTick(g01) { tone(280 + g01 * 760, 0.045, { type: "square", vol: 0.05 }); },
    diceRoll() { for (let i = 0; i < 6; i++) noise(0.05, { delay: i * 0.09, vol: 0.1, freq: 2400 }); },
    diceStop() { tone(170, 0.12, { type: "triangle", vol: 0.25 }); noise(0.07, { vol: 0.18, freq: 700 }); },
    step() { tone(540, 0.045, { vol: 0.06 }); },
    coin() { tone(880, 0.09, { vol: 0.11 }); tone(1320, 0.13, { delay: 0.07, vol: 0.11 }); },
    pay() { tone(440, 0.11, { vol: 0.11 }); tone(320, 0.16, { delay: 0.09, vol: 0.11 }); },
    buy() { [523, 659, 784].forEach((f, i) => tone(f, 0.13, { delay: i * 0.07, vol: 0.13 })); },
    takeover() { tone(180, 0.22, { slide: 420, type: "sawtooth", vol: 0.14 }); tone(620, 0.16, { delay: 0.16, vol: 0.13 }); },
    landmark() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { delay: i * 0.1, vol: 0.15, type: "triangle" })); },
    double() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.13, { delay: i * 0.06, vol: 0.15, type: "square" })); },
    chance() { tone(680, 0.16, { slide: 540, vol: 0.12 }); },
    island() { tone(420, 0.34, { slide: -220, vol: 0.14, type: "triangle" }); },
    bankrupt() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.26, { delay: i * 0.16, vol: 0.15, type: "sawtooth" })); },
    win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, { delay: i * 0.12, vol: 0.16, type: "triangle" })); },
  };
})();

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
// lm: その都市を代表するランドマークの名前 / lmKey: 3Dモデルの種類
function buildTiles() {
  const M = 10000; // 万
  const city = (name, group, price, lm, lmKey) =>
    ({ type: "city", name, group, price, owner: null, level: 0, lm, lmKey });
  const t = [];
  t[0] = { type: "start", name: "スタート" };
  t[1] = city("台北", "A", 120 * M, "台北101", "tower101");
  t[2] = city("バンコク", "A", 140 * M, "ワット・アルン", "watArun");
  t[3] = city("シンガポール", "A", 160 * M, "マリーナベイサンズ", "marinaBay");
  t[4] = city("ソウル", "B", 180 * M, "Nソウルタワー", "seoulTower");
  t[5] = { type: "chance", name: "チャンス" };
  t[6] = city("北京", "B", 200 * M, "天安門", "tiananmen");
  t[7] = city("上海", "B", 220 * M, "東方明珠塔", "pearlTower");
  t[8] = { type: "island", name: "無人島" };
  t[9] = city("シドニー", "C", 240 * M, "オペラハウス", "operaHouse");
  t[10] = city("ドバイ", "C", 260 * M, "ブルジュ・ハリファ", "burjKhalifa");
  t[11] = city("カイロ", "C", 280 * M, "ピラミッド", "pyramid");
  t[12] = city("モスクワ", "D", 300 * M, "聖ワシリー大聖堂", "stBasil");
  t[13] = { type: "chance", name: "チャンス" };
  t[14] = city("ベルリン", "D", 320 * M, "ブランデンブルク門", "brandenburg");
  t[15] = city("ローマ", "D", 340 * M, "コロッセオ", "colosseum");
  t[16] = { type: "olympic", name: "オリンピック" };
  t[17] = city("マドリード", "E", 360 * M, "アルカラ門", "alcala");
  t[18] = city("パリ", "E", 380 * M, "エッフェル塔", "eiffel");
  t[19] = city("ロンドン", "E", 400 * M, "ビッグ・ベン", "bigBen");
  t[20] = city("トロント", "F", 420 * M, "CNタワー", "cnTower");
  t[21] = { type: "chance", name: "チャンス" };
  t[22] = city("シカゴ", "F", 440 * M, "ウィリス・タワー", "willis");
  t[23] = city("ニューヨーク", "F", 460 * M, "自由の女神", "liberty");
  t[24] = { type: "travel", name: "世界旅行" };
  t[25] = city("リオ", "G", 480 * M, "コルコバードの丘の巨像", "corcovado");
  t[26] = city("ロサンゼルス", "G", 500 * M, "グリフィス天文台", "griffith");
  t[27] = city("ハワイ", "G", 520 * M, "ダイヤモンドヘッド", "diamondHead");
  t[28] = city("京都", "H", 560 * M, "五重塔", "pagoda5");
  t[29] = { type: "tax", name: "税務署" };
  t[30] = city("大阪", "H", 600 * M, "大阪城", "osakaCastle");
  t[31] = city("東京", "H", 650 * M, "東京タワー", "tokyoTower");
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
  { art: "💰", title: "宝くじ大当たり！", desc: "賞金 800万 を受け取る", apply: async (p) => { gainMoney(p, 8000000); } },
  { art: "🧾", title: "スピード違反", desc: "罰金 300万 を支払う", apply: async (p) => { await payToBank(p, 3000000); } },
  { art: "🏁", title: "スタートへ進む", desc: "スタートに移動して給料を受け取る", apply: async (p) => { await teleport(p, 0, true); } },
  { art: "🏝️", title: "嵐に巻き込まれた！", desc: "無人島へ流される（2回休み）", apply: async (p) => { await teleport(p, 8, false); } },
  { art: "🎂", title: "誕生日パーティー", desc: "全員から 200万 ずつもらう", apply: async (p) => {
      for (const o of state.players) {
        if (o !== p && o.alive) await transfer(o, p, 2000000);
      }
    } },
  { art: "✈️", title: "緊急出張", desc: "好きなマスへ移動できる", apply: async (p) => { await doTravel(p); } },
  { art: "💼", title: "臨時ボーナス", desc: "給料日！600万 を受け取る", apply: async (p) => { gainMoney(p, SALARY); } },
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
  return Math.floor(tile.price * VALUE_RATE[tile.level]);
}

// 自分の土地を1段階増築する費用
function upgradeCost(tile) {
  return Math.floor(tile.price * OWN_UPGRADE_RATE[tile.level + 1]);
}

// 他人の土地を買収して1段階建て替える費用
function takeoverCost(tile) {
  return Math.floor(tile.price * TAKEOVER_RATE[tile.level + 1]);
}

// ランドマークの通過料（着地ではなく素通りでも発生）
function passToll(tile) {
  let toll = Math.floor(tile.price * PASS_RATE);
  const owner = state.players[tile.owner];
  if (ownsFullLine(owner, tile.group)) toll *= 2;
  if (state.olympicTile === state.tiles.indexOf(tile)) toll *= 2;
  return toll;
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
  SFX.coin();
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
  SFX.pay();
  if (paid >= 30000000) shakeScreen(); // 3000万以上の支払いは画面が揺れる
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
  SFX.bankrupt();
  shakeScreen(true);
  bigBanner(`💥 ${p.name} 破産…`, "banner-dark");
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
// top/side: 色、cls: 追加クラス（win=窓/round=丸み/glow=発光）、ox: 中心からの左右ずれ%
function lmBox(w, d, h, z, top, side, cls = "", ox = 0) {
  return `<div class="box ${cls}" style="--w:${w};--d:${d};--h:${h}px;--z:${z}px;--ct:${top};--cs:${side};--ox:${ox}%">` +
    `<i class="bf top"></i><i class="bf front"></i><i class="bf back"></i>` +
    `<i class="bf left"></i><i class="bf right"></i></div>`;
}

// 各都市のランドマーク3Dモデル（直方体の組み合わせによる抽象表現）
const LM_BUILDERS = {
  tower101: () => // 台北101：翡翠色の節を重ねたタワー
    lmBox("36%","30%",8,0,"#cfe8de","#3f8a7c") +
    lmBox("28%","23%",9,8,"#bfe3d8","#4e9d8e") + lmBox("26%","21%",9,17,"#bfe3d8","#4e9d8e","win") +
    lmBox("24%","19%",9,26,"#bfe3d8","#4e9d8e","win") + lmBox("22%","18%",9,35,"#bfe3d8","#4e9d8e","win") +
    lmBox("6%","5%",13,44,"#e8f4f0","#7ab8aa"),
  watArun: () => // ワット・アルン：砂金色の尖塔
    lmBox("50%","42%",8,0,"#e9d8a8","#bba15f") + lmBox("34%","28%",10,8,"#e3cf9b","#b3984f","win") +
    lmBox("22%","18%",12,18,"#e3cf9b","#b3984f") + lmBox("10%","8%",16,30,"#efe0b8","#c4aa66"),
  marinaBay: () => // マリーナベイサンズ：3本柱＋屋上の船
    lmBox("13%","26%",32,0,"#dfe7ee","#8fa6b8","win",-17) + lmBox("13%","26%",32,0,"#dfe7ee","#8fa6b8","win") +
    lmBox("13%","26%",32,0,"#dfe7ee","#8fa6b8","win",17) + lmBox("56%","27%",6,32,"#f3efe2","#c9c2ae","round"),
  seoulTower: () => // Nソウルタワー：丘の上の電波塔
    lmBox("42%","36%",10,0,"#7aa86e","#54804c","round") + lmBox("10%","9%",26,10,"#eceff2","#a8b2ba") +
    lmBox("20%","17%",8,36,"#dde3e8","#96a2ac","round") + lmBox("4%","4%",13,44,"#d8dde2","#8b969f"),
  tiananmen: () => // 天安門：朱色の楼門
    lmBox("60%","30%",14,0,"#b3382a","#8a2218","win") + lmBox("44%","24%",9,14,"#c44434","#962a1c") +
    lmBox("54%","30%",5,23,"#d9b34a","#a8852e"),
  pearlTower: () => // 東方明珠塔：球をもつタワー
    lmBox("30%","26%",8,0,"#b8b8c2","#84848e") + lmBox("23%","19%",12,8,"#d2699a","#a44070","round") +
    lmBox("8%","7%",16,20,"#c8c8d2","#90909a") + lmBox("14%","12%",9,36,"#d2699a","#a44070","round") +
    lmBox("4%","3.5%",12,45,"#c8c8d2","#90909a"),
  operaHouse: () => // オペラハウス：白い帆のシェル群
    lmBox("62%","42%",6,0,"#ece8de","#b8b2a2") + lmBox("16%","9%",20,6,"#f6f3ec","#c9c3b4","",-18) +
    lmBox("18%","9%",26,6,"#f6f3ec","#c9c3b4") + lmBox("16%","9%",17,6,"#f6f3ec","#c9c3b4","",18),
  burjKhalifa: () => // ブルジュ・ハリファ：世界一の超高層
    lmBox("34%","28%",10,0,"#dbe2e8","#9fadb8","win") + lmBox("26%","21%",14,10,"#dbe2e8","#9fadb8","win") +
    lmBox("18%","15%",16,24,"#dbe2e8","#9fadb8","win") + lmBox("11%","9%",16,40,"#e4eaef","#aab7c1","win") +
    lmBox("4.5%","4%",16,56,"#edf1f5","#b8c3cc"),
  pyramid: () => // ピラミッド：砂岩の階段状
    lmBox("64%","56%",9,0,"#ecd9a0","#cda965") + lmBox("50%","44%",9,9,"#e8d398","#c6a25e") +
    lmBox("36%","32%",9,18,"#e4cd90","#bf9b57") + lmBox("22%","20%",9,27,"#e0c788","#b89450") +
    lmBox("10%","9%",8,36,"#dcc180","#b18d49"),
  stBasil: () => // 聖ワシリー大聖堂：色とりどりの屋根
    lmBox("48%","38%",12,0,"#ece2cc","#c2b390") + lmBox("12%","10%",12,12,"#4a90d0","#2f6da6","round",-17) +
    lmBox("14%","12%",7,24,"#58b858","#3a8e3a","round",-17) + lmBox("16%","14%",16,12,"#e8e0d0","#bcb194","round") +
    lmBox("20%","17%",9,28,"#d04a85","#a82c60","round") + lmBox("5%","4.5%",9,37,"#e8c860","#b8983a") +
    lmBox("12%","10%",12,12,"#e8a13d","#bb7a22","round",17) + lmBox("14%","12%",7,24,"#d05050","#a83434","round",17),
  brandenburg: () => // ブランデンブルク門：列柱と凱旋像
    lmBox("11%","20%",20,0,"#dccfa8","#b3a578","",-21) + lmBox("11%","20%",20,0,"#dccfa8","#b3a578","",-7) +
    lmBox("11%","20%",20,0,"#dccfa8","#b3a578","",7) + lmBox("11%","20%",20,0,"#dccfa8","#b3a578","",21) +
    lmBox("60%","23%",8,20,"#d4c8a0","#aa9c72") + lmBox("16%","11%",8,28,"#8a9a6e","#647a4c"),
  colosseum: () => // コロッセオ：石造りの円形闘技場
    lmBox("62%","52%",14,0,"#dcc9a4","#b39a6e","win round") + lmBox("48%","40%",7,14,"#d4c098","#a89060","win round") +
    lmBox("34%","28%",4,14,"#c9b488","#9e8656","round"),
  alcala: () => // アルカラ門：石の門
    lmBox("12%","18%",18,0,"#dcd2bb","#b1a587","",-19) + lmBox("12%","18%",18,0,"#dcd2bb","#b1a587") +
    lmBox("12%","18%",18,0,"#dcd2bb","#b1a587","",19) + lmBox("56%","21%",7,18,"#d6cbb2","#aa9e80") +
    lmBox("18%","12%",7,25,"#cfc3a6","#a39674"),
  eiffel: () => // エッフェル塔：鉄格子の塔
    lmBox("50%","44%",12,0,"#a8845c","#6e5638","win") + lmBox("34%","30%",14,12,"#9d7a52","#665034","win") +
    lmBox("20%","18%",16,26,"#927048","#5e4930","win") + lmBox("10%","9%",16,42,"#876740","#56432c","win") +
    lmBox("4%","3.5%",10,58,"#7c5e3a","#4e3c28"),
  bigBen: () => // ビッグ・ベン：時計塔
    lmBox("20%","18%",32,0,"#d4bd84","#a8915c","win") + lmBox("25%","22%",8,32,"#f2e6c8","#c4b288") +
    lmBox("13%","11%",9,40,"#8a734a","#5e4d30") + lmBox("4.5%","4%",9,49,"#6e5a3a","#473a24"),
  cnTower: () => // CNタワー：展望ポッドの針
    lmBox("28%","24%",6,0,"#d4d9de","#9aa4ac") + lmBox("9%","8%",30,6,"#dde2e6","#a4aeb6") +
    lmBox("21%","17%",8,36,"#c8cfd5","#8e99a2","round") + lmBox("4.5%","4%",16,44,"#d4d9de","#9aa4ac"),
  willis: () => // ウィリス・タワー：高さの違う黒い束
    lmBox("15%","26%",26,0,"#4a505a","#22262e","win",-15) + lmBox("15%","26%",40,0,"#4a505a","#22262e","win") +
    lmBox("15%","26%",20,0,"#4a505a","#22262e","win",15) + lmBox("3.5%","3.5%",10,40,"#6a727e","#3a4048"),
  liberty: () => // 自由の女神：緑青の像と灯火
    lmBox("32%","28%",12,0,"#cdbb96","#a08c62") + lmBox("18%","15%",7,12,"#c2b08a","#947f56") +
    lmBox("12%","10%",19,19,"#6fb697","#447a60") + lmBox("6%","5%",11,38,"#6fb697","#447a60","",7) +
    lmBox("5%","4.5%",5,49,"#ffe9a8","#d9b95e","glow",7),
  corcovado: () => // コルコバードの丘の巨像：丘の上で腕を広げる
    lmBox("46%","38%",12,0,"#7e9c6a","#56714a") + lmBox("12%","10%",6,12,"#cfc8ba","#a39c8c") +
    lmBox("10%","8%",16,18,"#ece8dc","#bdb8a8") + lmBox("36%","7%",4,29,"#ece8dc","#bdb8a8") +
    lmBox("6%","5%",6,33,"#ece8dc","#bdb8a8"),
  griffith: () => // グリフィス天文台：白亜のドーム
    lmBox("52%","38%",10,0,"#ece6d6","#bcb49e") + lmBox("19%","16%",11,10,"#cdc6b4","#9d9580","round") +
    lmBox("12%","10%",7,10,"#cdc6b4","#9d9580","round",-19) + lmBox("12%","10%",7,10,"#cdc6b4","#9d9580","round",19),
  diamondHead: () => // ダイヤモンドヘッド：火山のカルデラ
    lmBox("66%","54%",10,0,"#8e9c5e","#647142") + lmBox("44%","38%",9,10,"#a3aa6a","#757c48") +
    lmBox("24%","20%",6,19,"#7c8850","#565f38"),
  pagoda5: () => // 五重塔：朱の五重屋根
    lmBox("22%","19%",8,0,"#e0d2b2","#b3a378") + lmBox("40%","34%",4,8,"#a83228","#7c2018") +
    lmBox("19%","16%",7,12,"#dccdaa","#ad9d72") + lmBox("34%","29%",4,19,"#a83228","#7c2018") +
    lmBox("16%","14%",7,23,"#d8c8a4","#a8976c") + lmBox("28%","24%",4,30,"#a83228","#7c2018") +
    lmBox("13%","11%",7,34,"#d4c39e","#a39266") + lmBox("22%","19%",4,41,"#a83228","#7c2018") +
    lmBox("4%","3.5%",10,45,"#e8c860","#b8983a"),
  osakaCastle: () => // 大阪城：石垣と白亜の天守
    lmBox("54%","44%",12,0,"#b4ac9c","#847c6c") + lmBox("34%","28%",12,12,"#f2f0e8","#c2c0b4","win") +
    lmBox("44%","36%",4,24,"#4e8a5a","#34603c") + lmBox("24%","20%",10,28,"#eeece4","#bebcb0","win") +
    lmBox("32%","26%",4,38,"#4e8a5a","#34603c") + lmBox("6%","5%",6,42,"#e8c860","#b8983a","glow"),
  tokyoTower: () => // 東京タワー：紅白の電波塔
    lmBox("48%","42%",12,0,"#ef5b40","#bb3520","win") + lmBox("32%","28%",14,12,"#ec4f34","#b32e1a","win") +
    lmBox("19%","17%",16,26,"#e84830","#a82a16","win") + lmBox("9%","8%",16,42,"#f0f0ee","#bcbcba") +
    lmBox("4%","3.5%",12,58,"#e84830","#a82a16"),
};

// 色を暗くする（壁面の陰影用）
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 255) * f);
  const g = Math.floor(((n >> 8) & 255) * f);
  const b = Math.floor((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

// レベル別の建物（1=別荘 / 2=ビル / 3=都市固有のランドマーク）
// 別荘の屋根とビルの屋上はオーナーのプレイヤーカラーに塗る
function buildingHTML(tile) {
  if (tile.level <= 0 || tile.owner === null) return "";
  const oc = state.players[tile.owner].color;
  let inner = "";
  if (tile.level === 1) {
    inner = lmBox("34%", "30%", 14, 0, "#f3e6c8", "#cdb88c") +
            lmBox("44%", "40%", 8, 14, oc, shade(oc, 0.68));
  } else if (tile.level === 2) {
    inner = lmBox("36%", "30%", 30, 0, "#b8cdd8", "#4f7fa6", "win") +
            lmBox("27%", "23%", 5, 30, oc, shade(oc, 0.68));
  } else {
    inner = (LM_BUILDERS[tile.lmKey] || LM_BUILDERS.tokyoTower)();
  }
  // 所有者の旗（全レベル共通・タイル手前の角に立てる）
  inner += lmBox("2.5%", "2.5%", 20, 0, "#e8e8e8", "#a8a8a8", "", -36) +
           lmBox("13%", "3%", 7, 13, oc, shade(oc, 0.75), "", -29);
  return `<div class="bld lv${tile.level}">${inner}</div>`;
}

// ---------- 演出 ----------
// 画面中央にドンと出るバナー
function bigBanner(text, cls = "") {
  if (!document.body) return;
  const el = document.createElement("div");
  el.className = `big-banner ${cls}`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

// 紙吹雪
function burst(x, y, count = 24) {
  if (!document.body) return;
  const colors = ["#ffd166", "#ef5b40", "#2e7fc2", "#27a05a", "#fff", "#d49a16"];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("i");
    el.className = "particle";
    const ang = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 110;
    el.style.cssText =
      `left:${x}px;top:${y}px;background:${colors[rand(colors.length)]};` +
      `--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist - 60}px;` +
      `--rot:${rand(720) - 360}deg;animation-duration:${0.7 + Math.random() * 0.5}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
}

function burstCenter(count = 30) {
  if (typeof window === "undefined") return;
  burst(window.innerWidth / 2, window.innerHeight / 2.4, count);
}

function burstAtTile(tileIdx, count = 20) {
  const el = $(`tile-${tileIdx}`);
  if (!el || !el.getBoundingClientRect) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, count);
}

// 画面シェイク
function shakeScreen(strong = false) {
  const el = $("game-screen");
  el.classList.remove("shake", "shake-strong");
  void el.offsetWidth;
  el.classList.add(strong ? "shake-strong" : "shake");
  setTimeout(() => el.classList.remove("shake", "shake-strong"), 500);
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
    if (tile.owner !== null) {
      // 所有マスはプレイヤーカラーに変色（上端にライン色の帯を残す）
      const owner = state.players[tile.owner];
      div.classList.add("owned");
      topStyle = `background:linear-gradient(180deg, ${owner.color}, ${owner.color} 55%, rgba(0,0,0,0.35))` +
        `;outline-color:rgba(255,255,255,0.75)`;
      inner += `<div class="gband" style="background:${GROUP_COLORS[tile.group]}"></div>`;
      inner += `<div class="tile-name">${tile.name}</div>`;
      inner += `<div class="tile-sub">${fmt(tollOf(tile))}</div>`;
      inner += `<div class="lv-flat">${LEVEL_ICONS[tile.level]}</div>`;
      building = buildingHTML(tile);
    } else {
      const c = GROUP_COLORS[tile.group];
      topStyle = `background:linear-gradient(180deg, ${c}, ${c} 55%, rgba(0,0,0,0.25))`;
      inner += `<div class="tile-name">${tile.name}</div>`;
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
  SFX.diceRoll();
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
  // 着地のポップ
  for (const id of ["die3d-1", "die3d-2"]) {
    const w = $(id);
    w.classList.remove("land");
    void w.offsetWidth;
    w.classList.add("land");
  }
  SFX.diceStop();
  await wait(480);
  return [a, b];
}

// 人間用：ボタンを長押しするとゲージが往復し、離した瞬間の位置で発射！
function waitForGaugeStop() {
  return new Promise((resolve) => {
    const btn = $("roll-btn");
    const wrap = $("gauge-wrap");
    const cursor = $("gauge-cursor");
    wrap.classList.remove("hidden");
    btn.classList.remove("hidden");
    btn.classList.add("pulse");
    btn.textContent = "長押しでチャージ → 離して発射！";
    cursor.style.left = "0%";
    let g = 0, dir = 1, timer = null, charging = false, tick = 0;

    const begin = (e) => {
      if (charging) return;
      charging = true;
      if (e && e.preventDefault) e.preventDefault();
      SFX.unlock();
      btn.classList.remove("pulse");
      btn.classList.add("charging");
      wrap.classList.add("charging");
      timer = setInterval(() => {
        g += dir * 0.038;
        if (g >= 1) { g = 1; dir = -1; }
        if (g <= 0) { g = 0; dir = 1; }
        cursor.style.left = `${g * 100}%`;
        if (++tick % 4 === 0) SFX.chargeTick(g);
      }, 16);
    };
    const release = () => {
      if (!charging) return;
      clearInterval(timer);
      btn.classList.remove("charging");
      wrap.classList.remove("charging");
      btn.classList.add("hidden");
      wrap.classList.add("hidden");
      btn.onpointerdown = null;
      if (typeof window !== "undefined") window.removeEventListener("pointerup", release);
      resolve(g);
    };
    btn.onpointerdown = begin;
    if (typeof window !== "undefined") window.addEventListener("pointerup", release);
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
    SFX.step();
    // ランドマークは通過するだけで通行料が発生（着地マスは除く＝着地料は別計算）
    const here = state.tiles[p.pos];
    if (s < steps - 1 && here.type === "city" && here.level === MAX_LEVEL &&
        here.owner !== null && here.owner !== p.id) {
      const owner = state.players[here.owner];
      const toll = Math.floor(passToll(here) * statOf(p, "tollPay") * statOf(owner, "tollGain"));
      centerMsg(`🗼 ${here.lm} を通過！通過料 ${fmt(toll)}`);
      log(`🗼 ${p.emoji} ${p.name} は ${owner.name} の ${here.lm} を通過（通過料 ${fmt(toll)}）`, true);
      await wait(500);
      await transfer(p, owner, toll);
      if (!p.alive) return;
    }
    await wait(160);
  }
  highlightTile(p.pos);
  // 着地マスのパルス
  const landed = $(`tile-${p.pos}`);
  landed.classList.add("landed");
  setTimeout(() => landed.classList.remove("landed"), 700);
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
      SFX.island();
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
      SFX.buy();
      burstAtTile(i, 10);
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
    const isLM = tile.level + 1 === MAX_LEVEL;
    const nextName = isLM ? `ランドマーク「${tile.lm}」` : LEVEL_NAMES[tile.level + 1];
    if (p.human) {
      up = await choose(
        `${tile.name} を増築しますか？`,
        `${LEVEL_ICONS[tile.level + 1]} <b>${nextName}</b> を建設：${fmt(cost)}<br>` +
          (isLM
            ? `🗼 以後だれにも買収されず、<b>通過するだけ</b>で ${fmt(Math.floor(tile.price * PASS_RATE))} を徴収！`
            : `通行料が ${fmt(Math.floor(tile.price * TOLL_RATE[tile.level + 1]))} にアップ`),
        [
          { label: "増築する", value: true },
          { label: "やめる", value: false, secondary: true },
        ]
      );
    } else {
      up = p.money - cost > 20000000;
      await wait(500);
    }
    if (up) {
      p.money -= cost;
      tile.level++;
      if (isLM) {
        SFX.landmark();
        bigBanner(`🗼 ${tile.lm} 完成！`, "banner-gold");
        burstAtTile(i, 28);
      } else {
        SFX.buy();
        burstAtTile(i, 10);
      }
      centerMsg(isLM ? `🗼 ${tile.name} に ${tile.lm} が完成！` : `${tile.name} に ${nextName} が建った！`);
      log(`${p.emoji} ${p.name} が ${tile.name} に ${nextName} を建設${isLM ? "！もう誰にも奪えない！" : ""}`, isLM);
      renderTile(i);
    }
  } else {
    // --- 通行料 → 買収（奪って1段階建て替え） ---
    const owner = state.players[tile.owner];
    // キャラ能力（支払い割引・受取アップ）を反映
    const toll = Math.floor(tollOf(tile) * statOf(p, "tollPay") * statOf(owner, "tollGain"));
    centerMsg(`${owner.name} の ${tile.name}！通行料 ${fmt(toll)}`);
    log(`${p.emoji} ${p.name} は ${owner.name} の ${tile.name} に到着（通行料 ${fmt(toll)}）`);
    await wait(600);
    await transfer(p, owner, toll);
    if (!p.alive) return;

    // ランドマークは買収不可。それ以外は「買収＋1段階建て替え」ができる
    if (tile.level < MAX_LEVEL) {
      const cost = Math.floor(takeoverCost(tile) * statOf(p, "buyRate"));
      if (p.money >= cost) {
        const isLM = tile.level + 1 === MAX_LEVEL;
        const nextName = isLM ? `ランドマーク「${tile.lm}」` : LEVEL_NAMES[tile.level + 1];
        let take;
        if (p.human) {
          take = await choose(
            `${tile.name} を買収しますか？`,
            `${owner.emoji} ${owner.name} から <b>${fmt(cost)}</b> で土地を奪い、` +
              `${LEVEL_ICONS[tile.level + 1]} <b>${nextName}</b> に建て替えます<br>` +
              (isLM ? "🗼 ランドマーク化すれば、もう誰にも買収されません！" : ""),
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
          tile.level++;
          SFX.takeover();
          shakeScreen();
          if (tile.level === MAX_LEVEL) {
            SFX.landmark();
            bigBanner(`🗼 ${tile.lm} 完成！`, "banner-gold");
            burstAtTile(i, 28);
          } else {
            burstAtTile(i, 14);
          }
          centerMsg(`💥 ${p.name} が ${tile.name} を買収して ${nextName} に建て替えた！`);
          log(`💥 ${p.emoji} ${p.name} が ${owner.name} から ${tile.name} を ${fmt(cost)} で買収し ${nextName} を建設！`, true);
          if (ownsFullLine(p, tile.group)) log(`🎉 ${p.name} が ${tile.name} のラインを独占！`, true);
          renderTile(i);
          renderPlayers();
        }
      }
    }
  }
}

async function resolveChance(p) {
  const card = CHANCE_CARDS[rand(CHANCE_CARDS.length)];
  SFX.chance();
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
  const reserve = state.round < 10 ? 12000000 : 20000000; // 序盤1200万/終盤2000万を残す
  if (p.money - tile.price < reserve) return false;
  return true;
}

function cpuWantsToAcquire(p, tile, cost) {
  if (p.money - cost < 20000000) return false;
  // ライン完成するなら積極的に
  const group = state.tiles.filter((t) => t.type === "city" && t.group === tile.group);
  const ownedByMe = group.filter((t) => t.owner === p.id).length;
  if (ownedByMe === group.length - 1) return true;
  // ランドマーク化（=もう奪われない）も価値が高い
  if (tile.level + 1 === MAX_LEVEL && p.money - cost > 30000000) return true;
  return cost < p.money * 0.35;
}

function cpuTravelDest(p) {
  // 1) 買える最高額の空き都市 2) 増築できる自都市 3) スタート
  const buyable = state.tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.type === "city" && t.owner === null && p.money - t.price > 12000000)
    .sort((a, b) => b.t.price - a.t.price);
  if (buyable.length) return buyable[0].i;
  const upgradable = state.tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.type === "city" && t.owner === p.id && t.level < MAX_LEVEL && p.money - upgradeCost(t) > 15000000)
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
      if (a === b) {
        SFX.double();
        bigBanner("⚡ ゾロ目！脱出成功！", "banner-double");
        burstCenter();
      }
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
    if (isDouble) {
      doubleCount++;
      SFX.double();
      bigBanner("⚡ ゾロ目！！", "banner-double");
      burstCenter();
    }

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
  SFX.win();
  bigBanner(`🏆 ${winner.name} の勝利！`, "banner-gold");
  burstCenter(40);
  setTimeout(() => burstCenter(30), 400);
  setTimeout(() => burstCenter(30), 800);
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

  $("start-btn").onclick = () => {
    SFX.unlock();
    startGame();
  };

  // すべてのボタンにクリック音
  if (typeof document.addEventListener === "function") {
    document.addEventListener("click", (e) => {
      if (e.target && e.target.tagName === "BUTTON") SFX.click();
    });
  }
}

function startGame() {
  state.tiles = buildTiles();
  // 白文字が読みやすい深めのプレイヤーカラー（所有マスがこの色に染まる）
  const colorHex = ["#d8453a", "#2e7fc2", "#d49a16", "#27a05a"];

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
