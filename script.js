// =========================================================
//  QUICK NAVIGATION MAP
// Jump instantly using Cmd + F (search keywords below)
//
//  [STATE] → Game data (cash, items, products, UI)
//  [CONSTANTS] → Prices, limits, timings
//  [DOM] → HTML element hooks
//  [RUNTIME] → Temporary UI states (popups, timers)
//
//  [POPUP] → All popup systems (feedback, alerts)
//  [LOGIC] → Core logic (stock, button states, calculations)
//  [PRODUCTION] → Queue → production → stock
//
//  [RENDER] → UI generation (inventory, recipes, panels)
//  [CUSTOMER] → Spawn, serve, behavior, tips
//
//  [EVENT] → User actions (click handling)
//  [UI] → Dragging panels, UI interactions
//
//  [INIT] → Game start + loops
// =========================================================

// =========================================================
//  GAME STATE
// All dynamic data lives here (money, stock, customers, UI)
// =========================================================
const state = {
  // starting cash
  cash: 100,

  // expenses tracking (for info panel)
  expenses: {
    ingredients: 0,
    waste: 0,
  },

  // for qty in recipes (autobuy)
  items: {
    milk: 0,
    beans: 0,
    matcha: 0,
  },

  // ingredients
  ingredients: {
    milk: { level: 1 },
    beans: { level: 1 },
    matcha: { level: 1 },
  },

  // products
  products: {
    coffee: {
      stock: [],
      productionQueue: [],
    },
    matchaLatte: {
      stock: [],
      productionQueue: [],
    },
  },

  // customers (current and past for tracking)
  customer: {
    list: [],
  },

  // panel states, active views, temporary UI data
  ui: {
    activeTab: "inventory",
    activeInfoView: "cash",
    purchaseQty: { milk: 0, beans: 0, matcha: 0 },
    mode: "menu",
    showCustomerPopup: false,
    tutorial: {
      active: false,
      stepIndex: 0,
      completed: false,
      scriptedCustomerSpawned: false,
      previousCustomerSettings: null,
      servedCountAtStart: 0,
    },

    panels: {
      customers: true,
      kitchen: true,
    },
  },
  // builder panel (dev mode)
  builder: {
    enabled: false, // toggle panel visibility
    spawnRate: 5000,
    productionTime: 8000,
    maxQueue: null, // optional override
  },

  // current recipe quantities (how many servings to make per product)
  recipes: {
    coffee: { qty: 0 },
    matchaLatte: { qty: 0 },
  },

  // ⚙️ EQUIPMENT SYSTEM [KITCHEN]
  kitchen: {
    machine: {
      level: 1,
      speedMultiplier: 1, // faster production
      capacity: 2, // max batches in production
    },
    fridge: {
      level: 1,
      freshnessMultiplier: 1,
    },
  },

  // reputation reviews (customer feedback for flavor, freshness, service)
  reputation: {
    score: 50,
    level: "Neutral",
    reviews: [], //
  },

  // ai memory history (for simulation analysis, not core game data)
  ai: {
    history: [],
  },
};

// ======================
// CONSTANTS (fixed values)
// ======================
const PRICES = { milk: 8, beans: 11, matcha: 14 };
const SERVINGS_PER_BATCH = 3;
const COFFEE_PRODUCTION_TIME_MS = 8000;
const MATCHA_LATTE_PRODUCTION_TIME_MS = 15000;
const MAX_PRODUCTION_QUEUE = 2;
let SERVE_PRICE = 5;
const MAX_STOCK = 12;
const SPOIL_TIME = 20000; // 20 seconds
const TUTORIAL_CUSTOMER_DURATION = 60000;

// upgrade cost function (used for both machine speed and fridge freshness upgrades)
function getUpgradeCost(base, level) {
  return Math.floor(base * Math.pow(1.25, level - 1));
}

// customer definitions (name, order, dialogue, price, etc.)
const CUSTOMERS = [
  {
    name: "Jack",
    order: "coffee",
    label: "coffee",
    dialogue: "A cup of coffee, please!",
    thankYou: "Thanks, that smells amazing!",
    angry: "Hey! I've been waiting forever...",
    price: 5,
  },
  {
    name: "Evie",
    order: "matchaLatte",
    label: "matcha latte",
    dialogue: "Uhh...can I like get a matcha latte?",
    thankYou: "Yay thanks! This looks so good 💚",
    angry: "Umm… hello?? I’ve been waiting 😒",
    price: 5,
  },
];

const TUTORIAL_STEPS = [
  {
    id: "welcome",
    title: "Welcome to Your Shop",
    body: "Let's make one coffee, serve one customer, and watch the shop numbers move. We'll go slowly.",
    target: "main",
    helper: "Press Next when you're ready.",
  },
  {
    id: "status",
    title: "Read the Counter",
    body: "This top row tracks cash, ready servings, expenses, and reputation. These are your core business signals.",
    target: "status",
    helper: "Press Next to start making a drink.",
  },
  {
    id: "recipes",
    title: "Open Recipes",
    body: "Recipes are where you queue drinks for production. Open the Recipes tab.",
    target: "recipes-tab",
    helper: "Click Recipes.",
  },
  {
    id: "quantity",
    title: "Choose a Coffee Batch",
    body: "Increase Coffee quantity to make one batch. The game will buy missing ingredients when you make it.",
    target: "coffee-qty",
    helper: "Click the + button on Coffee.",
  },
  {
    id: "make",
    title: "Start Production",
    body: "Now make the coffee. Cash will drop because milk and beans are purchased automatically.",
    target: "coffee-actions",
    helper: "Click Make on Coffee.",
  },
  {
    id: "production",
    title: "Wait for the Machine",
    body: "The production bar counts down while the coffee brews. When it finishes, servings move into stock.",
    target: "coffee-production",
    helper: "Wait until Coffee shows ready stock.",
  },
  {
    id: "customer",
    title: "A Customer Arrives",
    body: "Great. We'll bring in one slow coffee customer so you can serve without pressure.",
    target: "customers",
    helper: "Press Next once the customer appears.",
  },
  {
    id: "serve",
    title: "Serve the Coffee",
    body: "Serve the waiting customer. Fresh drinks can earn a tip and improve reputation.",
    target: "serve",
    helper: "Click Serve in the Customers panel.",
  },
  {
    id: "results",
    title: "Check the Result",
    body: "Cash and reputation update after service. Info panels can explain revenue, servings, expenses, and reviews.",
    target: "status",
    helper: "Press Next to finish the tutorial.",
  },
  {
    id: "finish",
    title: "You're Open",
    body: "That's the main loop: make drinks, watch freshness, serve customers, and upgrade when you can.",
    target: "main",
    helper: "Finish returns the shop to normal customer flow.",
  },
];

// =========================================================
// 🔗 DOM REFERENCES
// Connect JS → HTML elements
// If UI breaks, check here first
// =========================================================
const mainBodyEl = document.getElementById("mainBody");
const infoBodyEl = document.getElementById("infoBody");
const mainPanelEl = document.getElementById("mainPanel");
const infoPanelEl = document.getElementById("infoPanel");
const customerBodyEl = document.getElementById("customerBody");
const customerPanelEl = document.getElementById("customerPanel");
const kitchenPanelEl = document.getElementById("kitchenPanel");
const builderPanelEl = document.getElementById("builderPanel");
const builderBodyEl = document.getElementById("builderBody");

// =========================================================
// RUNTIME VARIABLES
// Temporary UI/system states (popups, timers, flags)
// Not part of core game data
// =========================================================
let quickInfoPopupEl = null;
let quickInfoCloseTimeoutId = null;
let purchaseBlockedPopupEl = null;
let purchaseBlockedTimeoutId = null;
let customerPopupActive = false;

// popup state
function removeQuickInfoPopup() {
  if (quickInfoCloseTimeoutId !== null) {
    clearTimeout(quickInfoCloseTimeoutId);
    quickInfoCloseTimeoutId = null;
  }
  if (quickInfoPopupEl) {
    quickInfoPopupEl.remove();
    quickInfoPopupEl = null;
  }
}

// =========================================================
// 💬 POPUP SYSTEM (Feedback Engine)
// Handles all temporary UI feedback (info, errors, success)
// =========================================================

// remove quick info popup
function showQuickInfoPopup(product = "coffee") {
  removeQuickInfoPopup();

  const ingredients =
    product === "matchaLatte" ? "Milk + Matcha" : "Milk + Coffee Beans";

  quickInfoPopupEl = document.createElement("div");
  quickInfoPopupEl.className = "game-popup quick-info-popup";
  quickInfoPopupEl.innerHTML = `<div>Ingredients:</div><div>${ingredients}</div><div class="popup-bar-container"><div class="popup-bar"></div></div>`;

  document.body.appendChild(quickInfoPopupEl);

  // show recipe info popup
  const bar = quickInfoPopupEl.querySelector(".popup-bar");
  if (bar) {
    bar.style.transitionDuration = "5s";
    setTimeout(() => (bar.style.width = "0%"), 0);
  }

  quickInfoCloseTimeoutId = setTimeout(removeQuickInfoPopup, 5000);
}

// purchase block popup
function removepurchaseBlockedPopup() {
  if (purchaseBlockedTimeoutId !== null) {
    clearTimeout(purchaseBlockedTimeoutId);
    purchaseBlockedTimeoutId = null;
  }
  if (purchaseBlockedPopupEl) {
    purchaseBlockedPopupEl.remove();
    purchaseBlockedPopupEl = null;
  }
}

function showpurchaseBlockedPopup(product = "coffee") {
  removepurchaseBlockedPopup();

  const needText =
    product === "matchaLatte" ? "(need milk + matcha)" : "(need milk + beans)";

  purchaseBlockedPopupEl = document.createElement("div");
  purchaseBlockedPopupEl.className = "game-popup blocked-popup";
  purchaseBlockedPopupEl.innerHTML = `<div>Not enough money to purchase</div><div>${needText}</div><div class="popup-bar-container"><div class="popup-bar"></div></div>`;

  document.body.appendChild(purchaseBlockedPopupEl);

  const bar = purchaseBlockedPopupEl.querySelector(".popup-bar");
  if (bar) {
    bar.style.transitionDuration = "5s";
    setTimeout(() => (bar.style.width = "0%"), 0);
  }

  purchaseBlockedTimeoutId = setTimeout(removepurchaseBlockedPopup, 5000);
}

// popup for purchases

let purchasedPopupEl = null;
let purchasedTimeoutId = null;

function removePurchasedPopup() {
  if (purchasedTimeoutId !== null) {
    clearTimeout(purchasedTimeoutId);
    purchasedTimeoutId = null;
  }
  if (purchasedPopupEl) {
    purchasedPopupEl.remove();
    purchasedPopupEl = null;
  }
}

function showPurchasedPopup() {
  removePurchasedPopup();

  purchasedPopupEl = document.createElement("div");
  purchasedPopupEl.className = "game-popup purchased-popup";

  purchasedPopupEl.innerHTML = `
    <div>Purchased!</div>
    <div class="popup-bar-container"><div class="popup-bar"></div></div>
  `;

  document.body.appendChild(purchasedPopupEl);

  const bar = purchasedPopupEl.querySelector(".popup-bar");
  if (bar) {
    bar.style.transitionDuration = "2s";
    setTimeout(() => (bar.style.width = "0%"), 0);
  }

  purchasedTimeoutId = setTimeout(removePurchasedPopup, 2000);
}

// new customer pop up
function showCustomerPopup() {
  if (!state.ui.showCustomerPopup) return; // DISABLE SWITCH

  if (customerPopupActive) return;

  customerPopupActive = true;

  const el = document.createElement("div");
  el.className = "game-popup customer-popup";
  el.innerText = "New Customer Request";

  document.body.appendChild(el);

  setTimeout(() => {
    el.remove();
    customerPopupActive = false;
  }, 2000);
}

// serve popup
function showServePopup(amount) {
  const el = document.createElement("div");
  el.className = "game-popup serve-popup";
  el.innerText = `+ $${amount}`;

  document.body.appendChild(el);

  setTimeout(() => el.remove(), 1000);
}

// production block popup
function showProductionLimitPopup() {
  removepurchaseBlockedPopup();

  purchaseBlockedPopupEl = document.createElement("div");
  purchaseBlockedPopupEl.className = "game-popup limit-popup";

  purchaseBlockedPopupEl.innerHTML = `
    <div>You can only make 2 batches in production</div>
    <div class="popup-bar-container"><div class="popup-bar"></div></div>
  `;

  document.body.appendChild(purchaseBlockedPopupEl);

  const bar = purchaseBlockedPopupEl.querySelector(".popup-bar");
  if (bar) {
    bar.style.transitionDuration = "3s";
    setTimeout(() => (bar.style.width = "0%"), 0);
  }

  purchaseBlockedTimeoutId = setTimeout(removepurchaseBlockedPopup, 3000);
}

// =========================================================
// HELPER LOGIC
// Pure logic (no UI)
// Determines outcomes, states, calculations
// =========================================================

// average wait time for customers (used for insights and customer behavior)
function getAverageWaitTime() {
  const customers = state.customer.list;
  if (!customers.length) return 0;

  const total = customers.reduce((sum, c) => {
    return sum + (Date.now() - c.startTime);
  }, 0);

  return total / customers.length;
}

// action labels for insights
const ACTION_LABELS = {
  restock_milk: "Restock milk",
  restock_beans: "Restock coffee beans",
  restock_matcha: "Restock matcha",
  recover_output_production_line: "Start producing drinks",
  scale_queue_customers: "Increase queue capacity",
  optimize_queue_customers: "Improve customer flow",
};

// run simulation analysis and generate insights
function runSimulation() {
  const data = {
    products: {
      coffee: {
        stock: state.products.coffee.stock.length,
        queue: state.products.coffee.productionQueue.length,
      },
      matchaLatte: {
        stock: state.products.matchaLatte.stock.length,
        queue: state.products.matchaLatte.productionQueue.length,
      },
    },
    queue: {
      length: state.customer.list.length,
      capacity: state.builder.maxQueue || 5,
      avgWait: getAverageWaitTime(),
      maxWait: 20000,
    },
    production: {
      output:
        state.products.coffee.stock.length +
        state.products.matchaLatte.stock.length,
      targetOutput: 10,
    },
    pricing: {
      coffee: {
        cost: PRICES.milk + PRICES.beans,
        price: SERVE_PRICE,
        avgTip: 2,
      },
      matchaLatte: {
        cost: PRICES.milk + PRICES.matcha,
        price: SERVE_PRICE,
        avgTip: 2,
      },
    },
    history: state.ai.history,
  };

  const result = window.simulationEngine.analyzeSimulation(data);

  const totalStock =
    (data.products?.coffee?.stock || 0) +
    (data.products?.matchaLatte?.stock || 0);

  state.ai.history.push({
    time: Date.now(),
    stock: totalStock,
    queue: data.queue.length,
  });

  // keep only last 5 (prevent memory bloat)
  state.ai.history = state.ai.history.slice(-5);

  console.log(result);

  showSimulationResult(result);
}

// show simulation result
function showSimulationResult(result) {
  const topActionKey = result.topAction?.action;
  const topActionLabel = ACTION_LABELS[topActionKey] || topActionKey || "None";

  // OPEN INFO PANEL
  state.ui.activeInfoView = "simulation";
  infoPanelEl.classList.remove("hidden");

  // RENDER CONTENT
  infoBodyEl.innerHTML = `
    <div class="summary-line"><strong class="summary-title">AI Insights</strong></div>

    <div class="summary-line">
      <strong>Top Action:</strong> ${topActionLabel}
    </div>

    <div class="summary-gap"></div>

    ${result.insights
      .slice(0, 3)
      .map((i) => `<div class="summary-line">• ${i.message}</div>`)
      .join("")}
  `;
}

// production time calculation (base time modified by machine speed and builder override)
function getProductionTime(product) {
  const baseTime =
    product === "matchaLatte"
      ? MATCHA_LATTE_PRODUCTION_TIME_MS
      : COFFEE_PRODUCTION_TIME_MS;

  return state.builder?.productionTime ?? baseTime;
}

// day night cycle toggle (for fun visual effect, no gameplay impact)
function toggleDayNight() {
  document.body.classList.toggle("night");
}

// update reputation level based on score
function updateReputation() {
  const r = state.reputation;

  r.score = Math.max(0, Math.min(100, r.score));

  if (r.score > 80) r.level = "Excellent";
  else if (r.score > 60) r.level = "Good";
  else if (r.score > 40) r.level = "Neutral";
  else if (r.score > 20) r.level = "Bad";
  else r.level = "Terrible";
}

// reset game state (used for restarting game)
function resetGameState() {
  state.cash = 100;

  state.products.coffee.stock = [];
  state.products.matchaLatte.stock = [];
  state.products.coffee.productionQueue = [];
  state.products.matchaLatte.productionQueue = [];
  state.products.coffee.totalServed = 0;
  state.products.matchaLatte.totalServed = 0;
  state.recipes.coffee.qty = 0;
  state.recipes.matchaLatte.qty = 0;
  state.items.milk = 0;
  state.items.beans = 0;
  state.items.matcha = 0;
  state.expenses.ingredients = 0;
  state.expenses.waste = 0;

  state.customer.list = [];

  state.reputation = {
    score: 50,
    level: "Neutral",
    reviews: [],
  };

  resetTutorialState();
}

// reset info panel to closed state (used when exiting to menu)
function resetUIForMenu() {
  infoPanelEl.classList.add("hidden");
  state.ui.activeInfoView = "cash";
}

function resetTutorialState() {
  state.ui.tutorial.active = false;
  state.ui.tutorial.stepIndex = 0;
  state.ui.tutorial.completed = false;
  state.ui.tutorial.scriptedCustomerSpawned = false;
  state.ui.tutorial.previousCustomerSettings = null;
  state.ui.tutorial.servedCountAtStart = 0;
}

function getTutorialStep() {
  return TUTORIAL_STEPS[state.ui.tutorial.stepIndex] || TUTORIAL_STEPS[0];
}

function getTutorialTargetClass(target) {
  if (!state.ui.tutorial.active) return "";
  return getTutorialStep().target === target ? " tutorial-target-active" : "";
}

function isTutorialStepComplete(step = getTutorialStep()) {
  if (!state.ui.tutorial.active) return false;

  switch (step.id) {
    case "recipes":
      return state.ui.activeTab === "recipes";
    case "quantity":
      return state.recipes.coffee.qty > 0;
    case "make":
      return state.products.coffee.productionQueue.length > 0;
    case "production":
      return state.products.coffee.stock.length > 0;
    case "customer":
      return state.customer.list.some((customer) => customer.tutorial);
    case "serve":
      return (
        (state.products.coffee.totalServed || 0) >
        state.ui.tutorial.servedCountAtStart
      );
    default:
      return true;
  }
}

function startTutorial() {
  resetGameState();

  state.ui.mode = "game";
  state.ui.paused = false;
  state.ui.activeTab = "inventory";
  state.ui.activeInfoView = "cash";
  state.ui.panels.customers = true;
  state.ui.panels.kitchen = true;
  state.ui.tutorial.active = true;
  state.ui.tutorial.stepIndex = 0;
  state.ui.tutorial.completed = false;
  state.ui.tutorial.scriptedCustomerSpawned = false;
  state.ui.tutorial.previousCustomerSettings = {
    spawnRate: state.builder.spawnRate,
  };
  state.ui.tutorial.servedCountAtStart = state.products.coffee.totalServed || 0;

  customerPanelEl.classList.remove("hidden");
  kitchenPanelEl.classList.remove("hidden");
  render();
}

function finishTutorial({ skipped = false } = {}) {
  const previousSettings = state.ui.tutorial.previousCustomerSettings;
  if (previousSettings) {
    state.builder.spawnRate = previousSettings.spawnRate;
  }

  state.ui.tutorial.active = false;
  state.ui.tutorial.completed = !skipped;
  state.ui.tutorial.stepIndex = 0;
  state.ui.tutorial.scriptedCustomerSpawned = false;
  state.ui.tutorial.previousCustomerSettings = null;
  state.ui.tutorial.servedCountAtStart = 0;
  render();
}

function setTutorialStep(index) {
  const maxIndex = TUTORIAL_STEPS.length - 1;
  state.ui.tutorial.stepIndex = Math.max(0, Math.min(maxIndex, index));
  runTutorialStepEffects();
  render();
}

function advanceTutorialIfComplete() {
  if (!state.ui.tutorial.active) return;
  if (!isTutorialStepComplete()) return;

  const nextIndex = state.ui.tutorial.stepIndex + 1;
  if (nextIndex >= TUTORIAL_STEPS.length) {
    finishTutorial();
    return;
  }

  setTutorialStep(nextIndex);
}

function runTutorialStepEffects() {
  if (!state.ui.tutorial.active) return;

  const step = getTutorialStep();
  if (step.id === "customer" && !state.ui.tutorial.scriptedCustomerSpawned) {
    spawnTutorialCustomer();
  }
}

function spawnTutorialCustomer() {
  if (state.ui.tutorial.scriptedCustomerSpawned) return;
  if (state.products.coffee.stock.length <= 0) return;

  const base = CUSTOMERS.find((customer) => customer.order === "coffee");
  if (!base) return;

  state.customer.list = state.customer.list.filter(
    (customer) => customer.tutorial,
  );

  state.customer.list.push({
    ...base,
    duration: TUTORIAL_CUSTOMER_DURATION,
    startTime: Date.now(),
    phase: "ordering",
    maxTip: 5,
    tutorial: true,
  });

  state.ui.tutorial.scriptedCustomerSpawned = true;
}

function renderTutorialOverlay() {
  if (!state.ui.tutorial.active) return "";

  const step = getTutorialStep();
  const isComplete = isTutorialStepComplete(step);
  const isFirstStep = state.ui.tutorial.stepIndex === 0;
  const isLastStep = state.ui.tutorial.stepIndex === TUTORIAL_STEPS.length - 1;
  const progress = `${state.ui.tutorial.stepIndex + 1}/${TUTORIAL_STEPS.length}`;

  return `
    <div class="tutorial-overlay" aria-live="polite">
      <div class="tutorial-scrim" aria-hidden="true"></div>
      <div class="tutorial-card">
        <div class="tutorial-progress">Step ${progress}</div>
        <h3>${step.title}</h3>
        <p>${step.body}</p>
        <div class="tutorial-helper">${isComplete ? "Nice. You can continue." : step.helper}</div>
        <div class="tutorial-actions">
          <button data-action="tutorial-back" ${isFirstStep ? "disabled" : ""}>Back</button>
          <button data-action="tutorial-skip">Skip</button>
          <button class="btn-green" data-action="tutorial-next" ${isComplete ? "" : "disabled"}>
            ${isLastStep ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  `;
}

function syncTutorialTargetClasses() {
  [mainPanelEl, customerPanelEl, kitchenPanelEl, infoPanelEl].forEach((panel) => {
    panel.classList.remove("tutorial-target-active");
  });

  if (!state.ui.tutorial.active) return;

  const target = getTutorialStep().target;
  if (target === "main") {
    mainPanelEl.classList.add("tutorial-target-active");
  }
  if (target === "customers" || target === "serve") {
    customerPanelEl.classList.add("tutorial-target-active");
  }
}

// determines make button state based on ingredients and cash
function getMakeButtonState(product) {
  const qty = state.recipes[product].qty;

  if (qty <= 0) return "disabled"; // no qty → no action
  return "green"; // any qty → ready to make
}

// returns UI status based on stock level
function stockMeta(stock) {
  if (stock === 0)
    return {
      rowClass: "stock-zero",
      statusClass: "zero",
      status: "86",
    };
  if (stock <= 3)
    return { rowClass: "stock-low", statusClass: "low", status: "Low Stock" };
  return { rowClass: "", statusClass: "", status: "" };
}

// updates customer progress bars
function updateCustomerProgressBar() {
  const customers = state.customer.list;
  if (!customers.length) return;

  customers.forEach((customer) => {
    const bar = document.querySelector(
      `[data-progress-id="${customer.startTime}"]`,
    );
    if (!bar) return;

    const elapsed = Date.now() - customer.startTime;
    const progress = Math.max(0, 1 - elapsed / customer.duration);

    bar.style.width = `${progress * 100}%`;
    bar.style.background =
      progress > 0.6
        ? "var(--progress-good)"
        : progress > 0.3
          ? "var(--progress-warn)"
          : "var(--progress-bad)";
  });
}

// determines stock state based on age for finished products
function getStockState(item) {
  if (state.ui.tutorial.active) return "fresh";

  const age = Date.now() - item.createdAt;
  const ingredientBoost = state.ingredients.milk.level * 0.05;

  const freshness =
    state.kitchen.fridge.freshnessMultiplier * (1 + ingredientBoost);
  const ratio = age / (SPOIL_TIME * freshness);

  if (ratio < 0.5) return "fresh";
  if (ratio < 0.8) return "warning";
  return "spoiled";
}

// returns tip amount and quality multiplier based on stock state
function getStockModifier(item) {
  const state = getStockState(item);

  if (state === "fresh") return { tip: 2, multiplier: 1 };
  if (state === "warning") return { tip: 1, multiplier: 1 };
  return { tip: 0, multiplier: 0 }; // spoiled
}

// process production queues for products and move to stock when done
function processProductionQueue() {
  Object.keys(state.products).forEach((key) => {
    const product = state.products[key];
    if (!product.productionQueue) return;

    const now = Date.now();

    product.productionQueue = product.productionQueue.filter((batch) => {
      if (now >= batch.endTime) {
        for (let i = 0; i < batch.qty * SERVINGS_PER_BATCH; i++) {
          if (product.stock.length >= MAX_STOCK) break;
          product.stock.push({ createdAt: Date.now() });
        }
        return false; // remove batch
      }
      return true;
    });
  });
}

// =========================================================
// RENDER SYSTEM (UI Builder)
// Converts state → HTML
// If UI looks wrong, problem is here
// =========================================================

// render builder panel (dev tools for testing, not part of core game)
function renderBuilderPanel() {
  if (!state.builder.enabled) return "";

  const b = state.builder;

  return `
    <div class="builder-panel">
      <strong>Builder Panel</strong>

      <div class="builder-toggle-row">
        <label>
          Customers
          <input 
            type="checkbox" 
            data-action="toggle-customers"
              ${state.ui.panels.customers ? "checked" : ""}
          />
        </label>

        <label>
          Kitchen
          <input 
            type="checkbox" 
            data-action="toggle-kitchen"
            ${state.ui.panels.kitchen ? "checked" : ""}
          />
        </label>
      </div>

      <hr/>

      <div class="builder-grid">
      <div class="builder-field">
        <label>Coffee Price</label>
        <input type="number" value="${SERVE_PRICE}" data-action="set-coffee-price"/>
      </div>

      <div class="builder-field">
        <label>Milk Price</label>
        <input type="number" value="${PRICES.milk}" data-action="set-milk-price"/>
      </div>

      <div class="builder-field">
        <label>Production Time (ms)</label>
        <input type="number" value="${b.productionTime}" data-action="set-production-time"/>
      </div>

      <div class="builder-field">
        <label>Max Queue</label>
        <input type="number" value="${state.kitchen.machine.capacity}" data-action="set-max-queue"/>
      </div>

      <div class="builder-field">
        <label>Spawn Rate (ms)</label>
        <input type="number" value="${b.spawnRate}" data-action="set-spawn-rate"/>
      </div>
      </div>

      <hr/>

      <button onclick="runSimulation()">Run Analysis</button>

    </div>
  `;
}

// inventory table
function renderInventoryContent() {
  const items = [
    { key: "milk", label: "Milk" },
    { key: "beans", label: "Coffee Beans" },
    { key: "matcha", label: "Matcha" },
  ];

  // table header (ingredient, level, quality, cost, upgrade button)
  return `
    <div class="table-head inventory">
      <div>Ingredient</div>
      <div>Level</div>
      <div>Quality</div>
      <div>Cost</div>
      <div>Upgrade</div>
    </div>

    ${items
      .map(({ key, label }) => {
        const lvl = state.ingredients[key].level;
        const quality = (lvl - 1) * 10;
        const cost = lvl * 20;

        return `
        <div class="row inventory">
          <div class="product-cell"><span class="product-title">${label}</span></div>
          <div><strong>Lv ${lvl}</strong></div>
          <div class="cell-note">+${quality}% quality</div>
          <div class="serve-price">$${cost}</div>
          <div>
            <button 
              data-action="upgrade-ingredient" 
              data-item="${key}"
              ${state.cash >= cost ? "" : "disabled"}
            >
              Upgrade
            </button>
          </div>
        </div>
      `;
      })
      .join("")}
  `;
}

// recipe table
function renderRecipesContent() {
  const coffeeStock = state.products.coffee.stock;
  const matchaLatteStock = state.products.matchaLatte.stock;
  const coffeeQty = state.recipes.coffee.qty;
  const matchaLatteQty = state.recipes.matchaLatte.qty;
  const coffeeTotalCost = coffeeQty * (PRICES.milk + PRICES.beans);
  const matchaTotalCost = matchaLatteQty * (PRICES.milk + PRICES.matcha);
  const canAffordCoffee = state.cash >= PRICES.milk + PRICES.beans;
  const canAffordMatcha = state.cash >= PRICES.milk + PRICES.matcha;
  const canMakeCoffee =
    coffeeQty > 0 &&
    state.items.milk >= coffeeQty &&
    state.items.beans >= coffeeQty;
  const canMakeMatchaLatte =
    matchaLatteQty > 0 &&
    state.items.milk >= matchaLatteQty &&
    state.items.matcha >= matchaLatteQty;
  const coffeeMeta = stockMeta(coffeeStock.length);
  const coffeeHasSpoiled = state.products.coffee.stock.some(
    (item) => getStockState(item) === "spoiled",
  );
  const matchaMeta = stockMeta(matchaLatteStock.length);
  const matchaHasSpoiled = state.products.matchaLatte.stock.some(
    (item) => getStockState(item) === "spoiled",
  );

  return `
    <div class="table-head recipes">
      <div>Product</div>
      <div>Serve</div>
      <div>Qty</div>
      <div>Actions</div>
      <div>Production</div>
      <div>Stock</div>
    </div>

    <div class="row recipes ${coffeeMeta.rowClass}">
      <div class="product-cell">
        <button class="info-btn" data-action="quick-info" data-product="coffee" aria-label="Show coffee recipe" title="Recipe info">i</button>
          <span class="product-title">Coffee</span>
        </div>
      <div class="serve-price">$${SERVE_PRICE} <span>/ serving</span></div>

    <div class="qty${getTutorialTargetClass("coffee-qty")}">
      <button data-action="recipe-dec" data-product="coffee" aria-label="Decrease coffee batch quantity">-</button>
      <span class="qty-value">${coffeeQty}</span>
      <button data-action="recipe-inc" data-product="coffee" aria-label="Increase coffee batch quantity">+</button>
      ${coffeeTotalCost > 0 ? `<span class="qty-cost">-$${coffeeTotalCost}</span>` : ""}
    </div>

    <div class="row-actions${getTutorialTargetClass("coffee-actions")}">
      ${(() => {
        const stateBtn = getMakeButtonState("coffee");
        return `
    <button 
      data-action="make" 
      data-product="coffee"
      class="
        ${stateBtn === "green" ? "btn-green" : ""}
      "
      ${stateBtn === "disabled" ? "disabled" : ""}
    >
      Make
    </button>
  `;
      })()}

      <button 
        data-action="waste" 
        data-product="coffee" 
        class="btn-waste"
        ${coffeeHasSpoiled ? "" : "disabled"}
      >
        Waste
      </button>
    </div>

    <div class="${getTutorialTargetClass("coffee-production").trim()}">
      ${
        state.products.coffee.productionQueue.length
          ? state.products.coffee.productionQueue
              .map((b) => {
                const remaining = Math.max(0, b.endTime - Date.now());
                const total = b.endTime - b.startTime;
                const progress = 1 - remaining / total;
                const seconds = Math.ceil(remaining / 1000);

                return `
    <div class="prod-bar">
      <div class="prod-fill" style="width:${progress * 100}%">
        ${seconds}s
      </div>
    </div>
  `;
              })
              .join("")
          : '<span class="idle-state">Idle</span>'
      }
    </div>

    <div class="stock-cell">
      <div class="stock-text ${coffeeMeta.statusClass ? `status ${coffeeMeta.statusClass}` : ""}">
        ${coffeeStock.length === 0 ? "Sold out" : `${coffeeStock.length} ready`}
      </div>
        <div class="stock-blocks">
        ${state.products.coffee.stock
          .map((item) => {
            const s = getStockState(item);
            return `<div class="stock-block ${s}"></div>`;
          })
          .join("")}
    </div>
  </div>
</div>

    <div class="row recipes ${matchaMeta.rowClass}">
      <div class="product-cell">
        <button class="info-btn" data-action="quick-info" data-product="matchaLatte" aria-label="Show matcha latte recipe" title="Recipe info">i</button>
          <span class="product-title">Matcha Latte</span>
      </div>
        <div class="serve-price">$${SERVE_PRICE} <span>/ serving</span></div>

    <div class="qty">
      <button data-action="recipe-dec" data-product="matchaLatte" aria-label="Decrease matcha latte batch quantity">-</button>
      <span class="qty-value">${matchaLatteQty}</span>
      <button data-action="recipe-inc" data-product="matchaLatte" aria-label="Increase matcha latte batch quantity">+</button>
      ${matchaTotalCost > 0 ? `<span class="qty-cost">-$${matchaTotalCost}</span>` : ""}
    </div>

    <div class="row-actions">
      ${(() => {
        const stateBtn = getMakeButtonState("matchaLatte");
        return `
    <button 
      data-action="make" 
      data-product="matchaLatte"
      class="
        ${stateBtn === "green" ? "btn-green" : ""}
      "
      ${stateBtn === "disabled" ? "disabled" : ""}
    >
      Make
    </button>
  `;
      })()}

    <button 
      data-action="waste" 
      data-product="matchaLatte" 
      class="btn-waste"
      ${matchaHasSpoiled ? "" : "disabled"}
      >
        Waste
      </button>
    </div>

    <div>
      ${
        state.products.matchaLatte.productionQueue.length
          ? state.products.matchaLatte.productionQueue
              .map((b) => {
                const remaining = Math.max(0, b.endTime - Date.now());
                const total = b.endTime - b.startTime;
                const progress = 1 - remaining / total;
                const seconds = Math.ceil(remaining / 1000);

                return `
    <div class="prod-bar">
      <div class="prod-fill" style="width:${progress * 100}%">
        ${seconds}s
      </div>
    </div>
  `;
              })
              .join("")
          : '<span class="idle-state">Idle</span>'
      }
    </div>

    <div class="stock-cell">
      <div class="stock-text ${matchaMeta.statusClass ? `status ${matchaMeta.statusClass}` : ""}">
        ${matchaLatteStock.length === 0 ? "Sold out" : `${matchaLatteStock.length} ready`}
      </div>
      <div class="stock-blocks">
        ${state.products.matchaLatte.stock
          .map((item) => {
            const s = getStockState(item);
            return `<div class="stock-block ${s}"></div>`;
          })
          .join("")}
    </div>
  </div>
</div>
  `;
}

// kitchen panel render (equipment upgrades)
function renderKitchenPanel() {
  const m = state.kitchen.machine;
  const f = state.kitchen.fridge;

  const speedCost = getUpgradeCost(200, m.level);
  const capacityCost = getUpgradeCost(200, m.capacity);
  const fridgeCost = getUpgradeCost(200, f.level);

  return `
  <div class="equipment-list">
    <strong class="summary-title">Coffee Machine</strong>

    <div class="summary-line">Speed: <strong>x${m.speedMultiplier.toFixed(1)}</strong></div>
    <button 
      data-action="upgrade-speed"
      ${state.cash >= speedCost ? "" : "disabled"}
    >
      Upgrade Speed ($${speedCost})
    </button>

    <div class="summary-line summary-gap">
      Capacity: <strong>${m.capacity} batches</strong>
    </div>
    <button 
      data-action="upgrade-capacity"
      ${state.cash >= capacityCost ? "" : "disabled"}
    >
      Upgrade Capacity ($${capacityCost})
    </button>

    <hr class="summary-gap-lg">

    <strong class="summary-title">Fridge</strong>

    <div class="summary-line">Freshness: <strong>x${f.freshnessMultiplier.toFixed(1)}</strong></div>
    <button 
      data-action="upgrade-fridge"
      ${state.cash >= fridgeCost ? "" : "disabled"}
    >
      Upgrade Freshness ($${fridgeCost})
    </button>
  </div>
`;
}

// customer panel render

function renderCustomerPanel() {
  const customers = state.customer.list;

  if (!customers.length) {
    return `
      <div class="customer-panel customer-panel-empty">
        <div class="customer-line">No customers at the moment</div>
        <div class="customer-subtext">Waiting for next order</div>
      </div>
    `;
  }

  return customers
    .map((customer) => {
      const product = state.products[customer.order];
      const hasStock = product && product.stock.length > 0;

      const elapsed = Date.now() - customer.startTime;
      const progress = Math.max(0, 1 - elapsed / customer.duration);
      const progressColor =
        progress > 0.6
          ? "var(--progress-good)"
          : progress > 0.3
            ? "var(--progress-warn)"
            : "var(--progress-bad)";

      return `
      <div class="customer-panel">
        <div class="customer-line"><span class="customer-name">${customer.name}</span>: ${
          customer.phase === "bad"
            ? "This tastes off..."
            : customer.phase === "neutral"
              ? "It's okay."
              : customer.phase === "good"
                ? customer.thankYou
                : customer.phase === "expired"
                  ? customer.angry
                  : customer.dialogue
        }</div>

        ${
          customer.phase === "ordering"
            ? `
          <div class="customer-actions">
            <button 
              data-action="serve-customer"
              data-product="${customer.order}"
              data-id="${customer.startTime}"
              class="serve-btn ${hasStock ? "is-ready" : "is-empty"}"
              ${hasStock ? "" : "disabled"}
            >
              ${hasStock ? "Serve" : "No Stock"}
            </button>
          </div>
        `
            : ""
        }

         ${
           customer.phase === "ordering"
             ? `
        <div class="customer-progress-wrap">
          <div class="customer-progress-track">
            <div data-progress-id="${customer.startTime}" class="customer-progress-fill" style="width:${progress * 100}%; background:${progressColor};"></div>
          </div>
        </div>`
             : ""
         }

      </div>
    `;
    })
    .join("");
}

// render main menu
function renderMenu() {
  mainBodyEl.innerHTML = `
      <div class="menu-screen">
        <div>
        <h2>Your Shop</h2>
        <div class="menu-actions">
          <button data-action="start-game">Play Game</button>
          <button class="btn-green" data-action="start-tutorial">Tutorial</button>
        </div>
        </div>
      </div>
    `;

  // hide other panels
  customerPanelEl.classList.add("hidden");
  kitchenPanelEl.classList.add("hidden");
  infoPanelEl.classList.add("hidden");
  if (builderPanelEl) {
    builderPanelEl.classList.add("hidden");
  }
}

// settings overlay render
function renderSettingsOverlay() {
  return `
    <div class="settings-overlay">
      <div class="settings-panel">
        <h3>Settings</h3>

        <div class="settings-actions">
        <button data-action="restart-game">Restart</button>
        <button data-action="exit-game">Exit to Menu</button>
        <button data-action="close-settings">Close</button>
        </div>
        <label class="toggle-row">
          Builder Mode
        <input type="checkbox" data-action="toggle-builder" ${state.builder.enabled ? "checked" : ""}/>
        </label>

      </div>
    </div>
  `;
}

// main render (view cash, stock, tabs, panels)
function render() {
  if (state.ui.mode === "menu") {
    renderMenu();
    return;
  }

  runTutorialStepEffects();

  // game mode

  const totalFinishedStock =
    state.products.coffee.stock.length +
    state.products.matchaLatte.stock.length;

  const inventoryTabClass =
    state.ui.activeTab === "inventory" ? "tab active" : "tab";
  const recipesTabClass =
    state.ui.activeTab === "recipes" ? "tab active" : "tab";

  mainBodyEl.innerHTML = `
    <div class="top-bar${getTutorialTargetClass("status")}">
      <button data-action="open-settings" class="btn-exit stat-settings">Settings</button>
      <button data-action="view-cash" class="stat-button">Cash: <strong>$${state.cash}</strong></button>

    <button data-action="view-servings" class="stat-button">
      Ready Servings: <span class="profit-value">${totalFinishedStock}</span>
    </button>

    <button data-action="view-expenses" class="stat-button">
      Expenses: <strong>$${state.expenses.ingredients + state.expenses.waste}</strong>
    </button>

    <button data-action="view-reputation" class="stat-button">
      Reputation <strong>${state.reputation.score}</strong> (${state.reputation.level})
    </button>

    </div>

    <div class="tabs">
      <button class="${inventoryTabClass}" data-action="tab" data-tab="inventory">Inventory</button>
      <button class="${recipesTabClass}${getTutorialTargetClass("recipes-tab")}" data-action="tab" data-tab="recipes">Recipes</button>
    </div>

    <div> 
      ${state.ui.activeTab === "inventory" ? renderInventoryContent() : renderRecipesContent()}
    </div>
  `;

  // toggle panel visibility based on state
  customerPanelEl.classList.toggle("hidden", !state.ui.panels.customers);
  kitchenPanelEl.classList.toggle("hidden", !state.ui.panels.kitchen);

  // builder panel (dev tools)
  if (builderBodyEl && state.ui.mode === "game") {
    builderBodyEl.innerHTML = renderBuilderPanel();
    builderPanelEl.classList.toggle("hidden", !state.builder.enabled);
  }

  // customer panel content
  customerBodyEl.innerHTML = renderCustomerPanel();

  // kitchen panel content
  document.getElementById("kitchenBody").innerHTML = renderKitchenPanel();

  // info panel content
  const view = state.ui.activeInfoView;

  let infoContent = "";

  if (view === "cash") {
    const coffeeServed = state.products.coffee.totalServed || 0;
    const matchaServed = state.products.matchaLatte.totalServed || 0;

    const coffeeRevenue = coffeeServed * SERVE_PRICE;
    const matchaRevenue = matchaServed * SERVE_PRICE;

    const totalRevenue = coffeeRevenue + matchaRevenue;
    const totalExpenses = state.expenses.ingredients + state.expenses.waste;
    const profit = totalRevenue - totalExpenses;

    infoContent = `
    <div class="summary-line"><strong class="summary-title">Profit Summary</strong></div>

    <div class="summary-line">Coffee: ${coffeeServed} served → $${coffeeRevenue}</div>
    <div class="summary-line">Matcha Latte: ${matchaServed} served → $${matchaRevenue}</div>

    <div class="summary-line summary-gap">Revenue: $${totalRevenue}</div>
    <div class="summary-line">Expenses: $${totalExpenses}</div>
    <div class="summary-line"><strong>Net Profit: $${profit}</strong></div>
  `;
  }

  if (view === "servings") {
    infoContent = `
    <div class="summary-line"><strong class="summary-title">Coffee</strong></div>
    <div class="summary-line">Stock: ${state.products.coffee.stock.length}</div>
    <div class="summary-line">Production Time: 8s</div>
    <div class="summary-line">Ingredients: Milk + Beans</div>
    <div class="summary-line">Sell Price: $${SERVE_PRICE}</div>
    <div class="summary-line">Batch Output: ${SERVINGS_PER_BATCH}</div>
    <div class="summary-line">
      Production Time: ${(COFFEE_PRODUCTION_TIME_MS / state.kitchen.machine.speedMultiplier / 1000).toFixed(1)}s
    </div>

    <div class="summary-line summary-gap-lg"><strong class="summary-title">Matcha Latte</strong></div>
    <div class="summary-line">Stock: ${state.products.matchaLatte.stock.length}</div>
    <div class="summary-line">Production Time: 15s</div>
    <div class="summary-line">Ingredients: Milk + Matcha</div>
    <div class="summary-line">Sell Price: $${SERVE_PRICE}</div>
    <div class="summary-line">Batch Output: ${SERVINGS_PER_BATCH}</div>
    <div class="summary-line">
      Production Time: ${(MATCHA_LATTE_PRODUCTION_TIME_MS / state.kitchen.machine.speedMultiplier / 1000).toFixed(1)}s
    </div>
  `;
  }

  if (view === "expenses") {
    const totalExpenses = state.expenses.ingredients + state.expenses.waste;

    infoContent = `
    <div class="summary-line"><strong class="summary-title">Cost Breakdown</strong></div>

    <div class="summary-line">Ingredients Cost: $${state.expenses.ingredients}</div>
    <div class="summary-line">Waste Cost: $${state.expenses.waste}</div>

    <div class="summary-line summary-gap"><strong>Total Expenses: $${totalExpenses}</strong></div>
  `;
  }

  // reputation and reviews
  if (view === "reputation") {
    const r = state.reputation;

    infoContent = `
    <div class="summary-line"><strong class="summary-title">Reputation</strong></div>

    <div class="summary-line">Score: ${r.score}</div>
    <div class="summary-line">Level: ${r.level}</div>

    <div class="summary-line summary-gap"><strong>Recent Reviews</strong></div>

    ${
      r.reviews.length
        ? r.reviews
            .map((rev) => `<div class="summary-line">"${rev}"</div>`)
            .join("")
        : `<div class="summary-line">No reviews yet</div>`
    }
  `;
  }

  // =========================================================
  // SIMULATION INSIGHTS LOGIC
  // =========================================================
  // only show insights in game mode and when not already showing another view
  if (view !== "simulation") {
    infoBodyEl.innerHTML = infoContent;
  }

  // pause overlay
  if (state.ui.paused) {
    mainBodyEl.innerHTML += renderSettingsOverlay();
  }

  syncTutorialTargetClasses();
  mainBodyEl.innerHTML += renderTutorialOverlay();
}

// =========================================================
// 🧍 CUSTOMER SYSTEM
// Spawning, behavior, patience, serving logic
// =========================================================

// serve product to customer
function serveProduct(productType, id) {
  const customer = state.customer.list.find(
    (c) => String(c.startTime) === String(id),
  );
  if (!customer) return;

  const product = state.products[productType];
  if (!product || product.stock.length <= 0) return;
  if (customer.order !== productType) return;

  // 1. take item
  const item = product.stock.shift(); // take 1 serving
  const mod = getStockModifier(item);

  // 2. SET PHASE FIRST
  if (mod.multiplier === 0) {
    customer.phase = "bad";
  } else if (mod.tip === 1) {
    customer.phase = "neutral";
  } else {
    customer.phase = "good";
  }

  // 3. THEN calculate everything else
  let base = customer.price;
  let tip = calculateTip(customer);

  // reputation + reviews now use CORRECT phase

  // update reputation based on customer phase when served
  if (customer.phase === "good") state.reputation.score += 2;
  if (customer.phase === "neutral") state.reputation.score += 0;
  if (customer.phase === "bad") state.reputation.score -= 3;

  updateReputation();

  // add review based on customer phase
  const reviewMap = {
    good: ["Amazing service!", "Loved the drink ☕", "Will come again!"],
    neutral: ["It was okay.", "Nothing special.", "Could be better."],
    bad: ["Drink tasted off...", "Waited too long.", "Not great."],
  };

  const phaseReviews = reviewMap[customer.phase];
  const review = phaseReviews[Math.floor(Math.random() * phaseReviews.length)];

  state.reputation.reviews.unshift(review);

  // keep only latest 3
  state.reputation.reviews = state.reputation.reviews.slice(0, 3);

  // apply stock logic
  tip = Math.min(tip, mod.tip);

  // ingredient quality multiplier
  const ingredientLevel =
    state.ingredients[productType === "matchaLatte" ? "matcha" : "beans"].level;

  const qualityMultiplier = 1 + (ingredientLevel - 1) * 0.1;

  // final amount calculation
  const finalAmount = (base * mod.multiplier + tip) * qualityMultiplier;

  // update cash and show popup
  state.cash += finalAmount;
  showServePopup(finalAmount);

  // track served
  state.products[productType].totalServed =
    (state.products[productType].totalServed || 0) + 1;

  // 4. update UI
  render();

  // DELAY removal (let player SEE reaction)
  setTimeout(() => {
    const index = state.customer.list.indexOf(customer);
    if (index !== -1) {
      state.customer.list.splice(index, 1);
      render();
    }
  }, 2000); // slightly shorter = snappier

  console.log("SERVE CLICKED", productType, id);
}

// spawn customer
function spawnCustomer() {
  if (state.ui.mode !== "game" || state.ui.paused) return;
  if (state.ui.tutorial.active) return;
  if (state.customer.list.length >= 5) return;

  const base = getRandomCustomer();

  const newCustomer = {
    ...base,
    duration: 20000,
    startTime: Date.now(),
    phase: "ordering",
    maxTip: 5,
  };

  state.customer.list.push(newCustomer);

  // expiration logic
  setTimeout(() => {
    if (!state.customer.list.includes(newCustomer)) return;

    newCustomer.phase = "expired";
    state.reputation.score -= 5;
    updateReputation();

    newCustomer.phase = "expired";
    render();

    setTimeout(() => {
      const index = state.customer.list.indexOf(newCustomer);
      if (index !== -1) {
        state.customer.list.splice(index, 1);
        render();
      }
    }, 1500);
  }, newCustomer.duration);

  // IMPORTANT: popup trigger
  if (state.customer.list.length === 1 && state.ui.mode === "game") {
    showCustomerPopup();
  }

  render();
}

function calculateTip(customer) {
  const elapsed = Date.now() - customer.startTime;
  const ratio = 1 - elapsed / customer.duration;

  const baseTip = Math.max(0, Math.floor(customer.maxTip * ratio));
  const repBonus = state.reputation.score / 100;

  return Math.floor(baseTip * (1 + repBonus));
}

// random customer generator
function getRandomCustomer() {
  const randomIndex = Math.floor(Math.random() * CUSTOMERS.length);
  return CUSTOMERS[randomIndex];
}

function acceptCustomer() {
  const customer = state.customer.active;
  if (!customer) return;

  customer.timer = setTimeout(() => {
    state.customer.active = null;
    render();
  }, customer.duration);

  render();
}

// =========================================================
// 🎮 EVENT SYSTEM (User Input)
// Handles clicks and user actions
// Main control flow entry from UI
// =========================================================
function handleMainClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const product = target.dataset.product;

  if (action === "start-tutorial") {
    startTutorial();
    return;
  }

  if (action === "tutorial-next") {
    if (!state.ui.tutorial.active || !isTutorialStepComplete()) return;

    if (state.ui.tutorial.stepIndex >= TUTORIAL_STEPS.length - 1) {
      finishTutorial();
      return;
    }

    setTutorialStep(state.ui.tutorial.stepIndex + 1);
    return;
  }

  if (action === "tutorial-back") {
    if (!state.ui.tutorial.active) return;
    setTutorialStep(state.ui.tutorial.stepIndex - 1);
    return;
  }

  if (action === "tutorial-skip") {
    finishTutorial({ skipped: true });
    return;
  }

  // toggle builder panel (dev tool)
  if (action === "toggle-builder") {
    state.builder.enabled = !state.builder.enabled;

    if (builderPanelEl) {
      builderPanelEl.classList.toggle("hidden", !state.builder.enabled);
    }

    render();
    return;
  }

  // upgrade machine capacity (disabled)
  if (action === "upgrade-capacity") {
    const m = state.kitchen.machine;
    const cost = getUpgradeCost(200, m.capacity);

    if (state.cash < cost) return;

    state.cash -= cost;
    m.capacity += 1; // increase capacity by 1 batch

    render();
    return;
  }

  // toggle panels
  if (action === "toggle-customers") {
    const isOn = target.checked;
    state.ui.panels.customers = isOn;
    render();
    return;
  }

  if (action === "toggle-kitchen") {
    const isOn = target.checked;
    state.ui.panels.kitchen = isOn;
    render();
    return;
  }

  // start game from menu
  if (action === "start-game") {
    resetTutorialState();
    state.ui.mode = "game";

    // show panels again
    customerPanelEl.classList.remove("hidden");
    kitchenPanelEl.classList.remove("hidden");

    render();
    return;
  }

  // open settings (pause game)
  if (action === "open-settings") {
    state.ui.paused = true;
    render();
    return;
  }

  // close info panel if open
  if (action === "close-settings") {
    state.ui.paused = false;
    render();
    return;
  }

  // restart game
  if (action === "restart-game") {
    resetGameState();
    state.ui.paused = false;
    render();
    return;
  }

  // exit game
  if (action === "exit-game") {
    state.ui.mode = "menu";
    state.ui.paused = false;
    resetTutorialState();
    resetUIForMenu();
    render();
    return;
  }

  // EQUIPMENT UPGRADES

  // upgrade machine speed
  if (action === "upgrade-speed") {
    const m = state.kitchen.machine;
    const cost = getUpgradeCost(200, m.level);

    if (state.cash < cost) return;

    state.cash -= cost;
    m.speedMultiplier += 0.2;
    m.level++;

    render();
    return;
  }

  // upgrade fridge freshness
  if (action === "upgrade-fridge") {
    const f = state.kitchen.fridge;
    const cost = getUpgradeCost(200, f.level);

    if (state.cash < cost) return;

    state.cash -= cost;
    f.freshnessMultiplier += 0.3;
    f.level++;

    render();
    return;
  }

  // upgrade ingredient quality
  if (action === "upgrade-ingredient") {
    const item = target.dataset.item;
    const ing = state.ingredients[item];

    const cost = Math.floor(20 * Math.pow(1.5, ing.level - 1));

    if (state.cash < cost) return;

    state.cash -= cost;
    ing.level++;

    render();
    return;
  }

  // view reputation details
  if (action === "view-reputation") {
    state.ui.activeInfoView = "reputation";
    infoPanelEl.classList.remove("hidden");
    render();
    return;
  }

  // view quick info about product
  if (action === "quick-info") {
    if (!product) return;
    showQuickInfoPopup(product);
    return;
  }

  // view cash details
  if (action === "view-cash") {
    state.ui.activeInfoView = "cash";
    infoPanelEl.classList.remove("hidden");
    render();
    return;
  }

  // view servings details
  if (action === "view-servings") {
    state.ui.activeInfoView = "servings";
    infoPanelEl.classList.remove("hidden");
    render();
    return;
  }

  // view expenses details
  if (action === "view-expenses") {
    state.ui.activeInfoView = "expenses";
    infoPanelEl.classList.remove("hidden");
    render();
    return;
  }

  // accept customer from top bar
  if (action === "accept-customer") {
    acceptCustomer();
    return;
  }

  // serve customer action from customer panel
  if (action === "serve-customer") {
    const product = target.dataset.product;
    const id = target.dataset.id;
    serveProduct(product, id);
    advanceTutorialIfComplete();
    return;
  }

  // waste spoiled products
  if (action === "waste") {
    const productState = state.products[product];

    if (!productState || productState.stock.length === 0) return;

    const spoiled = productState.stock.filter(
      (item) => getStockState(item) === "spoiled",
    );

    const wasteCost = spoiled.length * 2;

    // 💸 apply cost
    state.expenses.waste += wasteCost;
    state.cash -= wasteCost;

    // ✅ REMOVE spoiled items
    productState.stock = productState.stock.filter(
      (item) => getStockState(item) !== "spoiled",
    );

    render();
    return;
  }

  // switch tabs
  if (action === "tab") {
    state.ui.activeTab = target.dataset.tab;
    render();
    advanceTutorialIfComplete();
    return;
  }

  // increase purchase qty (disabled)
  if (action === "purchase-inc") return;

  // decrease purchase qty (disabled)
  if (action === "purchase-dec") return;

  // recipe increase
  if (action === "recipe-inc") {
    if (!product || !state.recipes[product]) return;

    const currentQueue = state.products[product].productionQueue.length;
    const nextQty = state.recipes[product].qty + 1;

    // limit max queue based on machine level
    const maxQueue = state.kitchen.machine.capacity;

    if (nextQty > maxQueue) {
      showProductionLimitPopup();
      return;
    }

    const requiredMilk = nextQty;
    const requiredSecond = product === "matchaLatte" ? nextQty : nextQty;

    if (state.products[product].productionQueue.length >= maxQueue) {
      showProductionLimitPopup();
      return;
    }

    const missingMilk = Math.max(0, requiredMilk - state.items.milk);
    const missingSecond =
      product === "matchaLatte"
        ? Math.max(0, requiredSecond - state.items.matcha)
        : Math.max(0, requiredSecond - state.items.beans);

    const cost =
      missingMilk * PRICES.milk +
      missingSecond *
        (product === "matchaLatte" ? PRICES.matcha : PRICES.beans);

    if (state.cash < cost) {
      showpurchaseBlockedPopup(product);
      return;
    }

    state.recipes[product].qty++;
    render();
    advanceTutorialIfComplete();
    return;
  }

  // recipe decrease
  if (action === "recipe-dec") {
    if (!product || !state.recipes[product]) return;

    state.recipes[product].qty = Math.max(0, state.recipes[product].qty - 1);
    render();
    return;
  }

  // make coffee
  if (action === "make") {
    if (!product || !state.recipes[product]) return;

    const productState = state.products[product];
    const qty = state.recipes[product].qty;
    if (qty <= 0) return;

    const queuedStock = productState.productionQueue.reduce(
      (sum, b) => sum + b.qty * SERVINGS_PER_BATCH,
      0,
    );

    const totalFutureStock =
      productState.stock.length + queuedStock + qty * SERVINGS_PER_BATCH;

    if (totalFutureStock > MAX_STOCK) {
      showpurchaseBlockedPopup(product);
      return;
    }

    const missingMilk = Math.max(0, qty - state.items.milk);
    const missingSecond =
      product === "matchaLatte"
        ? Math.max(0, qty - state.items.matcha)
        : Math.max(0, qty - state.items.beans);

    const cost =
      missingMilk * PRICES.milk +
      missingSecond *
        (product === "matchaLatte" ? PRICES.matcha : PRICES.beans);

    // AUTO PURCHASE (strict + predictable)
    if (cost > state.cash) {
      showpurchaseBlockedPopup(product);
      return; // BLOCK EARLY
    }

    // buy missing ingredients
    if (missingMilk > 0) {
      state.items.milk += missingMilk;
      state.cash -= missingMilk * PRICES.milk;
      state.expenses.ingredients += missingMilk * PRICES.milk;
    }

    if (missingSecond > 0) {
      if (product === "matchaLatte") {
        state.items.matcha += missingSecond;
        state.cash -= missingSecond * PRICES.matcha;
        state.expenses.ingredients += missingSecond * PRICES.matcha;
      } else {
        state.items.beans += missingSecond;
        state.cash -= missingSecond * PRICES.beans;
        state.expenses.ingredients += missingSecond * PRICES.beans;
      }
    }

    if (missingMilk > 0 || missingSecond > 0) {
      showPurchasedPopup();
    }

    if (product === "matchaLatte") {
      if (!(state.items.milk >= qty && state.items.matcha >= qty)) return;

      state.items.milk -= qty;
      state.items.matcha -= qty;
    } else {
      if (!(state.items.milk >= qty && state.items.beans >= qty)) return;

      state.items.milk -= qty;
      state.items.beans -= qty;
    }

    state.recipes[product].qty = 0;

    const maxQueue = state.kitchen.machine.level + 1;

    if (productState.productionQueue.length >= maxQueue) {
      showProductionLimitPopup();
      return;
    }

    // calculate production time with machine speed multiplier
    const speed = state.kitchen.machine.speedMultiplier;

    productState.productionQueue.push({
      qty,
      startTime: Date.now(),
      endTime: Date.now() + getProductionTime(product) / speed,
    });

    render();
    advanceTutorialIfComplete();
  }
}

function handleInfoClick(event) {
  if (event.target.dataset.action === "close-info") {
    infoPanelEl.classList.add("hidden");
  }
}

// =========================================================
// 🪟 UI INTERACTION SYSTEM
// Dragging, panel movement, UI behavior
// =========================================================
function makePanelDraggable(panelEl) {
  const header = panelEl.querySelector(".panel-header");
  let dragging = false,
    offsetX = 0,
    offsetY = 0;

  header.addEventListener("mousedown", (e) => {
    dragging = true;
    offsetX = e.clientX - panelEl.offsetLeft;
    offsetY = e.clientY - panelEl.offsetTop;
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    panelEl.style.left = `${e.clientX - offsetX}px`;
    panelEl.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener("mouseup", () => (dragging = false));
}

// =========================================================
// 🚀 INIT & GAME LOOP
// Entry point + continuous systems
// Starts everything
// =========================================================
function init() {
  mainBodyEl.addEventListener("click", handleMainClick);
  mainBodyEl.addEventListener("change", handleMainClick);
  customerBodyEl.addEventListener("click", handleMainClick);
  infoPanelEl.addEventListener("click", handleInfoClick);
  kitchenPanelEl.addEventListener("click", handleMainClick);
  builderPanelEl.addEventListener("change", handleMainClick);
  builderPanelEl.addEventListener("click", handleMainClick);

  // make panels draggable
  makePanelDraggable(mainPanelEl);
  makePanelDraggable(infoPanelEl);
  makePanelDraggable(customerPanelEl);
  makePanelDraggable(kitchenPanelEl);
  if (builderPanelEl) {
    makePanelDraggable(builderPanelEl);
  }

  render();

  // customer loop defined INSIDE
  function startCustomerLoop() {
    setTimeout(() => {
      if (!state.ui.tutorial.active && state.customer.list.length < 5) {
        spawnCustomer();
      }
      startCustomerLoop();
    }, state.builder.spawnRate);
  }

  // builder panel input handling
  document.addEventListener("input", (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    const val = Number(e.target.value);

    if (action === "set-coffee-price") {
      SERVE_PRICE = val;
    }

    if (action === "set-milk-price") {
      PRICES.milk = val;
    }

    if (action === "set-production-time") {
      state.builder.productionTime = val;
    }

    if (action === "set-max-queue") {
      state.kitchen.machine.capacity = val;
    }

    if (action === "set-spawn-rate") {
      state.builder.spawnRate = val;
    }

    render();
  });

  // start it INSIDE
  startCustomerLoop();

  // process production queues and move to stock when done
  setInterval(() => {
    if (state.ui.mode !== "game" || state.ui.paused) return;

    processProductionQueue();
    if (state.ui.tutorial.active && getTutorialStep().id === "production") {
      advanceTutorialIfComplete();
    }
    render(); // THIS FIXES LAG
  }, 500);
}

init();
