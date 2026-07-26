export const TradingAction = {
  SpotBuy: 1,
  SpotSell: 2,
  OpenLong: 3,
  CloseLong: 4,
  OpenShort: 5,
  CloseShort: 6,
  LiquidateLong: 7,
  LiquidateShort: 8,
  LiquidationBatch: 11,
} as const;

export type UserTradingAction =
  | typeof TradingAction.SpotBuy
  | typeof TradingAction.SpotSell
  | typeof TradingAction.OpenLong
  | typeof TradingAction.CloseLong
  | typeof TradingAction.OpenShort
  | typeof TradingAction.CloseShort;

export const USER_TRADING_ACTIONS: UserTradingAction[] = [1, 2, 3, 4, 5, 6];

export function tradingActionLabel(action: number) {
  switch (action) {
    case TradingAction.SpotBuy: return "Spot buy";
    case TradingAction.SpotSell: return "Spot sell";
    case TradingAction.OpenLong: return "Open long";
    case TradingAction.CloseLong: return "Close long";
    case TradingAction.OpenShort: return "Open short";
    case TradingAction.CloseShort: return "Close short";
    case TradingAction.LiquidateLong: return "Liquidate long";
    case TradingAction.LiquidateShort: return "Liquidate short";
    case TradingAction.LiquidationBatch: return "Liquidation batch";
    default: return `Action ${action}`;
  }
}

export function isUserTradingAction(action: number): action is UserTradingAction {
  return USER_TRADING_ACTIONS.includes(action as UserTradingAction);
}
