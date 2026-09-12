import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Project, freshProject } from "./model";
export default function MapPicker({
  onChoose,
  onCancel,
}: {
  onChoose: (p: Project) => void;
  onCancel: () => void;
}) {
  const node = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null);
  const [coords, setCoords] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!node.current) return;
    const m = L.map(node.current, {
      zoomAnimation: false,
      fadeAnimation: false,
    }).setView([35.7, -86.9], 15);
    map.current = m;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      crossOrigin: "anonymous",
    }).addTo(m);
    L.control.scale({ imperial: true, metric: false }).addTo(m);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);
  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        map.current?.setView([pos.coords.latitude, pos.coords.longitude], 17),
      () => setError("Location unavailable. Enter coordinates or pan the map."),
      { timeout: 10000 },
    );
  }
  function go() {
    const v = coords.split(",").map(Number);
    if (
      v.length !== 2 ||
      !v.every(Number.isFinite) ||
      Math.abs(v[0]) > 85 ||
      Math.abs(v[1]) > 180
    ) {
      setError("Enter latitude, longitude — for example 35.70, -86.90.");
      return;
    }
    map.current?.setView([v[0], v[1]], 17);
    setError("");
  }
  async function choose() {
    const m = map.current,
      el = node.current;
    if (!m || !el) return;
    setBusy(true);
    setError("");
    try {
      if (m.getZoom() < 15)
        throw new Error(
          "Zoom in until the property fills the map (zoom level 15 or closer).",
        );
      const tiles = Array.from(
        el.querySelectorAll<HTMLImageElement>("img.leaflet-tile"),
      );
      if (!tiles.length || tiles.some((t) => !t.complete || !t.naturalWidth))
        throw new Error(
          "Map tiles are still loading or unavailable. Try again, or upload a screenshot.",
        );
      const rect = el.getBoundingClientRect(),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(rect.width);
      canvas.height = Math.round(rect.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#e8ebdf";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      tiles.forEach((tile) => {
        const r = tile.getBoundingClientRect();
        ctx.drawImage(
          tile,
          r.left - rect.left,
          r.top - rect.top,
          r.width,
          r.height,
        );
      });
      const center = m.getCenter();
      const scale =
        (156543.03392804097 * Math.cos((center.lat * Math.PI) / 180)) /
        Math.pow(2, m.getZoom()) /
        0.3048;
      onChoose({
        ...freshProject(),
        image: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
        feetPerPixel: scale,
        source: `© OpenStreetMap contributors • ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)} • approximate map scale`,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="map-picker">
      <h2>Find your land</h2>
      <p>
        Pan and zoom to frame the entire property. Use an aerial upload when you
        need satellite detail.
      </p>
      <div className="row">
        <input
          aria-label="Latitude, longitude"
          placeholder="Latitude, longitude"
          value={coords}
          onChange={(e) => setCoords(e.target.value)}
        />
        <button onClick={go}>Go</button>
        <button onClick={locate}>My location</button>
      </div>
      <div ref={node} className="map-view" />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row">
        <button onClick={onCancel}>Back</button>
        <button className="primary" disabled={busy} onClick={choose}>
          {busy ? "Preparing…" : "Use this map"}
        </button>
      </div>
      <small>
        Map requests go to OpenStreetMap. Location is requested only when you
        tap My location.
      </small>
    </section>
  );
}
