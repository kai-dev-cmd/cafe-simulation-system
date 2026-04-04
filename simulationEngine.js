/**
 * simulationEngine.js
 * Pure, deterministic, UI-free simulation analysis module.
 */

const DEFAULTS = {
  stock: {
    lowThresholdRatio: 1.0,
    criticalThresholdRatio: 0.5,
  },
  queue: {
    highUtilizationRatio: 0.85,
    criticalUtilizationRatio: 1.0,
    highWaitToMaxRatio: 0.7,
    criticalWaitToMaxRatio: 1.0,
  },
  production: {
    lowOutputRatio: 0.85,
    criticalOutputRatio: 0.6,
    highDowntimeRate: 0.2,
    criticalDowntimeRate: 0.35,
    highDefectRate: 0.08,
    criticalDefectRate: 0.15,
  },
};

const SEVERITY_WEIGHT = {
  low: 0.35,
  medium: 0.6,
  high: 0.85,
  critical: 1,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeToken(value, fallback = "item") {
  return (
    String(value ?? fallback)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback
  );
}

/**
 * Enforces consistent insight shape.
 * @param {Object} input
 * @returns {{type:string,target:string,severity:string,priority:number,action:string,message:string}}
 */
function createInsight(input) {
  const severity = ["low", "medium", "high", "critical"].includes(
    input?.severity,
  )
    ? input.severity
    : "low";

  const priorityFromSeverity = SEVERITY_WEIGHT[severity];
  const priority = clamp(toNumber(input?.priority, priorityFromSeverity), 0, 1);

  return {
    type: String(input?.type ?? "general"),
    target: String(input?.target ?? "system"),
    severity,
    priority,
    action: String(input?.action ?? "investigate"),
    message: String(input?.message ?? "No details provided."),
  };
}

/**
 * Returns a new array sorted by highest priority first.
 * Deterministic tie-breaks are applied for stable output.
 * @param {Array} insights
 */
function sortInsightsByPriority(insights) {
  return [...(Array.isArray(insights) ? insights : [])].sort((a, b) => {
    const priorityDelta = toNumber(b?.priority, 0) - toNumber(a?.priority, 0);
    if (priorityDelta !== 0) return priorityDelta;

    const severityDelta =
      toNumber(SEVERITY_WEIGHT[b?.severity], 0) -
      toNumber(SEVERITY_WEIGHT[a?.severity], 0);
    if (severityDelta !== 0) return severityDelta;

    const typeDelta = String(a?.type ?? "").localeCompare(
      String(b?.type ?? ""),
    );
    if (typeDelta !== 0) return typeDelta;

    return String(a?.target ?? "").localeCompare(String(b?.target ?? ""));
  });
}

function normalizeStockItems(stockData) {
  if (Array.isArray(stockData)) return stockData;
  if (stockData && typeof stockData === "object") {
    return Object.entries(stockData).map(([name, value]) => ({
      name,
      ...(value && typeof value === "object" ? value : { current: value }),
    }));
  }
  return [];
}

// =========================================================
// ANALYZE ECONOMY
// analyze economy metrics and generate insights for low or negative profit margins on products
// =========================================================
function analyzeEconomy(data) {
  const insights = [];
  const pricing = data.pricing;
  const demandPressure = data.queue.length / data.queue.capacity;

  if (!pricing) return insights;

  Object.entries(pricing).forEach(([product, p]) => {
    const profit = p.price + p.avgTip - p.cost;

    if (profit <= 0) {
      insights.push({
        type: "economy",
        target: product,
        severity: "high",
        priority: 1,
        action: "increase_price",
        message: `${product} is losing money (${profit.toFixed(2)} per sale)`,
      });
    }
    if (profit < 2 && demandPressure > 0.7) {
      insights.push({
        type: "economy",
        target: product,
        severity: "medium",
        priority: 0.8,
        action: "increase_price",
        message: `${product} demand is high — you can raise price`,
      });
    }
    if (profit > 5 && demandPressure < 0.3) {
      insights.push({
        type: "economy",
        target: product,
        severity: "low",
        priority: 0.5,
        action: "lower_price",
        message: `${product} might be overpriced — demand is low`,
      });
    }
  });

  return insights;
}

// =========================================================
// ANALYZE STOCK
// analyze stock levels and generate insights for low inventory items based on current vs minimum thresholds
// =========================================================
function analyzeStock(data, config = DEFAULTS.stock) {
  const insights = [];
  const stockItems = normalizeStockItems(data?.stock);

  for (const item of stockItems) {
    const name = String(item?.name ?? item?.id ?? "item");
    const current = toNumber(item?.current, 0);
    const min = toNumber(item?.min, 0);

    if (min <= 0) continue;

    const ratio = current / min;
    const token = normalizeToken(name);

    if (ratio <= config.criticalThresholdRatio) {
      insights.push(
        createInsight({
          type: "stock",
          target: name,
          severity: "critical",
          priority: clamp(1 - ratio * 0.4, 0, 1),
          action: `restock_${token}`,
          message: `${name} inventory is critically low (${current}/${min}).`,
        }),
      );
      continue;
    }

    if (ratio < config.lowThresholdRatio) {
      insights.push(
        createInsight({
          type: "stock",
          target: name,
          severity: "high",
          priority: clamp(0.7 + (1 - ratio) * 0.25, 0, 1),
          action: `restock_${token}`,
          message: `${name} inventory is below minimum (${current}/${min}).`,
        }),
      );
    }
  }

  return insights;
}

// =========================================================
// ANALYZE QUEUE
// analyze queue metrics and generate insights for high utilization and long wait times based on current vs capacity and average vs max wait thresholds
// =========================================================
function analyzeQueue(data, config = DEFAULTS.queue) {
  const insights = [];
  const queue = data?.queue;
  if (!queue || typeof queue !== "object") return insights;

  const queueName = String(queue?.name ?? "queue");
  const token = normalizeToken(queueName, "queue");
  const length = toNumber(queue?.length, 0);
  const capacity = toNumber(queue?.capacity, 0);
  const avgWait = toNumber(queue?.avgWait, 0);
  const maxWait = toNumber(queue?.maxWait, 0);

  if (capacity > 0) {
    const utilization = length / capacity;
    if (utilization >= config.criticalUtilizationRatio) {
      insights.push(
        createInsight({
          type: "queue",
          target: queueName,
          severity: "critical",
          priority: clamp(0.9 + Math.min(utilization - 1, 0.1), 0, 1),
          action: `scale_queue_${token}`,
          message: `${queueName} is at or above capacity (${length}/${capacity}).`,
        }),
      );
    } else if (utilization >= config.highUtilizationRatio) {
      insights.push(
        createInsight({
          type: "queue",
          target: queueName,
          severity: "high",
          priority: clamp(0.7 + utilization * 0.2, 0, 1),
          action: `optimize_queue_${token}`,
          message: `${queueName} utilization is high (${length}/${capacity}).`,
        }),
      );
    }
  }

  if (maxWait > 0) {
    const waitRatio = avgWait / maxWait;
    if (waitRatio >= config.criticalWaitToMaxRatio) {
      insights.push(
        createInsight({
          type: "queue",
          target: queueName,
          severity: "critical",
          priority: clamp(0.9 + Math.min(waitRatio - 1, 0.1), 0, 1),
          action: `reduce_wait_time_${token}`,
          message: `${queueName} average wait has reached max threshold (${avgWait}/${maxWait}).`,
        }),
      );
    } else if (waitRatio >= config.highWaitToMaxRatio) {
      insights.push(
        createInsight({
          type: "queue",
          target: queueName,
          severity: "medium",
          priority: clamp(0.5 + waitRatio * 0.25, 0, 1),
          action: `reduce_wait_time_${token}`,
          message: `${queueName} average wait is trending high (${avgWait}/${maxWait}).`,
        }),
      );
    }
  }

  return insights;
}

// =========================================================
// ANALYZE PROFIT
// analyze profit metrics and generate insights for low or negative profit margins based on cost, price, and tip data
// =========================================================
function analyzeProfit(data) {
  const insights = [];

  const { pricing } = data;

  if (!pricing) return insights;

  const { costPerDrink, sellPrice, avgTip } = pricing;

  const profit = sellPrice + avgTip - costPerDrink;

  if (profit <= 0) {
    insights.push({
      type: "profit",
      target: "pricing",
      severity: "high",
      priority: 1,
      action: "increase_price",
      message: "You're losing money per drink",
    });
  } else if (profit < 2) {
    insights.push({
      type: "profit",
      target: "pricing",
      severity: "medium",
      priority: 0.7,
      action: "optimize_price",
      message: "Profit margin is very low",
    });
  } else {
    insights.push({
      type: "profit",
      target: "pricing",
      severity: "low",
      priority: 0.3,
      action: "good_pricing",
      message: "Pricing is healthy",
    });
  }

  return insights;
}

// =========================================================
// ANALYZE PRODUCTION
// analyze production metrics and generate insights for low output, high downtime, and high defect rates based on current vs target output and downtime/defect rate thresholds
// =========================================================
function analyzeProduction(data, config = DEFAULTS.production) {
  const insights = [];
  const production = data?.production;
  if (!production || typeof production !== "object") return insights;

  const line = String(
    production?.line ?? production?.name ?? "production_line",
  );
  const token = normalizeToken(line, "production");

  const output = toNumber(production?.output, 0);
  const targetOutput = toNumber(production?.targetOutput, 0);
  const downtimeRate = toNumber(production?.downtimeRate, 0);
  const defectRate = toNumber(production?.defectRate, 0);

  if (targetOutput > 0) {
    const outputRatio = output / targetOutput;

    if (outputRatio <= config.criticalOutputRatio) {
      insights.push(
        createInsight({
          type: "production",
          target: line,
          severity: "critical",
          priority: clamp(1 - outputRatio * 0.4, 0, 1),
          action: `recover_output_${token}`,
          message: `${line} output is critically below target (${output}/${targetOutput}).`,
        }),
      );
    } else if (outputRatio < config.lowOutputRatio) {
      insights.push(
        createInsight({
          type: "production",
          target: line,
          severity: "high",
          priority: clamp(0.7 + (1 - outputRatio) * 0.2, 0, 1),
          action: `improve_throughput_${token}`,
          message: `${line} output is below target (${output}/${targetOutput}).`,
        }),
      );
    }
  }

  if (downtimeRate >= config.criticalDowntimeRate) {
    insights.push(
      createInsight({
        type: "production",
        target: line,
        severity: "critical",
        priority: clamp(0.85 + downtimeRate * 0.15, 0, 1),
        action: `reduce_downtime_${token}`,
        message: `${line} downtime is critical (${(downtimeRate * 100).toFixed(1)}%).`,
      }),
    );
  } else if (downtimeRate >= config.highDowntimeRate) {
    insights.push(
      createInsight({
        type: "production",
        target: line,
        severity: "medium",
        priority: clamp(0.45 + downtimeRate * 0.25, 0, 1),
        action: `reduce_downtime_${token}`,
        message: `${line} downtime is elevated (${(downtimeRate * 100).toFixed(1)}%).`,
      }),
    );
  }

  if (defectRate >= config.criticalDefectRate) {
    insights.push(
      createInsight({
        type: "production",
        target: line,
        severity: "high",
        priority: clamp(0.75 + defectRate * 0.2, 0, 1),
        action: `improve_quality_${token}`,
        message: `${line} defect rate is critical (${(defectRate * 100).toFixed(1)}%).`,
      }),
    );
  } else if (defectRate >= config.highDefectRate) {
    insights.push(
      createInsight({
        type: "production",
        target: line,
        severity: "medium",
        priority: clamp(0.45 + defectRate * 0.25, 0, 1),
        action: `improve_quality_${token}`,
        message: `${line} defect rate is above target (${(defectRate * 100).toFixed(1)}%).`,
      }),
    );
  }

  return insights;
}

// =========================================================
// ENGINE RUNNER
// Plugin data here
// =========================================================
function runRules(data, rules) {
  return rules.flatMap((rule) => rule(data));
}

/**
 * Main entry point.
 * @param {Object} data
 * @returns {{insights:Array, topAction:Object|null}}
 */
function analyzeSimulation(data = {}) {
  const rules = [
    analyzeStock,
    analyzeQueue,
    analyzeProduction,
    analyzeProfit,
    analyzeEconomy,
  ]; // this
  const insights = sortInsightsByPriority(runRules(data, rules));
  return {
    insights,
    topAction: insights[0] ?? null,
  };
}

window.simulationEngine = {
  analyzeSimulation,
};
