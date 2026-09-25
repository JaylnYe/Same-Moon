"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CITIES, findCity, type Place } from "@/data/cities";
import { findSharedMoonWindow, formatDuration, formatLocal, moonPosition, type SharedMoonResult } from "@/lib/astronomy";

type Stage = "setup" | "searching" | "result" | "compose";
type Side = "me" | "them";
type RecordShareState = "idle" | "sharing" | "copied";

type GeocodingResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  country?: string;
  admin1?: string;
  feature_code?: string;
  population?: number;
};

const citySearchCache = new Map<string, Place[]>();

const QUOTE_PRESETS = [
  { text: "但愿人长久，千里共婵娟。", author: "苏轼《水调歌头》" },
  { text: "海上生明月，天涯共此时。", author: "张九龄《望月怀远》" },
  { text: "今人不见古时月，今月曾经照古人。", author: "李白《把酒问月》" },
  { text: "露从今夜白，月是故乡明。", author: "杜甫《月夜忆舍弟》" },
  { text: "愿这一轮月光，照见归途，也照见团圆。", author: "中秋寄语" },
] as const;

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const moonHeight = (altitude: number) => 54 - clamp01((altitude + 1.5) / 34) * 238;
const horizonReveal = (altitude: number) => 100 - clamp01((altitude + 1.5) / 4.5) * 100;
const signedAngleDelta = (from: number, to: number) => ((to - from + 540) % 360) - 180;

function Cloud({ className = "" }: { className?: string }) {
  return <span className={`cloud ${className}`} aria-hidden="true"><i /><b /></span>;
}

function Tree({ className = "" }: { className?: string }) {
  return <span className={`tree ${className}`} aria-hidden="true"><i /><b /><em /></span>;
}

function WindowPortal({ side, place, onClick }: { side: Side; place: Place | null; onClick: () => void }) {
  const isMe = side === "me";
  return (
    <div className={`window-wrap window-${side}`}>
      <button
        type="button"
        className={`window-portal ${place ? "is-lit" : ""}`}
        onClick={onClick}
        aria-label={`${isMe ? "选择我的城市" : "选择 TA 的城市"}${place ? `，已选 ${place.name}` : ""}`}
      >
        <span className="room-glow" />
        <span className="curtain curtain-left" />
        <span className="curtain curtain-right" />
        <span className="window-view">
          <i className="distant-roofs" /><i className="distant-lights" />
          <b className="window-cross window-cross-v" /><b className="window-cross window-cross-h" />
        </span>
        <span className="window-sill"><i /></span>
        <span className="window-tap">{place ? "轻触更换城市" : "轻触点亮窗灯"}</span>
      </button>
      <button type="button" className="place-label" onClick={onClick}>
        <small>{isMe ? "我在" : "TA 在"}</small>
        <strong>{place?.name ?? "还未点亮"}</strong>
        <span>{place ? `${place.country} · ${place.englishName}` : isMe ? "选择我的城市" : "选择 TA 的城市"}</span>
      </button>
    </div>
  );
}

function CityPicker({ side, current, onPick, onClose }: { side: Side; current: Place | null; onPick: (city: Place) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return CITIES;
    return CITIES.filter((city) => `${city.name} ${city.englishName} ${city.country} ${city.aliases}`.toLowerCase().includes(normalized));
  }, [query]);

  return (
    <div className="picker-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="city-picker" role="dialog" aria-modal="true" aria-labelledby="city-picker-title">
        <div className="picker-heading">
          <div>
            <span>{side === "me" ? "左边的窗" : "右边的窗"}</span>
            <h2 id="city-picker-title">{side === "me" ? "你在哪座城市？" : "TA 在哪座城市？"}</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索城市中文名或英文名" />
        </label>
        <div className="city-grid">
          {filtered.map((city) => (
            <button key={city.id} type="button" className={current?.id === city.id ? "selected" : ""} onClick={() => onPick(city)}>
              <span><strong>{city.name}</strong><small>{city.country}</small></span>
              <em>{city.englishName}</em>
            </button>
          ))}
          {!filtered.length && <p className="empty-city">这一版还没有收录这座城市，试试附近的城市吧。</p>}
        </div>
      </section>
    </div>
  );
}

function Moon({ phase = 0.5, large = false }: { phase?: number; large?: boolean }) {
  const shadowDirection = phase < 0.5 ? 1 : -1;
  const distanceFromFull = Math.abs(phase - 0.5) * 2;
  const shadowShift = shadowDirection * (30 + distanceFromFull * 62);
  return (
    <div className={`moon ${large ? "moon-large" : ""}`} style={{ "--moon-shadow-x": `${shadowShift}%`, "--moon-shadow-opacity": `${0.18 + distanceFromFull * 0.74}` } as React.CSSProperties} aria-hidden="true">
      <span />
    </div>
  );
}

function formatDate(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(value);
}

function canvasLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const characters = Array.from(text);
  const lines: string[] = [];
  let line = "";
  characters.forEach((character) => {
    const next = line + character;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function isSharePlace(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false;
  const place = value as Partial<Place>;
  if (typeof place.id !== "string" || typeof place.name !== "string" || typeof place.englishName !== "string" || typeof place.country !== "string" || typeof place.timezone !== "string") return false;
  if (typeof place.latitude !== "number" || !Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90) return false;
  if (typeof place.longitude !== "number" || !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180) return false;
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: place.timezone }).format();
  } catch {
    return false;
  }
  return true;
}

function LegacyExperience() {
  const [stage, setStage] = useState<Stage>("setup");
  const [me, setMe] = useState<Place | null>(null);
  const [them, setThem] = useState<Place | null>(null);
  const [date] = useState(today);
  const [selecting, setSelecting] = useState<Side | null>(null);
  const [result, setResult] = useState<SharedMoonResult | null>(null);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [message, setMessage] = useState("我们看到的月亮有一点不同，但确实是同一轮。");
  const [signature, setSignature] = useState("");
  const [copied, setCopied] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "saving" | "saved" | "sharing">("idle");
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    const raw = window.location.hash.slice(1);
    if (!raw.startsWith("moon=")) return;
    try {
      const state = JSON.parse(decodeURIComponent(atob(raw.slice(5))));
      const from = findCity(state.from);
      const to = findCity(state.to);
      if (!from || !to || typeof state.date !== "string") return;
      const restoredResult = findSharedMoonWindow(from, to, state.date);
      Promise.resolve().then(() => {
        setMe(from);
        setThem(to);
        setDate(state.date);
        setQuoteIndex(typeof state.quoteIndex === "number" && QUOTE_PRESETS[state.quoteIndex] ? state.quoteIndex : 0);
        setMessage(typeof state.message === "string" ? state.message.slice(0, 90) : message);
        setSignature(typeof state.signature === "string" ? state.signature.slice(0, 18) : "");
        setResult(restoredResult);
        setStage("compose");
      });
    } catch {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const canSearch = Boolean(me && them && date);

  function pickCity(city: Place) {
    if (selecting === "me") setMe(city);
    if (selecting === "them") setThem(city);
    setSelecting(null);
  }

  function startSearch() {
    if (!me || !them) return;
    setStage("searching");
    const computed = findSharedMoonWindow(me, them, date);
    window.setTimeout(() => {
      setResult(computed);
      setStage("result");
    }, 2100);
  }

  async function copyShareLink() {
    if (!me || !them || !result) return;
    const state = btoa(encodeURIComponent(JSON.stringify({ from: me.id, to: them.id, date, quoteIndex, message, signature })));
    const url = `${window.location.origin}${window.location.pathname}#moon=${state}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.hash = `moon=${state}`;
      setCopied(true);
    }
  }

  function renderPostcard() {
    if (!me || !them || !result) return Promise.reject(new Error("Card data is incomplete"));
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1440;
    const context = canvas.getContext("2d");
    if (!context) return Promise.reject(new Error("Canvas is unavailable"));

    const sky = context.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#062b72");
    sky.addColorStop(.55, "#073f9b");
    sky.addColorStop(1, "#041b4a");
    context.fillStyle = sky;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "rgba(255,239,198,.22)";
    context.lineWidth = 2;
    context.strokeRect(52, 52, canvas.width - 104, canvas.height - 104);
    context.strokeStyle = "rgba(255,239,198,.09)";
    context.strokeRect(66, 66, canvas.width - 132, canvas.height - 132);

    context.textAlign = "left";
    context.fillStyle = "rgba(255,251,238,.9)";
    context.font = "600 30px 'Songti SC', serif";
    context.fillText("共 月", 92, 118);
    context.fillStyle = "rgba(255,251,238,.48)";
    context.font = "500 15px Arial, sans-serif";
    context.letterSpacing = "4px";
    context.fillText("SAME MOON", 834, 116);
    context.letterSpacing = "0px";

    const moonX = 540;
    const moonY = 320;
    for (let radius = 250; radius > 150; radius -= 18) {
      context.beginPath();
      context.arc(moonX, moonY, radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(151, 205, 235, ${Math.max(0, .012 + (250 - radius) * .0005)})`;
      context.fill();
    }
    const moonGradient = context.createRadialGradient(moonX - 54, moonY - 72, 20, moonX, moonY, 158);
    moonGradient.addColorStop(0, "#fff9dc");
    moonGradient.addColorStop(.7, "#ffe6a7");
    moonGradient.addColorStop(1, "#e9bd68");
    context.beginPath();
    context.arc(moonX, moonY, 156, 0, Math.PI * 2);
    context.fillStyle = moonGradient;
    context.shadowColor = "rgba(255,226,150,.6)";
    context.shadowBlur = 64;
    context.fill();
    context.shadowBlur = 0;
    [[486, 286, 25], [590, 350, 34], [522, 397, 18], [610, 260, 14]].forEach(([x, y, radius]) => {
      context.beginPath();
      context.ellipse(x, y, radius, radius * .58, -.2, 0, Math.PI * 2);
      context.fillStyle = "rgba(181,136,76,.12)";
      context.fill();
    });

    context.textAlign = "center";
    context.fillStyle = "rgba(255,251,238,.56)";
    context.font = "500 22px Arial, sans-serif";
    context.fillText(formatDate(date), 540, 565);
    context.fillStyle = "#fffaf0";
    context.font = "500 54px 'Songti SC', serif";
    context.fillText(`${me.name}  ·  ${them.name}`, 540, 642);
    context.fillStyle = "rgba(255,251,238,.52)";
    context.font = "400 20px 'Songti SC', serif";
    context.fillText(`我们相隔约 ${roundedDistance.toLocaleString()} 公里`, 540, 690);

    context.strokeStyle = "rgba(255,239,198,.25)";
    context.beginPath();
    context.moveTo(420, 754);
    context.lineTo(660, 754);
    context.stroke();

    const quote = QUOTE_PRESETS[quoteIndex];
    context.fillStyle = "#fffaf0";
    context.font = "500 38px 'Songti SC', serif";
    const quoteLines = canvasLines(context, quote.text, 760);
    quoteLines.forEach((line, index) => context.fillText(line, 540, 840 + index * 62));
    context.fillStyle = "rgba(255,251,238,.46)";
    context.font = "400 19px 'Songti SC', serif";
    context.fillText(`— ${quote.author}`, 540, 840 + quoteLines.length * 62 + 12);

    context.fillStyle = "rgba(255,251,238,.84)";
    context.font = "400 27px 'Songti SC', serif";
    const messageLines = canvasLines(context, message || "我们看到的月亮有一点不同，但确实是同一轮。", 720);
    const messageY = 1050;
    messageLines.slice(0, 3).forEach((line, index) => context.fillText(line, 540, messageY + index * 48));
    if (signature) {
      context.fillStyle = "rgba(255,251,238,.6)";
      context.font = "400 22px 'Songti SC', serif";
      context.fillText(`— ${signature}`, 540, messageY + Math.min(messageLines.length, 3) * 48 + 25);
    }

    context.textAlign = "left";
    context.fillStyle = "rgba(255,251,238,.38)";
    context.font = "400 15px Arial, sans-serif";
    context.fillText(`${formatLocal(result.start, me)}  ${me.name}   ·   ${formatLocal(result.start, them)}  ${them.name}`, 92, 1345);
    context.textAlign = "right";
    context.fillText(`MOON ILLUMINATION ${Math.round(result.illumination * 100)}%`, 988, 1345);

    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Card export failed")), "image/png", 1));
  }

  async function downloadPostcard() {
    if (!me || !them) return;
    setExportState("saving");
    try {
      const blob = await renderPostcard();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `共月-${me.name}-${them.name}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
      setExportState("saved");
      window.setTimeout(() => setExportState("idle"), 1800);
    } catch {
      setExportState("idle");
    }
  }

  async function sharePostcard() {
    if (!me || !them) return;
    setExportState("sharing");
    try {
      const blob = await renderPostcard();
      const file = new File([blob], `共月-${me.name}-${them.name}.png`, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "共月 / Same Moon", text: `从 ${me.name} 到 ${them.name}，我们看的是同一轮月亮。`, files: [file] });
      } else {
        await downloadPostcard();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setExportState("idle");
      else await copyShareLink();
    } finally {
      window.setTimeout(() => setExportState("idle"), 800);
    }
  }

  function restart() {
    setStage("setup");
    setResult(null);
    setCopied(false);
    setExportState("idle");
    window.history.replaceState(null, "", window.location.pathname);
  }

  const shared = result?.kind === "shared";
  const roundedDistance = result ? Math.round(result.distanceKm / 10) * 10 : 0;

  return (
    <main className={`same-moon-app stage-${stage}`}>
      <header className="site-header">
        <button type="button" className="wordmark" onClick={restart} aria-label="回到开始">
          <span>共月</span><i /> <small>SAME MOON</small>
        </button>
        <button type="button" className="about-link" onClick={() => setShowAbout(true)}>关于这轮月亮 <span>↗</span></button>
      </header>

      <section className="night-scene">
        <div className="paper-grain" aria-hidden="true" />
        <Cloud className="cloud-one" />
        <Cloud className="cloud-two" />
        <Tree className="tree-left" />
        <Tree className="tree-right" />

        {stage === "setup" && (
          <>
            <div className="setup-moon"><Moon /></div>
            <div className="setup-copy">
              <p className="eyebrow">LOOK THROUGH THE SAME NIGHT</p>
              <h1>想从你的窗户，<br />看同一轮月亮吗？</h1>
              <p className="intro">让两扇相隔很远的窗，在今晚望向同一处月光。</p>
            </div>
            <div className={`moon-path ${me && them ? "is-complete" : ""}`} aria-hidden="true"><i /><b /></div>
          </>
        )}

        {stage === "searching" && me && them && (
          <div className="searching-state" role="status" aria-live="polite">
            <div className="orbit"><span /></div>
            <p>正在顺着今晚的天空，<br />寻找两地都能看见它的时刻……</p>
            <small>{me.name} · {them.name}</small>
          </div>
        )}

        {(stage === "result" || stage === "compose") && result && me && them && (
          <div className="result-sky">
            <Moon phase={result.phase} large={stage === "compose"} />
            <div className="result-copy">
              <p className="eyebrow">{shared ? "WE FOUND IT" : "MOON RELAY"}</p>
              <h1>{shared ? <>但愿人长久，<br />千里共婵娟。</> : <>今晚，它会先经过这里，<br />再去往 TA 那里。</>}</h1>
              {stage === "result" && (
                <p className="result-line">
                  {shared ? `从 ${formatLocal(result.start, me)} 开始，月亮同时经过你们的天空。` : "这一天没有长于 15 分钟的共同可见窗口，但仍然可以把这轮月亮寄给 TA。"}
                </p>
              )}
            </div>
          </div>
        )}

        {stage !== "compose" && (
          <div className="ground-scene" aria-hidden="true">
            <span className="ground ground-left" /><span className="ground ground-right" />
          </div>
        )}

        {stage === "setup" && (
          <>
            <WindowPortal side="me" place={me} onClick={() => setSelecting("me")} />
            <WindowPortal side="them" place={them} onClick={() => setSelecting("them")} />
            <div className="setup-controls">
              <label className="date-control">
                <span>选择一天</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <button type="button" className="moon-button" disabled={!canSearch} onClick={startSearch}>
                <span>{canSearch ? "寻找共同观月时刻" : "请先点亮两扇窗"}</span><i>→</i>
              </button>
            </div>
          </>
        )}

        {stage === "result" && result && me && them && (
          <section className="result-card" aria-label="共同观月结果">
            <div className="time-column">
              <span>我在 · {me.name}</span>
              <strong>{formatLocal(result.start, me)}</strong>
              <small>{formatLocal(result.start, me, true)} · 月亮高度 {Math.round(result.altitudeA)}°</small>
            </div>
            <div className="connection-line"><i /><span>{shared ? formatDuration(result.start, result.end) : `约 ${roundedDistance.toLocaleString()} km`}</span><i /></div>
            <div className="time-column time-right">
              <span>TA 在 · {them.name}</span>
              <strong>{formatLocal(result.start, them)}</strong>
              <small>{formatLocal(result.start, them, true)} · 月亮高度 {Math.round(result.altitudeB)}°</small>
            </div>
            <div className="result-meta">
              <span>两地相距 <b>约 {roundedDistance.toLocaleString()} km</b></span>
              <span>月面照明 <b>{Math.round(result.illumination * 100)}%</b></span>
              <span>观测条件 <b>{result.skyLabel}</b></span>
            </div>
            <p className="visibility-note">可见时间根据月亮位置计算，实际观测还会受到天气和周围遮挡影响。</p>
            <div className="result-actions">
              <button type="button" className="text-button" onClick={restart}>换两座城市</button>
              <button type="button" className="moon-button" onClick={() => setStage("compose")}><span>把这轮月亮寄给 TA</span><i>→</i></button>
            </div>
          </section>
        )}

        {stage === "compose" && result && me && them && (
          <section className="composer">
            <div className="postcard" aria-label="共月卡片预览">
              <p className="card-mark">共月 <span>/ SAME MOON</span></p>
              <div className="card-moon"><Moon phase={result.phase} /></div>
              <time>{formatDate(date)}</time>
              <h2>{me.name} <i /> {them.name}</h2>
              <p className="card-distance">我们相隔约 {roundedDistance.toLocaleString()} 公里</p>
              <blockquote>{QUOTE_PRESETS[quoteIndex].text}<cite>— {QUOTE_PRESETS[quoteIndex].author}</cite></blockquote>
              <p className="card-message">{message || "我们看到的月亮有一点不同，但确实是同一轮。"}</p>
              {signature && <p className="card-signature">— {signature}</p>}
              <div className="card-foot"><span>{formatLocal(result.start, me)} · {formatLocal(result.start, them)}</span><span>MOON ILLUMINATION {Math.round(result.illumination * 100)}%</span></div>
            </div>
            <div className="compose-panel">
              <p className="eyebrow">SEND THE MOON</p>
              <h1>把今晚的月光，<br />寄到 TA 的窗前。</h1>
              <div className="quote-field">
                <span>选一句放在月光下的话</span>
                <div className="quote-options">
                  {QUOTE_PRESETS.map((quote, index) => (
                    <button key={quote.text} type="button" className={quoteIndex === index ? "selected" : ""} onClick={() => setQuoteIndex(index)}>
                      <strong>{quote.text}</strong><small>{quote.author}</small>
                    </button>
                  ))}
                </div>
              </div>
              <label><span>写给 TA 的一句话 <small>{message.length}/90</small></span><textarea value={message} maxLength={90} rows={4} onChange={(event) => setMessage(event.target.value)} /></label>
              <label><span>落款 <small>{signature.length}/18</small></span><input value={signature} maxLength={18} onChange={(event) => setSignature(event.target.value)} placeholder="你的名字" /></label>
              <div className="delivery-actions">
                <button type="button" className="moon-button save-button" onClick={downloadPostcard}><span>{exportState === "saving" ? "正在制作……" : exportState === "saved" ? "已保存卡片" : "保存到相册"}</span><i>{exportState === "saved" ? "✓" : "↓"}</i></button>
                <button type="button" className="moon-button share-button" onClick={sharePostcard}><span>{exportState === "sharing" ? "正在唤起分享……" : "转发给 TA"}</span><i>↗</i></button>
              </div>
              <button type="button" className="copy-link-button" onClick={copyShareLink}>{copied ? "链接已复制 ✓" : "或复制可回放这轮月亮的链接"}</button>
              <button type="button" className="back-result" onClick={() => setStage("result")}>← 回到观月时刻</button>
              <p className="prototype-note">支持导出 1080 × 1440 PNG；手机支持时会直接打开系统分享面板。</p>
            </div>
          </section>
        )}
      </section>

      {selecting && <CityPicker side={selecting} current={selecting === "me" ? me : them} onPick={pickCity} onClose={() => setSelecting(null)} />}

      {showAbout && (
        <div className="picker-backdrop about-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowAbout(false)}>
          <section className="about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
            <button type="button" className="close-button" onClick={() => setShowAbout(false)} aria-label="关闭">×</button>
            <p className="eyebrow">ABOUT THIS MOON</p>
            <h2 id="about-title">同一轮月亮，<br />两个不同的天空。</h2>
            <p>首页的月亮是“共月”的象征，不代表它在两地具有相同的高度或方向。结果里的双地时间、月亮高度和照明比例均使用真实天文位置计算。</p>
            <p>“同时可见”指同一个真实时刻，月亮在两地都高于地平线 2°，不包含天气、建筑与雾霾影响。</p>
          </section>
        </div>
      )}
    </main>
  );
}

function LocationSearch({
  side,
  value,
  onChoose,
  onBack,
}: {
  side: Side;
  value: Place | null;
  onChoose: (place: Place) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const [remoteMatches, setRemoteMatches] = useState<Place[]>([]);
  const [isSearchingCities, setIsSearchingCities] = useState(false);
  const [locationSearchNote, setLocationSearchNote] = useState("");
  const localMatches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return CITIES.slice(0, 6);
    return CITIES.filter((city) =>
      `${city.name} ${city.englishName} ${city.country} ${city.aliases}`.toLowerCase().includes(normalized),
    ).slice(0, 6);
  }, [query]);

  useEffect(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) {
      setRemoteMatches([]);
      setIsSearchingCities(false);
      setLocationSearchNote("");
      return;
    }
    const cached = citySearchCache.get(normalized);
    if (cached?.length) {
      setRemoteMatches(cached);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearchingCities(true);
      setLocationSearchNote("");
      try {
        const searchText = query.trim();
        const isChinese = /[\u3400-\u9fff]/.test(searchText);
        const candidates = isChinese && !/[市县区]$/.test(searchText)
          ? [searchText, `${searchText}市`]
          : [searchText];
        const payloads = await Promise.all(candidates.map(async (candidate) => {
          const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(candidate)}&count=8&language=zh&format=json`, { signal: controller.signal });
          if (!response.ok) throw new Error("city search failed");
          return response.json() as Promise<{ results?: GeocodingResult[] }>;
        }));
        const rawResults = payloads.flatMap((payload) => payload.results ?? []);
        const cityResults = rawResults
          .filter((item): item is GeocodingResult & { timezone: string } => Boolean(item.timezone) && /^PPL/.test(item.feature_code ?? ""))
          .sort((one, two) => {
            const rank = (item: GeocodingResult) => item.feature_code === "PPLC" ? 0 : item.feature_code?.startsWith("PPLA") ? 1 : 2;
            return rank(one) - rank(two) || (two.population ?? 0) - (one.population ?? 0);
          });
        const places = cityResults.map((item) => ({
          id: `geo-${item.id}`,
          name: item.name,
          englishName: [item.admin1, item.country].filter(Boolean).join(" · ") || item.name,
          country: item.country ?? "",
          latitude: item.latitude,
          longitude: item.longitude,
          timezone: item.timezone,
          aliases: `${item.name} ${item.admin1 ?? ""} ${item.country ?? ""}`,
        }));
        if (!places.length && rawResults.some((item) => item.feature_code === "PCLI")) {
          setLocationSearchNote("请输入城市名，不要输入国家名。例如：奥克兰。");
        }
        if (places.length) citySearchCache.set(normalized, places);
        else citySearchCache.delete(normalized);
        setRemoteMatches(places);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRemoteMatches([]);
          setLocationSearchNote("城市检索暂时不可用，请稍后再试。");
        }
      } finally {
        if (!controller.signal.aborted) setIsSearchingCities(false);
      }
    }, 360);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const matches = useMemo(() => {
    const seen = new Set<string>();
    return [...localMatches, ...remoteMatches].filter((city) => {
      const key = `${city.country}-${city.timezone}-${city.latitude.toFixed(1)}-${city.longitude.toFixed(1)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }, [localMatches, remoteMatches]);

  return (
    <div className={`focus-editor focus-editor-${side}`}>
      <button type="button" className="focus-back" onClick={onBack}>← 返回夜色</button>
      <p>{side === "me" ? "这里是" : "TA 在"}</p>
      <div className="focus-place-name">{value?.name ?? (side === "me" ? "我的城市" : "另一座城市")}</div>
      {value && <small className="focus-place-region">{value.englishName}{value.country && !value.englishName.includes(value.country) ? ` · ${value.country}` : ""}</small>}
      <label className="inline-location-search">
        <span>更换地点</span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入城市名"
          aria-label={side === "me" ? "搜索我的城市" : "搜索 TA 的城市"}
        />
      </label>
      <div className="inline-location-results">
        {matches.map((city) => (
          <button key={city.id} type="button" onClick={() => onChoose(city)}>
            <strong>{city.name}</strong><span>{city.englishName}{city.country && !city.englishName.includes(city.country) ? ` · ${city.country}` : ""}</span>
          </button>
        ))}
        {query.trim().length >= 2 && isSearchingCities && <p className="location-search-status">正在寻找更多城市……</p>}
        {query.trim().length >= 2 && !isSearchingCities && matches.length === 0 && <p className="location-search-status">{locationSearchNote || "没有找到，试试输入完整城市名。"}</p>}
      </div>
    </div>
  );
}

function DateWheelColumn({
  label,
  values,
  selected,
  format,
  onSelect,
}: {
  label: string;
  values: number[];
  selected: number;
  format: (value: number) => string;
  onSelect: (value: number) => void;
}) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const settleRef = useRef<number | null>(null);
  const dragRef = useRef({ active: false, y: 0, top: 0, moved: false, time: 0, velocity: 0 });
  const itemHeight = 34;

  useEffect(() => {
    const index = Math.max(0, values.indexOf(selected));
    wheelRef.current?.scrollTo({ top: index * itemHeight, behavior: "smooth" });
  }, [selected, values]);

  return (
    <div className="date-wheel-column">
      <span>{label}</span>
      <div
        ref={wheelRef}
        className="date-wheel-scroll"
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onPointerDown={(event) => {
          const wheel = event.currentTarget;
          dragRef.current = { active: true, y: event.clientY, top: wheel.scrollTop, moved: false, time: performance.now(), velocity: 0 };
          wheel.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag.active) return;
          const now = performance.now();
          const delta = event.clientY - drag.y;
          if (Math.abs(delta) > 3) drag.moved = true;
          drag.velocity = (event.clientY - drag.y) / Math.max(1, now - drag.time);
          event.currentTarget.scrollTop = drag.top - delta;
          drag.time = now;
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (!drag.active) return;
          drag.active = false;
          const wheel = event.currentTarget;
          const projected = wheel.scrollTop - drag.velocity * 110;
          const index = Math.max(0, Math.min(values.length - 1, Math.round(projected / itemHeight)));
          wheel.scrollTo({ top: index * itemHeight, behavior: "smooth" });
          onSelect(values[index]);
        }}
        onPointerCancel={() => { dragRef.current.active = false; }}
        onScroll={(event) => {
          if (settleRef.current) window.clearTimeout(settleRef.current);
          const top = event.currentTarget.scrollTop;
          settleRef.current = window.setTimeout(() => {
            const index = Math.max(0, Math.min(values.length - 1, Math.round(top / itemHeight)));
            onSelect(values[index]);
          }, 90);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const index = Math.max(0, values.indexOf(selected));
          const next = Math.max(0, Math.min(values.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
          onSelect(values[next]);
        }}
      >
        {values.map((value) => (
          <button key={value} type="button" role="option" aria-selected={value === selected} onClick={() => { if (!dragRef.current.moved) onSelect(value); }}>{format(value)}</button>
        ))}
      </div>
    </div>
  );
}

function DateWheel({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [year, month, day] = value.split("-").map(Number);
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 11 }, (_, index) => currentYear - 5 + index), [currentYear]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1), []);
  const days = useMemo(() => Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => index + 1), [year, month]);
  const update = (nextYear: number, nextMonth: number, nextDay: number) => {
    const safeDay = Math.min(nextDay, new Date(nextYear, nextMonth, 0).getDate());
    onChange(`${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`);
  };

  return (
    <div className="date-wheel" aria-label="选择观月日期">
      <i aria-hidden="true" />
      <DateWheelColumn label="年" values={years} selected={year} format={(item) => `${item}`} onSelect={(item) => update(item, month, day)} />
      <DateWheelColumn label="月" values={months} selected={month} format={(item) => String(item).padStart(2, "0")} onSelect={(item) => update(year, item, day)} />
      <DateWheelColumn label="日" values={days} selected={day} format={(item) => String(item).padStart(2, "0")} onSelect={(item) => update(year, month, item)} />
    </div>
  );
}

function MoonRecordArtwork({ phase, illumination = 1, mobileArtDirection = false, includeReflection = false, showAstronomyOverlay = false, widePreview = false }: { phase: number; illumination?: number; mobileArtDirection?: boolean; includeReflection?: boolean; showAstronomyOverlay?: boolean; widePreview?: boolean }) {
  const distance = Math.abs(phase - .5) * 2;
  const direction = phase < .5 ? 1 : -1;
  const shadowOffset = direction * illumination * 112;
  return (
    <div className="moon-record-artwork" aria-hidden="true">
      {(["background", "clouds", ...(includeReflection ? ["reflection"] as const : []), ...(!widePreview ? ["moon"] as const : [])] as const).map((layer) => (
        <picture className={`moon-record-layer moon-record-${layer}`} key={layer}>
          {mobileArtDirection && <source media="(max-width: 600px)" srcSet={layer === "background" ? "/scenes/moon-record/background-mobile-complete.png" : `/scenes/moon-record/${layer}-mobile.png`} />}
          <img src={`/scenes/moon-record/${layer}-desktop.png`} alt="" />
        </picture>
      ))}
      {widePreview && <img className="moon-record-preview-moon" src="/scenes/shared-moon/moon-surface.png" alt="" />}
      {showAstronomyOverlay && <svg className="moon-record-orbit moon-record-orbit-desktop" viewBox="0 0 1440 900" preserveAspectRatio="none"><path d="M 235 432 Q 670 92 1055 170" /></svg>}
      {showAstronomyOverlay && <svg className="moon-record-orbit moon-record-orbit-mobile" viewBox="0 0 390 844" preserveAspectRatio="none"><path d="M 0 202 Q 142 82 302 126" /></svg>}
      {showAstronomyOverlay && illumination < .975 && <span className="moon-record-phase" style={{ "--record-shadow-x": `${shadowOffset}%`, "--record-shadow-opacity": `${.66 + distance * .16}` } as React.CSSProperties} />}
    </div>
  );
}

export default function VisualLanding() {
  const [visualStep, setVisualStep] = useState<"places" | "timeline">("places");
  const [focus, setFocus] = useState<Side | null>(null);
  const [hovered, setHovered] = useState<Side | null>(null);
  const [me, setMe] = useState<Place | null>(null);
  const [them, setThem] = useState<Place | null>(null);
  const [narrationVisible, setNarrationVisible] = useState(false);
  const [date, setDate] = useState(today);
  const [isChoosingDate, setIsChoosingDate] = useState(false);
  const [isConfirmingDate, setIsConfirmingDate] = useState(false);
  const [hasChosenDate, setHasChosenDate] = useState(false);
  const [isEnteringNight, setIsEnteringNight] = useState(false);
  const [nightOpeningStage, setNightOpeningStage] = useState<"atmosphere" | "question">("atmosphere");
  const [searchResult, setSearchResult] = useState<SharedMoonResult | null>(null);
  const [nightProgress, setNightProgress] = useState(0);
  const [isMovingNight, setIsMovingNight] = useState(false);
  const [showDragHint, setShowDragHint] = useState(false);
  const [canApproachMoon, setCanApproachMoon] = useState(false);
  const [showApproachHint, setShowApproachHint] = useState(false);
  const [hasApproachedMoon, setHasApproachedMoon] = useState(false);
  const [isCloseup, setIsCloseup] = useState(false);
  const [isFrame9, setIsFrame9] = useState(false);
  const [canKeepNight, setCanKeepNight] = useState(false);
  const [isFrame10, setIsFrame10] = useState(false);
  const [isWritingKeepsake, setIsWritingKeepsake] = useState(false);
  const [isMoonRecord, setIsMoonRecord] = useState(false);
  const [keepsakeMessage, setKeepsakeMessage] = useState("");
  const [keepsakeSignature, setKeepsakeSignature] = useState("");
  const [canSaveRecord, setCanSaveRecord] = useState(false);
  const [recordExportState, setRecordExportState] = useState<"idle" | "saving" | "saved">("idle");
  const [hasSavedRecord, setHasSavedRecord] = useState(false);
  const [recordShareState, setRecordShareState] = useState<RecordShareState>("idle");
  const [isReturning, setIsReturning] = useState(false);
  const [isMusicOn, setIsMusicOn] = useState(true);
  const [closeupMotion, setCloseupMotion] = useState({ x: 0, y: 0, scale: 1 });
  const audioRef = useRef<HTMLAudioElement>(null);
  const moonRef = useRef<HTMLButtonElement>(null);
  const dragXRef = useRef(0);
  const dragProgressRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setNarrationVisible(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const encoded = new URLSearchParams(window.location.hash.slice(1)).get("gift");
    if (!encoded) return;
    try {
      const shared = JSON.parse(decodeURIComponent(atob(encoded))) as { me?: unknown; them?: unknown; date?: unknown; message?: unknown; signature?: unknown };
      if (!isSharePlace(shared.me) || !isSharePlace(shared.them) || typeof shared.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(shared.date)) return;
      const restoredResult = findSharedMoonWindow(shared.me, shared.them, shared.date);
      setMe({ ...shared.me, aliases: "" });
      setThem({ ...shared.them, aliases: "" });
      setDate(shared.date);
      setHasChosenDate(true);
      setSearchResult(restoredResult);
      setNightProgress(100);
      setVisualStep("timeline");
      setHasApproachedMoon(true);
      setIsCloseup(true);
      setIsFrame9(true);
      setIsFrame10(true);
      setIsMoonRecord(true);
      setKeepsakeMessage(typeof shared.message === "string" ? shared.message.slice(0, 48) : "");
      setKeepsakeSignature(typeof shared.signature === "string" ? shared.signature.slice(0, 12) : "");
    } catch {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = .32;
    if (!isMusicOn) {
      audio.pause();
      return;
    }
    const beginPlayback = () => {
      void audio.play().catch(() => undefined);
    };
    beginPlayback();
    window.addEventListener("pointerdown", beginPlayback, { once: true });
    window.addEventListener("keydown", beginPlayback, { once: true });
    return () => {
      window.removeEventListener("pointerdown", beginPlayback);
      window.removeEventListener("keydown", beginPlayback);
    };
  }, [isMusicOn]);

  function choose(side: Side, place: Place) {
    if (side === "me") setMe(place);
    else setThem(place);
    window.setTimeout(() => setFocus(null), 420);
  }

  function beginNightSearch() {
    if (!me || !them) return;
    setSearchResult(findSharedMoonWindow(me, them, date));
    setNightOpeningStage("atmosphere");
    setIsEnteringNight(true);
    window.setTimeout(() => setNightOpeningStage("question"), 6400);
    window.setTimeout(() => {
      setNightProgress(8);
      setShowDragHint(true);
      setVisualStep("timeline");
      setIsEnteringNight(false);
    }, 10300);
  }

  function confirmDate() {
    if (isConfirmingDate) return;
    setIsConfirmingDate(true);
    window.setTimeout(() => {
      setIsChoosingDate(false);
      setHasChosenDate(true);
      setIsConfirmingDate(false);
      beginNightSearch();
    }, 900);
  }

  function updateNightFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const delta = event.clientX - dragXRef.current;
    const current = dragProgressRef.current;
    const gear = current >= 96 ? .18 : current >= 88 ? .4 : 1;
    const next = Math.max(0, Math.min(100, current + delta / bounds.width * 100 * gear));
    dragXRef.current = event.clientX;
    dragProgressRef.current = next;
    setNightProgress(next);
  }

  function moveNightWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") setNightProgress(0);
    else if (event.key === "End") setNightProgress(100);
    else setNightProgress((current) => {
      const step = current >= 96 ? .5 : current >= 88 ? 1 : 2;
      return Math.max(0, Math.min(100, current + (event.key === "ArrowRight" ? step : -step)));
    });
  }

  function approachMoon() {
    if (!canApproachMoon || isCloseup || !moonRef.current) return;
    const moonBounds = moonRef.current.getBoundingClientRect();
    const isMobile = window.innerWidth <= 760;
    const targetSize = isMobile
      ? Math.min(window.innerWidth * .48, 188)
      : Math.min(Math.max(window.innerWidth * .28, 220), window.innerHeight * .58, 380);
    const targetX = window.innerWidth * (isMobile ? .68 : .6);
    const targetY = isMobile ? window.innerHeight * .47 : Math.max(targetSize / 2 + 22, window.innerHeight * .34);
    setCloseupMotion({
      x: targetX - (moonBounds.left + moonBounds.width / 2),
      y: targetY - (moonBounds.top + moonBounds.height / 2),
      scale: targetSize / moonBounds.width,
    });
    setHasApproachedMoon(true);
    setIsCloseup(true);
  }

  function leaveMoonCloseup() {
    if (!isCloseup) return;
    setIsFrame10(false);
    setIsWritingKeepsake(false);
    setIsMoonRecord(false);
    setIsReturning(true);
    setIsCloseup(false);
    window.setTimeout(() => setIsReturning(false), 1750);
  }

  function leaveKeepsakePage() {
    if (isMoonRecord) {
      setIsMoonRecord(false);
      setIsWritingKeepsake(true);
      return;
    }
    if (isWritingKeepsake) {
      setIsWritingKeepsake(false);
      return;
    }
    setIsFrame10(false);
  }

  const isSharedMoment = Boolean(searchResult?.kind === "shared" && nightProgress >= 99);
  const isRelayMoment = Boolean(searchResult?.kind === "relay" && nightProgress >= 99);
  useEffect(() => {
    if (!isSharedMoment) {
      setCanApproachMoon(false);
      setShowApproachHint(false);
      setIsCloseup(false);
      return;
    }
    const approachTimer = window.setTimeout(() => setCanApproachMoon(true), 1200);
    const hintTimer = window.setTimeout(() => setShowApproachHint(true), 3200);
    return () => {
      window.clearTimeout(approachTimer);
      window.clearTimeout(hintTimer);
    };
  }, [isSharedMoment]);
  useEffect(() => {
    if (!isCloseup) return;
    const leaveCloseup = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isFrame10) leaveKeepsakePage();
      else leaveMoonCloseup();
    };
    window.addEventListener("keydown", leaveCloseup);
    return () => window.removeEventListener("keydown", leaveCloseup);
  }, [isCloseup, isFrame10, isWritingKeepsake]);
  useEffect(() => {
    if (!isCloseup) {
      setIsFrame9(false);
      setCanKeepNight(false);
      return;
    }
    const frame9Timer = window.setTimeout(() => setIsFrame9(true), 2200);
    return () => window.clearTimeout(frame9Timer);
  }, [isCloseup]);
  useEffect(() => {
    if (!isFrame9 || isFrame10) {
      setCanKeepNight(false);
      return;
    }
    const keepTimer = window.setTimeout(() => setCanKeepNight(true), 3000);
    return () => window.clearTimeout(keepTimer);
  }, [isFrame9, isFrame10]);
  useEffect(() => {
    if (!isMoonRecord) {
      setCanSaveRecord(false);
      return;
    }
    const saveTimer = window.setTimeout(() => setCanSaveRecord(true), 1000);
    return () => window.clearTimeout(saveTimer);
  }, [isMoonRecord]);

  async function downloadMoonRecord() {
    if (!me || !them || !searchResult || recordExportState === "saving") return;
    setRecordExportState("saving");
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 2337;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#073f9b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`image failed: ${src}`));
      image.src = src;
    });
    const [backgroundImage, reflectionImage, moonImage] = await Promise.all([
      loadImage("/scenes/moon-record/background-mobile-complete.png"),
      loadImage("/scenes/moon-record/reflection-mobile.png"),
      loadImage("/scenes/moon-record/moon-mobile.png"),
    ]);
    context.drawImage(backgroundImage, 0, 0, 1080, 2337);
    context.save();
    context.globalAlpha = .62;
    context.filter = "brightness(98%) saturate(86%) contrast(104%) blur(1.2px)";
    context.drawImage(reflectionImage, 62, 448, 250, 350, 572, 1480, 226, 250);
    context.restore();
    context.drawImage(moonImage, 0, 0, 1080, 2337);
    const moonX = 844;
    const moonY = 415;
    const moonRadius = 76;
    const distanceFromFull = Math.abs(searchResult.phase - .5) * 2;
    if (searchResult.illumination < .975) {
      context.save();
      context.beginPath();
      context.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
      context.clip();
      const direction = searchResult.phase < .5 ? 1 : -1;
      context.filter = "blur(10px)";
      context.fillStyle = `rgba(11, 49, 126, ${.66 + distanceFromFull * .16})`;
      context.beginPath();
      context.ellipse(moonX + direction * moonRadius * 1.9 * searchResult.illumination, moonY, moonRadius, moonRadius * 1.08, 0, 0, Math.PI * 2);
      context.fill();
      context.filter = "none";
      context.restore();
    }
    context.textAlign = "left";
    context.fillStyle = "rgba(255, 253, 239, .88)";
    context.font = '27px "Helvetica Neue", sans-serif';
    context.letterSpacing = "7px";
    context.fillText(date.replaceAll("-", "."), 94, 142);
    context.letterSpacing = "0px";
    context.fillRect(94, 172, 62, 2);
    context.font = '46px "Songti SC", "STSong", serif';
    context.letterSpacing = "8px";
    context.fillText(`${me.name} · ${them.name}`, 94, 684);
    context.letterSpacing = "2px";
    context.font = '24px "Songti SC", "STSong", serif';
    if (searchResult.kind === "relay" && searchResult.relay) {
      const first = searchResult.relay.first === "a" ? me : them;
      const second = searchResult.relay.first === "a" ? them : me;
      context.fillText(`${first.name}  月落 ${formatLocal(searchResult.relay.departure, first, true)}`, 94, 792);
      context.fillText(`${second.name}  月升 ${formatLocal(searchResult.relay.arrival, second, true)}`, 94, 835);
    } else {
      context.fillText(`${me.name}  ${formatLocal(searchResult.start, me)} — ${formatLocal(searchResult.end, me)}`, 94, 792);
      context.fillText(`${them.name}  ${formatLocal(searchResult.start, them)} — ${formatLocal(searchResult.end, them)}`, 94, 835);
    }
    context.font = '23px "Songti SC", "STSong", serif';
    context.fillText(searchResult.kind === "relay" ? "今晚，你们没有在同一时刻看见它。" : "在这段时间里，", 94, 895);
    context.fillText(searchResult.kind === "relay" ? "但月亮先后经过了你们的天空。" : "你们都能看见它。", 94, 935);
    context.font = '21px "Helvetica Neue", sans-serif';
    context.fillText(`相隔 ${Math.round(searchResult.distanceKm).toLocaleString()} km`, 94, 995);
    context.fillStyle = "rgba(255, 253, 239, .94)";
    context.font = '40px "Songti SC", "STSong", serif';
    context.letterSpacing = "6px";
    const messageLines = canvasLines(context, keepsakeMessage || "当我们抬头的时候，月亮离我们一样近。", 540);
    messageLines.slice(0, 3).forEach((line, index) => context.fillText(line, 94, 1830 + index * 58));
    if (keepsakeSignature) {
      context.fillStyle = "rgba(255, 253, 239, .84)";
      context.font = '28px "Songti SC", "STSong", serif';
      context.letterSpacing = "6px";
      context.fillText(keepsakeSignature, 94, 2020);
    }
    context.fillStyle = "rgba(255, 253, 239, .7)";
    context.font = '18px "Helvetica Neue", sans-serif';
    context.letterSpacing = "2px";
    context.fillText(`Moon illumination ${Math.round(searchResult.illumination * 1000) / 10}%`, 94, 2070);
    context.fillText(`Moon distance ${Math.round(searchResult.distanceKm).toLocaleString()} km`, 94, 2100);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `共月-${date}-${me.name}-${them.name}.png`;
    link.click();
    URL.revokeObjectURL(url);
    setHasSavedRecord(true);
    setRecordExportState("saved");
    window.setTimeout(() => setRecordExportState("idle"), 2200);
  }

  async function shareMoonRecord() {
    if (!me || !them || !searchResult || recordShareState === "sharing") return;
    setRecordShareState("sharing");
    const payload = btoa(encodeURIComponent(JSON.stringify({ me, them, date, message: keepsakeMessage, signature: keepsakeSignature })));
    const url = `${window.location.origin}${window.location.pathname}#gift=${encodeURIComponent(payload)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "共月", text: `${me.name}与${them.name}的这一轮月亮`, url });
        setRecordShareState("idle");
      } else {
        await navigator.clipboard.writeText(url);
        setRecordShareState("copied");
        window.setTimeout(() => setRecordShareState("idle"), 2400);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setRecordShareState("idle");
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        setRecordShareState("copied");
        window.setTimeout(() => setRecordShareState("idle"), 2400);
      } catch {
        window.location.hash = `gift=${encodeURIComponent(payload)}`;
        setRecordShareState("copied");
      }
    }
  }

  function beginAnotherMoon() {
    setIsMoonRecord(false);
    setIsWritingKeepsake(false);
    setIsFrame10(false);
    setIsFrame9(false);
    setIsCloseup(false);
    setHasApproachedMoon(false);
    setCanApproachMoon(false);
    setShowApproachHint(false);
    setCanKeepNight(false);
    setCanSaveRecord(false);
    setHasSavedRecord(false);
    setRecordExportState("idle");
    setRecordShareState("idle");
    setKeepsakeMessage("");
    setKeepsakeSignature("");
    setSearchResult(null);
    setNightProgress(0);
    setShowDragHint(false);
    setHasChosenDate(false);
    setIsChoosingDate(false);
    setIsEnteringNight(false);
    setMe(null);
    setThem(null);
    setFocus(null);
    setHovered(null);
    setVisualStep("places");
    setDate(today());
    setCloseupMotion({ x: 0, y: 0, scale: 1 });
    window.history.replaceState(null, "", window.location.pathname);
  }
  const timelineProgress = clamp01(nightProgress / 100);
  const sharedTimelineStart = searchResult?.kind === "shared" ? new Date(searchResult.start.getTime() - 60 * 60 * 1000) : null;
  const timelineMoment = searchResult
    ? searchResult.kind === "relay" && searchResult.relay
      ? new Date(
        searchResult.relay.departure.getTime() - 75 * 60 * 1000
        + timelineProgress * (searchResult.relay.arrival.getTime() - searchResult.relay.departure.getTime() + 150 * 60 * 1000),
      )
      : new Date(
        searchResult.start.getTime() - 60 * 60 * 1000
        + timelineProgress * (searchResult.best.getTime() - searchResult.start.getTime() + 60 * 60 * 1000),
      )
    : null;
  const frame5Progress = nightProgress / 100;
  const nearSide: Side = searchResult && searchResult.altitudeB > searchResult.altitudeA ? "them" : "me";
  const limitSide: Side = nearSide === "me" ? "them" : "me";
  const trackedPlace = limitSide === "me" ? me : them;
  const trackedPosition = searchResult?.kind === "shared" && trackedPlace && timelineMoment
    ? moonPosition(trackedPlace, timelineMoment)
    : null;
  const trackedStartPosition = searchResult?.kind === "shared" && trackedPlace && sharedTimelineStart
    ? moonPosition(trackedPlace, sharedTimelineStart)
    : null;
  const trackedAltitude = searchResult?.kind === "shared"
    ? -1.5 + timelineProgress * Math.max(15, Math.min(32, Math.min(searchResult.altitudeA, searchResult.altitudeB)))
    : trackedPosition?.altitude ?? -90;
  const isFirstSight = Boolean(searchResult?.kind === "shared" && trackedAltitude > -1.5);
  const moonTrackY = moonHeight(trackedAltitude);
  const actualAzimuthDelta = trackedPosition && trackedStartPosition
    ? signedAngleDelta(trackedStartPosition.azimuth, trackedPosition.azimuth)
    : 0;
  const moonTravelDirection = Math.sign(actualAzimuthDelta) || (limitSide === "me" ? 1 : -1);
  const moonTrackX = moonTravelDirection * (4 * timelineProgress + 10 * timelineProgress * timelineProgress);
  const moonClipBottom = horizonReveal(trackedAltitude);
  const moonHaloProgress = clamp01((trackedAltitude + 1) / 12);
  const cloudProgress = frame5Progress;
  const relayFirstPlace = searchResult?.relay?.first === "b" ? them : me;
  const relaySecondPlace = searchResult?.relay?.first === "b" ? me : them;
  const relayFirstSide: Side = searchResult?.relay?.first === "b" ? "them" : "me";
  const relaySecondSide: Side = relayFirstSide === "me" ? "them" : "me";
  const relayProgress = timelineProgress;
  const relayFirstPosition = relayFirstPlace && timelineMoment ? moonPosition(relayFirstPlace, timelineMoment) : null;
  const relaySecondPosition = relaySecondPlace && timelineMoment ? moonPosition(relaySecondPlace, timelineMoment) : null;
  const relayFirstVisible = Boolean(relayFirstPosition && relayFirstPosition.altitude > -2.25 && searchResult?.relay && timelineMoment && timelineMoment <= new Date(searchResult.relay.departure.getTime() + 12 * 60 * 1000));
  const relaySecondVisible = Boolean(relaySecondPosition && relaySecondPosition.altitude > -2.25 && searchResult?.relay && timelineMoment && timelineMoment >= new Date(searchResult.relay.arrival.getTime() - 12 * 60 * 1000));
  const relayNarration = searchResult?.relay && timelineMoment && timelineMoment < searchResult.relay.departure
    ? <>月亮正从 {relayFirstPlace?.name} 的天边落下。</>
    : searchResult?.relay && timelineMoment && timelineMoment < searchResult.relay.arrival
      ? <>这一刻，两边的天空都是空的。</>
      : <>再等一会儿，它会从 {relaySecondPlace?.name} 的天边升起。</>;
  return (
    <main
      className={`storybook-stage ${focus ? `is-focused focus-${focus}` : "is-wide"} step-${visualStep} ${isFirstSight ? `is-first-sight first-sight-${limitSide}` : ""} ${isSharedMoment ? "is-shared-moment" : ""} ${isRelayMoment ? "is-relay-moment" : ""} ${isCloseup ? "is-closeup" : ""} ${isFrame9 ? "is-frame9" : ""} ${isFrame10 ? "is-frame10" : ""} ${isReturning ? "is-returning" : ""}`}
      style={{
        "--night-progress": `${nightProgress}%`,
        "--frame5-sky-brightness": `${1.08 - frame5Progress * .18}`,
        "--frame5-sky-warmth": `${frame5Progress * .035}`,
        "--frame5-sky-saturation": `${.86 + frame5Progress * .26}`,
        "--frame5-sky-hue": `${-6 + frame5Progress * 8}deg`,
        "--frame5-cloud-x": `${cloudProgress * 96}px`,
        "--frame5-horizon-brightness": `${1 + Math.sin(frame5Progress * Math.PI) * .06}`,
        "--frame5-land-brightness": `${1.03 - frame5Progress * .16}`,
        "--frame5-land-contrast": `${.96 + frame5Progress * .18}`,
        "--frame5-near-light": `${.04 + frame5Progress * .22}`,
        "--moon-track-x": `${moonTrackX}vw`,
        "--moon-track-y": `${moonTrackY}px`,
        "--moon-halo-opacity": `${moonHaloProgress}`,
        "--moon-clip-bottom": `${moonClipBottom}%`,
        "--relay-departure-x": "0px",
        "--relay-departure-y": `${moonHeight(relayFirstPosition?.altitude ?? -90)}px`,
        "--relay-departure-opacity": relayFirstVisible ? "1" : "0",
        "--relay-departure-clip": `${horizonReveal(relayFirstPosition?.altitude ?? -90)}%`,
        "--relay-arrival-x": "0px",
        "--relay-arrival-y": `${moonHeight(relaySecondPosition?.altitude ?? -90)}px`,
        "--relay-arrival-opacity": relaySecondVisible ? "1" : "0",
        "--relay-arrival-clip": `${horizonReveal(relaySecondPosition?.altitude ?? -90)}%`,
        "--closeup-moon-x": `${closeupMotion.x}px`,
        "--closeup-moon-y": `${closeupMotion.y}px`,
        "--closeup-moon-scale": `${closeupMotion.scale}`,
      } as React.CSSProperties}
    >
      <audio ref={audioRef} src="/audio/moonlit-waltz-sealed.mp3" autoPlay loop preload="auto" />
      <button
        className={`music-toggle ${isMusicOn ? "is-on" : ""}`}
        type="button"
        onClick={() => setIsMusicOn((current) => !current)}
        aria-label={isMusicOn ? "关闭背景音乐" : "开启背景音乐"}
        aria-pressed={isMusicOn}
      >
        <span aria-hidden="true">{isMusicOn ? "♫" : "♪"}</span>
        {isMusicOn ? "音乐开" : "音乐关"}
      </button>
      <div className="storybook-camera">
        <img className="scene-layer scene-sky scene-desktop" src="/scenes/dual-window/sky-base.webp" alt="" />
        <img className="scene-layer scene-horizon scene-desktop" src="/scenes/dual-window/far-horizon.png" alt="" />
        <img className="scene-layer scene-cloud scene-desktop" src="/scenes/dual-window/cloud-far.png" alt="" />
        <img className="scene-layer scene-sky scene-mobile" src="/scenes/dual-window/mobile/sky-base.webp" alt="" />
        <img className="scene-layer scene-horizon scene-mobile" src="/scenes/dual-window/mobile/far-horizon.png" alt="" />
        <img className="scene-layer scene-cloud scene-mobile" src="/scenes/dual-window/mobile/cloud-far.png" alt="" />
        {visualStep === "timeline" && (
          <div className="frame8-stars" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
        )}
        {visualStep === "timeline" && searchResult?.kind === "shared" && (
          <button
            ref={moonRef}
            type="button"
            className={`frame6-moon-stage frame6-moon-stage-${limitSide}`}
            aria-label={isCloseup ? "月亮近景" : isSharedMoment ? "靠近月亮" : isFirstSight ? "月亮从房屋后缓缓露出" : undefined}
            aria-hidden={!isFirstSight}
            aria-disabled={!canApproachMoon || isCloseup}
            tabIndex={isSharedMoment && !isCloseup ? 0 : -1}
            onClick={approachMoon}
          >
            <img className="frame6-moon" src="/scenes/shared-moon/moon-surface.png" alt="" />
            <span className={`frame8-approach-hint ${showApproachHint && !isCloseup && !isReturning && !hasApproachedMoon ? "is-visible" : ""}`}>轻触月光</span>
          </button>
        )}
        {visualStep === "timeline" && searchResult?.kind === "relay" && searchResult.relay && (
          <div className="relay-moons" aria-hidden="true">
            <span className={`relay-moon relay-moon-${relayFirstSide} relay-moon-departure`}><img src="/scenes/shared-moon/moon-surface.png" alt="" /></span>
            <span className={`relay-moon relay-moon-${relaySecondSide} relay-moon-arrival`}><img src="/scenes/shared-moon/moon-surface.png" alt="" /></span>
          </div>
        )}
        <div className={`scene-layer scene-place scene-place-left ${me ? "is-lit" : ""}`} aria-hidden="true">
          <img className="place-light-layer place-light-off scene-desktop" src="/scenes/dual-window/place-left-light-off.png" alt="" width="1440" height="900" loading="eager" fetchPriority="high" />
          <img className="place-light-layer place-light-on scene-desktop" src="/scenes/dual-window/place-left.png" alt="" width="1440" height="900" loading="eager" fetchPriority="high" />
          <img className="place-light-layer place-light-off scene-mobile" src="/scenes/dual-window/mobile/place-left-light-off.png" alt="" width="390" height="844" loading="eager" />
          <img className="place-light-layer place-light-on scene-mobile" src="/scenes/dual-window/mobile/place-left.png" alt="" width="390" height="844" loading="eager" />
          <span className="place-window-glow" />
        </div>
        <div className={`scene-layer scene-place scene-place-right ${them ? "is-lit" : ""}`} aria-hidden="true">
          <img className="place-light-layer place-light-off scene-desktop" src="/scenes/dual-window/place-right-light-off.png" alt="" width="1440" height="900" loading="eager" fetchPriority="high" />
          <img className="place-light-layer place-light-on scene-desktop" src="/scenes/dual-window/place-right.png" alt="" width="1440" height="900" loading="eager" fetchPriority="high" />
          <img className="place-light-layer place-light-off scene-mobile" src="/scenes/dual-window/mobile/place-right-light-off.png" alt="" width="390" height="844" loading="eager" />
          <img className="place-light-layer place-light-on scene-mobile" src="/scenes/dual-window/mobile/place-right.png" alt="" width="390" height="844" loading="eager" />
          <span className="place-window-glow" />
        </div>
        {isSharedMoment && (
          <>
            <span className="frame7-window-answer frame7-window-answer-me" aria-hidden="true" />
            <span className="frame7-window-answer frame7-window-answer-them" aria-hidden="true" />
          </>
        )}
        {visualStep === "timeline" && <span className={`near-miss-light near-miss-light-${nearSide}`} aria-hidden="true" />}
        <button
          type="button"
          className={`house-hotspot house-hotspot-me ${me ? "is-chosen" : ""}`}
          onMouseEnter={() => setHovered("me")}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered("me")}
          onBlur={() => setHovered(null)}
          onClick={() => setFocus("me")}
          aria-label={me ? `我的城市是${me.name}，点击更换` : "选择我的城市"}
        >
          <span className="hover-caption"><b>{me ? `这里是${me.name}。` : "点亮这里。"}</b></span>
          {!me && <span className="mobile-window-cue">我在这里</span>}
        </button>

        <button
          type="button"
          className={`house-hotspot house-hotspot-them ${them ? "is-chosen" : ""}`}
          onMouseEnter={() => setHovered("them")}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered("them")}
          onBlur={() => setHovered(null)}
          onClick={() => setFocus("them")}
          aria-label={them ? `TA 的城市是${them.name}，点击更换` : "选择 TA 的城市"}
        >
          <span className="hover-caption"><b>{them ? `TA 在${them.name}。` : "点亮那边。"}</b></span>
          {!them && <span className="mobile-window-cue">TA 在那里</span>}
        </button>
      </div>

      {(isCloseup || isReturning) && (
        <>
          <button className="frame8-closeup-backdrop" type="button" aria-label="返回远景" onClick={leaveMoonCloseup} disabled={isReturning} />
          <button className="frame8-exit" type="button" onClick={leaveMoonCloseup} disabled={isReturning}>← 返回远景</button>
        </>
      )}

      {isFrame9 && me && them && searchResult?.kind === "shared" && (
        <section className="frame9-content" aria-label="同一轮月亮" aria-live="polite">
          <p className="frame9-poem"><span>这一刻，</span><span>我们凝望着同一轮月亮</span></p>
          <p className="frame9-fact">
            <span>{me.name} · {them.name}</span>
            <span>{formatLocal(searchResult.start, me)} / {formatLocal(searchResult.start, them)}</span>
            <span>Moon illumination {Math.round(searchResult.illumination * 1000) / 10}%</span>
          </p>
          {canKeepNight && <button className="frame9-keep" type="button" onClick={() => setIsFrame10(true)}>留下这一晚&nbsp; →</button>}
        </section>
      )}

      {isRelayMoment && searchResult?.relay && relayFirstPlace && relaySecondPlace && (
        <section className="relay-result" aria-label="月亮接力" aria-live="polite">
          <p>月亮没有同时抵达，</p>
          <p>我们却先后接住了同一片月光。</p>
          <div className="relay-times">
            <span>{relayFirstPlace.name}<b>月落&nbsp; {formatLocal(searchResult.relay.departure, relayFirstPlace)}</b></span>
            <i aria-hidden="true" />
            <span>{relaySecondPlace.name}<b>月升&nbsp; {formatLocal(searchResult.relay.arrival, relaySecondPlace)}</b></span>
          </div>
          <button className="relay-keep" type="button" onClick={() => setIsFrame10(true)}>把这一晚也留下来&nbsp; →</button>
        </section>
      )}

      {isFrame10 && me && them && searchResult && (
        <section className={`frame10-page ${searchResult.kind === "relay" ? "is-relay-page" : ""} ${isWritingKeepsake ? "is-writing-page" : ""} ${isMoonRecord ? "is-record-page" : ""}`} aria-label="留下这轮月亮" aria-live="polite">
          <div className="frame10-design">
          <button className="frame10-back" type="button" onClick={leaveKeepsakePage}>{isMoonRecord ? "← 返回书写" : isWritingKeepsake ? "← 返回书页" : "← 回到月光里"}</button>
          <figure className={`frame10-night ${isWritingKeepsake ? "is-writing" : ""} ${isMoonRecord ? "is-record" : ""}`}>
            <MoonRecordArtwork phase={searchResult.phase} illumination={searchResult.illumination} widePreview />
            <figcaption className="frame10-scene-caption">
              <span>{date.replaceAll("-", ".")}</span>
              <span>{me.name} · {them.name}</span>
              {searchResult.kind === "relay" && searchResult.relay && relayFirstPlace && relaySecondPlace
                ? <small>{relayFirstPlace.name} 月落 {formatLocal(searchResult.relay.departure, relayFirstPlace)}&nbsp;&nbsp; / &nbsp;&nbsp;{relaySecondPlace.name} 月升 {formatLocal(searchResult.relay.arrival, relaySecondPlace)}</small>
                : <small>{formatLocal(searchResult.start, me)}&nbsp;&nbsp; / &nbsp;&nbsp;{formatLocal(searchResult.start, them)}</small>}
            </figcaption>
          </figure>
          {!isWritingKeepsake && !isMoonRecord ? (
            <div className="frame10-copy">
              <p>{searchResult.kind === "relay" ? "月亮没有同时抵达，我们却先后接住了同一片月光。" : "想把这轮月亮留下来吗？"}</p>
              <small>{searchResult.kind === "relay" ? "想把这两个相连的夜晚，留在同一页吗？" : "写下一句话，它会和今晚的月亮一起被保存。"}</small>
              <button type="button" onClick={() => setIsWritingKeepsake(true)}>写给 TA&nbsp; →</button>
            </div>
          ) : isWritingKeepsake ? (
            <div className="frame10-writing" aria-label="写下祝福和落款">
              <p className="frame11-question">{searchResult.kind === "relay" ? "如果月光正从 TA 那里启程，你想写下什么？" : "如果 TA 现在就在月亮的另一边，你想说什么？"}</p>
              <label>
                <span>写给 TA</span>
                <textarea value={keepsakeMessage} maxLength={48} onChange={(event) => setKeepsakeMessage(event.target.value)} placeholder="当我们抬头的时候，月亮离我们一样近。" />
              </label>
              <label>
                <span>落款</span>
                <input value={keepsakeSignature} maxLength={12} onChange={(event) => setKeepsakeSignature(event.target.value)} placeholder="你的名字" />
              </label>
              <div className="frame11-actions">
                <button type="button" onClick={() => { setKeepsakeMessage(""); setIsWritingKeepsake(false); }}>暂时不写</button>
                <button type="button" onClick={() => { setIsWritingKeepsake(false); setIsMoonRecord(true); }}>看看这轮月亮&nbsp; →</button>
              </div>
            </div>
          ) : (
            <article className="frame12-record" aria-label="两个人的月亮记录">
              <div className="frame12-scene" aria-hidden="true">
                <MoonRecordArtwork phase={searchResult.phase} illumination={searchResult.illumination} mobileArtDirection includeReflection showAstronomyOverlay />
              </div>
              <time className="frame12-date">{date.replaceAll("-", ".")}</time>
              <section className="frame12-data">
                <h2>{me.name} · {them.name}</h2>
                {searchResult.kind === "relay" && searchResult.relay ? (
                  <p className="frame12-window"><span>{relayFirstPlace?.name}&nbsp; 月落 {relayFirstPlace && formatLocal(searchResult.relay.departure, relayFirstPlace, true)}</span><span>{relaySecondPlace?.name}&nbsp; 月升 {relaySecondPlace && formatLocal(searchResult.relay.arrival, relaySecondPlace, true)}</span><small>月亮先后经过了你们的天空。</small></p>
                ) : (
                  <p className="frame12-window"><span>{me.name}&nbsp; {formatLocal(searchResult.start, me)} — {formatLocal(searchResult.end, me)}</span><span>{them.name}&nbsp; {formatLocal(searchResult.start, them)} — {formatLocal(searchResult.end, them)}</span><small>在这段时间里，你们都能看见它。</small></p>
                )}
                <p className="frame12-distance">相隔 {Math.round(searchResult.distanceKm).toLocaleString()} km</p>
              </section>
              <section className="frame12-letter">
                <blockquote>{keepsakeMessage || "当我们抬头的时候，月亮离我们一样近。"}</blockquote>
                {keepsakeSignature && <p className="frame12-signature">{keepsakeSignature}</p>}
                <footer>Moon illumination {Math.round(searchResult.illumination * 1000) / 10}%</footer>
              </section>
              {canSaveRecord && <div className="frame13-actions">
                <p>{recordShareState === "copied" ? "链接已复制，可以寄给 TA 了。" : "这一轮月亮已经被留下来了。"}</p>
                <div className="frame13-buttons">
                  <button type="button" onClick={downloadMoonRecord}>{recordExportState === "saving" ? "正在把月光留在纸上……" : recordExportState === "saved" ? "图片已保存" : "保存图片"}</button>
                  <button type="button" onClick={shareMoonRecord}>{recordShareState === "sharing" ? "正在打包月光……" : "寄给 TA"}</button>
                </div>
                {hasSavedRecord && <button className="frame13-restart" type="button" onClick={beginAnotherMoon}>再等一轮月亮&nbsp; ↺</button>}
              </div>}
            </article>
          )}
          <p className="frame10-page-number">共月 · {date.replaceAll("-", ".")}</p>
          </div>
        </section>
      )}

      {visualStep === "timeline" && (
        <div
          className={`frame5-drag-surface ${isMovingNight ? "is-moving" : ""}`}
          role="slider"
          tabIndex={0}
          aria-label="在天空中横向推动夜晚"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(nightProgress)}
          onPointerDown={(event) => {
            setIsMovingNight(true);
            dragXRef.current = event.clientX;
            dragProgressRef.current = nightProgress;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) updateNightFromPointer(event);
          }}
          onPointerUp={() => setIsMovingNight(false)}
          onPointerCancel={() => setIsMovingNight(false)}
          onKeyDown={moveNightWithKeyboard}
        />
      )}

      {visualStep === "places" && !focus && !(me && them) && (
        <p className={`opening-line ${narrationVisible && !hovered ? "is-visible" : ""}`} aria-live="polite">今晚。</p>
      )}

      {visualStep === "places" && focus && (
        <LocationSearch
          side={focus}
          value={focus === "me" ? me : them}
          onChoose={(place) => choose(focus, place)}
          onBack={() => setFocus(null)}
        />
      )}

      {visualStep === "places" && !focus && me && them && (
        <div className={`both-ready ${isEnteringNight ? "is-entering-night" : ""}`} aria-live="polite">
          {!isEnteringNight && !hasChosenDate && <p>选一个想和 TA 共享月光的晚上。</p>}
          {!hasChosenDate && !isChoosingDate && <button className="date-prompt" type="button" onClick={() => setIsChoosingDate(true)}>选择这一天&nbsp; ↓</button>}
          {isChoosingDate && <div className={`date-choice ${isConfirmingDate ? "is-confirming" : ""}`}><DateWheel value={date} onChange={setDate} /><button className="date-confirm" type="button" disabled={isConfirmingDate} onClick={confirmDate}>{isConfirmingDate ? "这一晚，已经选好了" : "就是这一天"}</button></div>}
          {isEnteringNight && nightOpeningStage === "atmosphere" && <div className="night-opening-sequence night-opening-atmosphere">
            <p>夜色逐渐浓稠</p>
            <p>微风萦绕</p>
            <p>树影晃动</p>
          </div>}
          {isEnteringNight && nightOpeningStage === "question" && <div className="night-opening-sequence night-opening-question">
            <p><span>这一天</span><span>我们会望向同一轮月亮吗？</span></p>
          </div>}
        </div>
      )}

      {visualStep === "timeline" && me && them && searchResult && (
        <section className="frame5-time" aria-label="时间开始移动">
          {!isSharedMoment && !isRelayMoment && <p className={`frame5-narration frame5-narration-${nearSide}`}>
            {searchResult.kind === "relay" && relayFirstPlace && relaySecondPlace
              ? relayNarration
              : isFirstSight
                ? <>月亮已经在两地的夜空里。<br />再把这一晚慢慢往前推。</>
                : nearSide === "me" ? <>这里已经有一点月光了。<br />TA 那里的夜，还要再等一会儿。</> : <>月亮先到了 TA 那里。<br />再把夜晚往前推一点。</>}
          </p>}
          {showDragHint && !isSharedMoment && !isRelayMoment && (
            <div className="frame5-drag-hint" aria-hidden="true">
              <i />
              <span>把夜晚往前推一点</span>
            </div>
          )}
          {timelineMoment && (
            <div className="frame5-local-times" aria-live="polite">
              <span>{me.name}<b>{formatLocal(timelineMoment, me, true)}</b></span>
              <span>{them.name}<b>{formatLocal(timelineMoment, them, true)}</b></span>
            </div>
          )}
          {isSharedMoment && (
            <p className="frame7-narration" aria-live="polite">
              从 {formatLocal(searchResult.start, me)} 开始，<br />
              月亮同时经过你们的天空。
            </p>
          )}
          <div className={`frame5-timeline ${isMovingNight ? "is-moving" : ""}`} aria-hidden="true">
              <i style={{ width: `${nightProgress}%` }} />
              <em style={{ left: `${nightProgress}%` }} />
          </div>
        </section>
      )}
    </main>
  );
}
