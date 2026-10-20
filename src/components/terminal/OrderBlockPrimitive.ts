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
import type { OrderBlockZone } from "@/lib/types";

interface ZoneBox {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  side: "bullish" | "bearish";
  confirmed: boolean;
  isCurrent: boolean;
  originX1: number;
  originX2: number;
  originY1: number;
  originY2: number;
}

function strokeDottedRect(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  color: string,
  lineWidth: number,
  dash: number[],
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
  ctx.restore();
}

class OrderBlockRenderer implements IPrimitivePaneRenderer {
  private _boxes: ZoneBox[];

  constructor(boxes: ZoneBox[]) {
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

        const isBull = box.side === "bullish";
        const base = isBull ? "34, 197, 94" : "239, 68, 68";
        const solid = isBull ? "#22c55e" : "#ef4444";

        if (!box.confirmed) {
          // Unconfirmed: dotted outline only, no fill
          strokeDottedRect(
            ctx,
            left,
            top,
            width,
            height,
            solid,
            Math.max(1.5, Math.round(1.5 * hRatio)),
            [Math.round(5 * hRatio), Math.round(4 * hRatio)],
          );

          // Dotted top & bottom rails extending right (easy to watch)
          ctx.save();
          ctx.strokeStyle = solid;
          ctx.lineWidth = Math.max(1, Math.round(1 * hRatio));
          ctx.setLineDash([Math.round(4 * hRatio), Math.round(3 * hRatio)]);
          ctx.beginPath();
          ctx.moveTo(left, top + 0.5);
          ctx.lineTo(right, top + 0.5);
          ctx.moveTo(left, bottom + 0.5);
          ctx.lineTo(right, bottom + 0.5);
          ctx.stroke();
          ctx.restore();
          continue;
        }

        // Confirmed: solid translucent fill (existing look)
        const alpha = box.isCurrent ? 0.32 : 0.16;
        const fill = ctx.createLinearGradient(left, 0, right, 0);
        fill.addColorStop(0, `rgba(${base}, ${alpha + 0.08})`);
        fill.addColorStop(0.75, `rgba(${base}, ${alpha})`);
        fill.addColorStop(1, `rgba(${base}, 0.04)`);
        ctx.fillStyle = fill;
        ctx.fillRect(left, top, width, height);

        const edge = ctx.createLinearGradient(0, top, 0, bottom);
        edge.addColorStop(0, `rgba(${base}, 0.55)`);
        edge.addColorStop(0.12, `rgba(${base}, 0.12)`);
        edge.addColorStop(0.88, `rgba(${base}, 0.12)`);
        edge.addColorStop(1, `rgba(${base}, 0.55)`);
        ctx.fillStyle = edge;
        ctx.fillRect(left, top, width, height);

        if (box.isCurrent) {
          ctx.strokeStyle = `rgba(${base}, 0.75)`;
          ctx.lineWidth = Math.max(1, Math.round(1 * hRatio));
          ctx.setLineDash([]);
          ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
        }

        const ox1 = Math.round(box.originX1 * hRatio);
        const ox2 = Math.round(box.originX2 * hRatio);
        const oy1 = Math.round(box.originY1 * vRatio);
        const oy2 = Math.round(box.originY2 * vRatio);
        const oLeft = Math.min(ox1, ox2);
        const oRight = Math.max(ox1, ox2);
        const oTop = Math.min(oy1, oy2);
        const oBottom = Math.max(oy1, oy2);
        const oW = Math.max(2, oRight - oLeft);
        const oH = Math.max(2, oBottom - oTop);

        ctx.fillStyle = isBull
          ? "rgba(148, 163, 184, 0.55)"
          : "rgba(148, 163, 184, 0.45)";
        ctx.fillRect(oLeft, oTop, oW, oH);
        ctx.strokeStyle = `rgba(${base}, 0.95)`;
        ctx.lineWidth = Math.max(1, Math.round(1.5 * hRatio));
        ctx.setLineDash([]);
        ctx.strokeRect(oLeft + 0.5, oTop + 0.5, oW - 1, oH - 1);
      }
    });
  }
}

class OrderBlockPaneView implements IPrimitivePaneView {
  private _source: OrderBlockPrimitive;

  constructor(source: OrderBlockPrimitive) {
    this._source = source;
  }

  zOrder() {
    return "bottom" as const;
  }

  renderer() {
    return new OrderBlockRenderer(this._source.boxes());
  }
}

export class OrderBlockPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<"Candlestick"> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _paneView: OrderBlockPaneView;
  private _zones: OrderBlockZone[] = [];
  private _candles: CandlestickData<Time>[] = [];
  private _boxes: ZoneBox[] = [];

  constructor() {
    this._paneView = new OrderBlockPaneView(this);
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

  setZones(zones: OrderBlockZone[], candles: CandlestickData<Time>[]) {
    this._zones = zones;
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

  private _computeBoxes(): ZoneBox[] {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series || !this._zones.length || !this._candles.length) {
      return [];
    }

    const timeScale = chart.timeScale();
    const lastTime = this._candles[this._candles.length - 1].time;
    const barSpacing = timeScale.options().barSpacing || 6;
    const boxes: ZoneBox[] = [];
    const sorted = [...this._zones].sort((a, b) => a.time - b.time);

    for (let i = 0; i < sorted.length; i++) {
      const z = sorted[i];
      const y1 = series.priceToCoordinate(z.top);
      const y2 = series.priceToCoordinate(z.bottom);
      const xStart = timeScale.timeToCoordinate(z.time as Time);
      // Each OB/zone only spans until the next setup (interval), not full day
      const endTime = sorted[i + 1]?.time ?? lastTime;
      const xEnd = timeScale.timeToCoordinate(endTime as Time);

      if (y1 == null || y2 == null || xStart == null) continue;

      const x2 =
        xEnd != null
          ? Math.max(xEnd, xStart + barSpacing)
          : xStart + barSpacing * 12;

      const half = barSpacing * 0.35;

      boxes.push({
        x1: xStart,
        x2,
        y1,
        y2,
        side: z.side,
        confirmed: z.confirmed,
        isCurrent: z.isCurrent,
        originX1: xStart - half,
        originX2: xStart + half,
        originY1: y1,
        originY2: y2,
      });
    }

    return boxes;
  }
}
