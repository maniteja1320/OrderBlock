/** Client-safe Chartink unified board types. */

import type { BullVsBearResponse } from "./bullVsBearTypes";
import type { FoGainersResponse } from "./foGainersTypes";
import type { NarrowCprResponse } from "./narrowCprTypes";
import type { Near52WeekHighResponse } from "./near52WeekHighTypes";
import type { OiOptionsStocksResponse } from "./oiOptionsStocksTypes";
import type { VolumeIncreaseResponse } from "./volumeIncreaseTypes";

export interface ChartinkBoardResponse {
  updatedAt: string;
  bullVsBear: BullVsBearResponse;
  volumeIncrease: VolumeIncreaseResponse;
  oiOptionsStocks: OiOptionsStocksResponse;
  foGainers: FoGainersResponse;
  foLosers: FoGainersResponse;
  narrowCpr: NarrowCprResponse;
  near52WeekHigh: Near52WeekHighResponse;
  error?: string;
}
