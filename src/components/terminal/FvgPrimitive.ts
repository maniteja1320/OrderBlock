import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
  CandlestickData,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { FairValueGap } from "@/lib/types";

interface FvgBox {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  side: "bullish" | "bearish";
  filled: boolean;
}

class FvgRenderer implements IPrimitivePaneRenderer {
  private _boxes: FvgBox[];

  constructor(boxes: FvgBox[]) {
    this._boxes = boxes;
  }

  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hRatio = scope.horizontalPixelRatio;
      const vRatio = scope.verticalPixelRatio;

      for (const box of this._boxes) {
        const x1 = Math.round(box.x1 * hRatio);
        const x2 = Math.round(box.x2 * hRatio);
        const y1 = Math.round(box.y1 * vRatio);
        const y2 = Math.round(box.y2 * vRatio);
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);
        const width = Math.max(1, right - left);
        const height = Math.max(2, bottom - top);
        if (width < 2) continue;

        // Distinct from OB greens/reds: sky bull / rose bear
        const rgb = box.side === "bullish" ? "56, 189, 248" : "251, 113, 133";

        ctx.save();
        if (box.filled) {
          ctx.strokeStyle = `rgba(${rgb}, 0.35)`;
          ctx.lineWidth = Math.max(1, Math.round(1 * hRatio));
          ctx.setLineDash([Math.round(3 * hRatio), Math.round(3 * hRatio)]);
          ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
        } else {
          ctx.fillStyle = `rgba(${rgb}, 0.18)`;
          ctx.fillRect(left, top, width, height);
          ctx.strokeStyle = `rgba(${rgb}, 0.65)`;
          ctx.lineWidth = Math.max(1, Math.round(1 * hRatio));
          ctx.setLineDash([]);
          ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);

          ctx.fillStyle = `rgba(${rgb}, 0.9)`;
          ctx.font = `bold ${Math.round(10 * vRatio)}px sans-serif`;
          ctx.fillText("FVG", left + 3 * hRatio, top + 11 * vRatio);
        }
        ctx.restore();
      }
    });
  }
}

class FvgPaneView implements IPrimitivePaneView {
  private _source: FvgPrimitive;

  constructor(source: FvgPrimitive) {
    this._source = source;
  }

  zOrder() {
    return "bottom" as const;
  }

  renderer() {
    return new FvgRenderer(this._source.boxes());
  }
}

/** Draws fair value gap rectangles (unfilled solid, filled dashed). */
export class FvgPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<"Candlestick"> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _paneView: FvgPaneView;
  private _gaps: FairValueGap[] = [];
  private _candles: CandlestickData<Time>[] = [];
  private _boxes: FvgBox[] = [];

  constructor() {
    this._paneView = new FvgPaneView(this);
  }

  attached(param: SeriesAttachedParameter<Time, "Candlestick">) {
    this._chart = param.chart as IChartApi;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  setGaps(gaps: FairValueGap[], candles: CandlestickData<Time>[]) {
    this._gaps = gaps;
    this._candles = candles;
    this._requestUpdate?.();
  }

  updateAllViews() {
    this._boxes = this._compute();
  }

  paneViews() {
    return [this._paneView];
  }

  boxes() {
    return this._boxes;
  }

  private _compute(): FvgBox[] {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series || !this._gaps.length || !this._candles.length) {
      return [];
    }

    const timeScale = chart.timeScale();
    const lastTime = this._candles[this._candles.length - 1].time;
    const barSpacing = timeScale.options().barSpacing || 6;
    const out: FvgBox[] = [];

    for (const g of this._gaps) {
      const y1 = series.priceToCoordinate(g.top);
      const y2 = series.priceToCoordinate(g.bottom);
      const x1 = timeScale.timeToCoordinate(g.time as Time);
      const end = (g.endTime || (lastTime as number)) as Time;
      const xEnd = timeScale.timeToCoordinate(end);
      if (y1 == null || y2 == null || x1 == null) continue;

      const x2 = xEnd != null ? xEnd : x1 + barSpacing * 8;
      out.push({
        x1,
        x2: Math.max(x2, x1 + barSpacing),
        y1,
        y2,
        side: g.side,
        filled: g.filled,
      });
    }

    return out;
  }
}
