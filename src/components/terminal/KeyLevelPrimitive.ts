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

interface Seg {
  x1: number;
  x2: number;
  y: number;
  label: string;
  isCurrent: boolean;
}

class KeyLevelRenderer implements IPrimitivePaneRenderer {
  private _segs: Seg[];

  constructor(segs: Seg[]) {
    this._segs = segs;
  }

  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hRatio = scope.horizontalPixelRatio;
      const vRatio = scope.verticalPixelRatio;

      for (const seg of this._segs) {
        const x1 = Math.round(seg.x1 * hRatio);
        const x2 = Math.round(seg.x2 * hRatio);
        const y = Math.round(seg.y * vRatio);
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        if (right - left < 2) continue;

        ctx.save();
        ctx.strokeStyle = seg.isCurrent
          ? "rgba(245, 158, 11, 0.95)"
          : "rgba(245, 158, 11, 0.45)";
        ctx.lineWidth = Math.max(
          seg.isCurrent ? 2 : 1,
          Math.round((seg.isCurrent ? 2 : 1) * hRatio),
        );
        ctx.setLineDash(
          seg.isCurrent
            ? []
            : [Math.round(4 * hRatio), Math.round(3 * hRatio)],
        );
        ctx.beginPath();
        ctx.moveTo(left, y + 0.5);
        ctx.lineTo(right, y + 0.5);
        ctx.stroke();

        if (seg.isCurrent) {
          ctx.fillStyle = "rgba(245, 158, 11, 0.95)";
          ctx.font = `bold ${Math.round(11 * vRatio)}px sans-serif`;
          ctx.fillText(seg.label, left + 4 * hRatio, y - 4 * vRatio);
        }
        ctx.restore();
      }
    });
  }
}

class KeyLevelPaneView implements IPrimitivePaneView {
  private _source: KeyLevelPrimitive;

  constructor(source: KeyLevelPrimitive) {
    this._source = source;
  }

  zOrder() {
    return "normal" as const;
  }

  renderer() {
    return new KeyLevelRenderer(this._source.segs());
  }
}

/** Draws S1/R1/R2 (bull) or R1/S1/S2 (bear) as time-bounded amber segments. */
export class KeyLevelPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<"Candlestick"> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _paneView: KeyLevelPaneView;
  private _levels: LevelMark[] = [];
  private _candles: CandlestickData<Time>[] = [];
  private _segs: Seg[] = [];

  constructor() {
    this._paneView = new KeyLevelPaneView(this);
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
    this._segs = this._compute();
  }

  paneViews() {
    return [this._paneView];
  }

  segs() {
    return this._segs;
  }

  /** Keep R1/R2 / S1/S2 inside the visible price scale so they aren't clipped. */
  autoscaleInfo() {
    const prices = this._levels
      .filter((l) =>
        l.kind === "invalidation" ||
        l.kind === "support" ||
        l.kind === "resistance",
      )
      .map((l) => l.price)
      .filter((p) => Number.isFinite(p));
    if (!prices.length) return null;
    return {
      priceRange: {
        minValue: Math.min(...prices),
        maxValue: Math.max(...prices),
      },
    };
  }

  private _compute(): Seg[] {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series || !this._candles.length) return [];

    const timeScale = chart.timeScale();
    const lastTime = this._candles[this._candles.length - 1].time;
    const barSpacing = timeScale.options().barSpacing || 6;
    const out: Seg[] = [];

    const drawable = new Set(["invalidation", "support", "resistance"]);
    for (const lv of this._levels) {
      if (!drawable.has(lv.kind) || lv.time == null) continue;
      const y = series.priceToCoordinate(lv.price);
      const x1 = timeScale.timeToCoordinate(lv.time as Time);
      const end = (lv.endTime ?? (lastTime as number)) as Time;
      const xEnd = timeScale.timeToCoordinate(end);
      if (y == null || x1 == null) continue;

      const x2 = xEnd != null ? xEnd : x1 + barSpacing * 8;

      out.push({
        x1,
        x2: Math.max(x2, x1 + barSpacing),
        y,
        label: lv.label,
        isCurrent: Boolean(lv.isCurrent),
      });
    }

    return out;
  }
}
