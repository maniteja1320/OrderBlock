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
import type { LevelMark } from "@/lib/types";

interface LiqBox {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  label: string;
  taken: boolean;
}

class LiquidityRenderer implements IPrimitivePaneRenderer {
  private _boxes: LiqBox[];

  constructor(boxes: LiqBox[]) {
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
        const height = Math.max(3, bottom - top);

        // Amber / gold — liquidity pools (stops)
        const base = "245, 158, 11";

        if (box.taken) {
          // Swept liquidity: dotted outline only
          ctx.save();
          ctx.strokeStyle = `rgba(${base}, 0.85)`;
          ctx.lineWidth = Math.max(1.5, Math.round(1.5 * hRatio));
          ctx.setLineDash([Math.round(5 * hRatio), Math.round(4 * hRatio)]);
          ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
          ctx.beginPath();
          ctx.moveTo(left, top + 0.5);
          ctx.lineTo(right, top + 0.5);
          ctx.moveTo(left, bottom + 0.5);
          ctx.lineTo(right, bottom + 0.5);
          ctx.stroke();
          ctx.restore();
        } else {
          // Active liquidity: soft filled band (same idea as confirmed OB)
          const fill = ctx.createLinearGradient(left, 0, right, 0);
          fill.addColorStop(0, `rgba(${base}, 0.34)`);
          fill.addColorStop(0.7, `rgba(${base}, 0.22)`);
          fill.addColorStop(1, `rgba(${base}, 0.06)`);
          ctx.fillStyle = fill;
          ctx.fillRect(left, top, width, height);

          ctx.strokeStyle = `rgba(${base}, 0.9)`;
          ctx.lineWidth = Math.max(1, Math.round(1.25 * hRatio));
          ctx.setLineDash([]);
          ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);

          // Label primary ahead levels only
          if (
            box.label === "R1" ||
            box.label === "R2" ||
            box.label === "S1" ||
            box.label === "S2"
          ) {
            ctx.fillStyle = `rgba(${base}, 0.95)`;
            ctx.font = `${Math.round(10 * vRatio)}px sans-serif`;
            ctx.fillText(box.label, left + 4 * hRatio, top - 3 * vRatio);
          }
        }
      }
    });
  }
}

class LiquidityPaneView implements IPrimitivePaneView {
  private _source: LiquidityPrimitive;

  constructor(source: LiquidityPrimitive) {
    this._source = source;
  }

  zOrder() {
    return "bottom" as const;
  }

  renderer() {
    return new LiquidityRenderer(this._source.boxes());
  }
}

export class LiquidityPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<"Candlestick"> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _paneView: LiquidityPaneView;
  private _levels: LevelMark[] = [];
  private _candles: CandlestickData<Time>[] = [];
  private _boxes: LiqBox[] = [];

  constructor() {
    this._paneView = new LiquidityPaneView(this);
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

  setLevels(levels: LevelMark[], candles: CandlestickData<Time>[]) {
    this._levels = levels;
    this._candles = candles;
    this._requestUpdate?.();
  }

  updateAllViews() {
    this._boxes = this._computeBoxes();
  }

  paneViews() {
    return [this._paneView];
  }

  boxes() {
    return this._boxes;
  }

  private _computeBoxes(): LiqBox[] {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series || !this._candles.length) return [];

    const timeScale = chart.timeScale();
    const lastTime = this._candles[this._candles.length - 1].time;
    const barSpacing = timeScale.options().barSpacing || 6;
    const boxes: LiqBox[] = [];

    for (const lv of this._levels) {
      if (lv.kind !== "liquidity") continue;
      if (lv.time == null || lv.top == null || lv.bottom == null) continue;

      const y1 = series.priceToCoordinate(lv.top);
      const y2 = series.priceToCoordinate(lv.bottom);
      const xStart = timeScale.timeToCoordinate(lv.time as Time);
      const xEnd = timeScale.timeToCoordinate(lastTime);
      if (y1 == null || y2 == null || xStart == null) continue;

      const x2 =
        xEnd != null ? xEnd + barSpacing * 2 : xStart + barSpacing * 24;

      boxes.push({
        x1: xStart,
        x2,
        y1,
        y2,
        label: lv.label,
        taken: Boolean(lv.taken),
      });
    }

    return boxes;
  }
}
