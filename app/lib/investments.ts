export type Market = "TW" | "US";
export type Currency = "TWD" | "USD";
export type TradeSide = "buy" | "sell";

export type InvestmentTrade = {
  id: string;
  date: string;
  tradeDate?: string;
  market: Market;
  symbol: string;
  ticker: string;
  name: string;
  side: TradeSide;
  quantity: number;
  price: number;
  fee: number;
  tax: number;
  currency: Currency;
  exchangeRate: number;
  totalAmount: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type InvestmentPosition = {
  market: Market;
  ticker: string;
  name: string;
  quantity: number;
  averageCost: number;
  totalCost: number;
  currency: Currency;
  updatedAt: string;
};

export type FxRecord = {
  id: string;
  date: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  fee: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type DividendRecord = {
  id: string;
  date: string;
  payDate?: string;
  market: Market;
  broker: string;
  account: string;
  symbol: string;
  ticker: string;
  name: string;
  grossAmount: number;
  amount: number;
  tax: number;
  fee: number;
  netAmount: number;
  currency: Currency;
  exchangeRate: number;
  amountTwd: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type CashAccount = {
  id: string;
  name: string;
  currency: Currency;
  balance: number;
  note: string;
  createdAt?: string;
  updatedAt: string;
};

export type CashLedgerType =
  | "deposit"
  | "withdraw"
  | "fx_in"
  | "fx_out"
  | "trade_buy"
  | "trade_sell"
  | "dividend"
  | "adjustment";

export type CashLedger = {
  id: string;
  date: string;
  accountId: string;
  accountName: string;
  currency: Currency;
  type: CashLedgerType;
  amount: number;
  relatedType: string;
  relatedId: string;
  note: string;
  createdAt: string;
  account?: string;
  sourceType?: string;
  sourceId?: string;
  updatedAt?: string;
};

export const symbolNameMap: Record<string, string> = {
  VOO: "Vanguard S&P 500 ETF",
  QQQM: "Invesco NASDAQ 100 ETF",
  QQQ: "Invesco QQQ Trust",
  VT: "Vanguard Total World Stock ETF",
  VTI: "Vanguard Total Stock Market ETF",
  SPY: "SPDR S&P 500 ETF Trust",
  "0050": "元大台灣50",
  "006208": "富邦台50",
  "00878": "國泰永續高股息",
  "00919": "群益台灣精選高息",
  "00929": "復華台灣科技優息",
};

export function normalizeSymbol(value: string, market?: Market) {
  const symbol = value.trim().toUpperCase();
  if (market === "TW" && /^\d+$/.test(symbol) && symbol.length < 4) {
    return symbol.padStart(4, "0");
  }
  return symbol;
}

export function getSymbolName(value: string, market?: Market) {
  return symbolNameMap[normalizeSymbol(value, market)] ?? "";
}

export function calculateTradeTotal(
  market: Market,
  side: TradeSide,
  quantity: number,
  price: number,
  fee: number,
  tax: number,
) {
  const multiplier = market === "TW" ? 1000 : 1;
  const subtotal = quantity * multiplier * price;
  return side === "buy"
    ? subtotal + fee + tax
    : subtotal - fee - tax;
}

export function calculatePositions(
  trades: InvestmentTrade[],
): InvestmentPosition[] {
  const positions = new Map<string, InvestmentPosition>();
  const orderedTrades = [...trades].sort((a, b) =>
    `${a.date}|${a.createdAt}|${a.id}`.localeCompare(
      `${b.date}|${b.createdAt}|${b.id}`,
    ),
  );

  orderedTrades.forEach((trade) => {
    const symbol = normalizeSymbol(trade.symbol || trade.ticker, trade.market);
    const key = `${trade.market}:${symbol}`;
    const current = positions.get(key) ?? {
      market: trade.market,
      ticker: symbol,
      name: trade.name,
      quantity: 0,
      averageCost: 0,
      totalCost: 0,
      currency: trade.currency,
      updatedAt: trade.updatedAt,
    };
    const quantity = trade.quantity * (trade.market === "TW" ? 1000 : 1);

    if (trade.side === "buy") {
      const addedCost = quantity * trade.price + trade.fee + trade.tax;
      const nextQuantity = current.quantity + quantity;
      current.totalCost += addedCost;
      current.quantity = nextQuantity;
      current.averageCost =
        nextQuantity > 0 ? current.totalCost / nextQuantity : 0;
    } else {
      const soldQuantity = Math.min(quantity, current.quantity);
      current.totalCost = Math.max(
        0,
        current.totalCost - soldQuantity * current.averageCost,
      );
      current.quantity = Math.max(0, current.quantity - quantity);
      if (current.quantity === 0) {
        current.averageCost = 0;
        current.totalCost = 0;
      }
    }

    current.name = trade.name || current.name;
    current.updatedAt = trade.updatedAt;
    positions.set(key, current);
  });

  return [...positions.values()]
    .filter((position) => position.quantity > 0)
    .sort((a, b) =>
      `${a.market}:${a.ticker}`.localeCompare(`${b.market}:${b.ticker}`),
    );
}

export function formatInvestmentMoney(
  value: number,
  currency: Currency,
  maximumFractionDigits = currency === "TWD" ? 0 : 2,
) {
  const amount = new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
  return `${currency === "TWD" ? "NT$" : "US$"}${amount}`;
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeDateOnly(value: unknown) {
  if (!value) return "";
  const text = String(value);
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return dateOnly[0];

  const parsed = value instanceof Date ? value : new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : localDateKey(parsed);
}
