import { Project } from "./model";
import { area, ACRE, lotMetrics, roadMask } from "./geometry";
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function readBackground(
  file: File,
): Promise<{ image: string; width: number; height: number }> {
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Choose an image or PDF smaller than 25 MB.");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    try {
      const doc = await task.promise,
        page = await doc.getPage(1),
        base = page.getViewport({ scale: 1 }),
        view = page.getViewport({
          scale: Math.min(2400 / base.width, 2400 / base.height, 3),
        });
      canvas.width = Math.round(view.width);
      canvas.height = Math.round(view.height);
      await page.render({ canvasContext: ctx, viewport: view }).promise;
    } finally {
      await task.destroy();
    }
  } else {
    if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type))
      throw new Error(
        "Use PNG, JPG, WebP, or PDF. For HEIC, save a screenshot first.",
      );
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () =>
          reject(
            new Error("This image could not be opened. Try a PNG or JPG."),
          );
        img.src = url;
      });
      const ratio = Math.min(1, 2400 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return {
    image: canvas.toDataURL("image/jpeg", 0.9),
    width: canvas.width,
    height: canvas.height,
  };
}
export function exportProject(p: Project) {
  download(
    new Blob([JSON.stringify(p)], { type: "application/json" }),
    "lot-layout.project.json",
  );
}
export function exportCSV(p: Project) {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const mask = roadMask(p);
  const rows = p.lots.map((l) => {
    const m = lotMetrics(l, p, mask);
    return [
      quote(/^[=+@-]/.test(l.name) ? `'${l.name}` : l.name),
      m.acres.toFixed(3),
      m.frontage.toFixed(1),
      quote(m.warnings.join("; ")),
    ].join(",");
  });
  download(
    new Blob(["Lot,Acres,Road frontage (ft),Review\n" + rows.join("\n")], {
      type: "text/csv",
    }),
    "lot-schedule.csv",
  );
}
export async function exportDrawing(
  svg: SVGSVGElement,
  p: Project,
  format: "png" | "pdf",
) {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.querySelectorAll("[data-editor]").forEach((e) => e.remove());
  copy.setAttribute("viewBox", `0 0 ${p.width} ${p.height}`);
  copy.setAttribute("width", String(p.width));
  copy.setAttribute("height", String(p.height));
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(copy)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Unable to render the drawing."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = p.width;
    canvas.height = p.height + 130;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f7f8f2";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    ctx.fillStyle = "#19372d";
    ctx.font = "22px sans-serif";
    ctx.fillText(p.name, 20, p.height + 30);
    ctx.font = "14px sans-serif";
    ctx.fillText(
      `${p.lots.length} proposed lots • ${((p.lots.reduce((s, l) => s + area(l.shape), 0) * Math.pow(p.feetPerPixel || 0, 2)) / ACRE).toFixed(2)} acres in lots`,
      20,
      p.height + 55,
    );
    ctx.fillText(
      "Concept only. Verify boundaries, access, drainage, utilities and local requirements with an engineer.",
      20,
      p.height + 80,
    );
    ctx.fillText(p.source.slice(0, 150), 20, p.height + 105);
    if (format === "png") {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r));
      if (blob) download(blob, "lot-layout.png");
    } else {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });
      const ratio = Math.min(277 / canvas.width, 190 / canvas.height);
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        10,
        10,
        canvas.width * ratio,
        canvas.height * ratio,
      );
      const mask = roadMask(p);
      p.lots.forEach((l, i) => {
        if (i % 30 === 0) {
          pdf.addPage();
          pdf.setFontSize(15);
          pdf.text("Lot schedule — conceptual estimates", 12, 15);
          pdf.setFontSize(10);
        }
        const m = lotMetrics(l, p, mask);
        pdf.text(
          `${l.name.slice(0, 30)} | ${m.acres.toFixed(2)} ac | ${m.frontage.toFixed(0)} ft | ${m.warnings.join(", ") || "Meets entered targets"}`,
          12,
          25 + (i % 30) * 5.5,
          { maxWidth: 270 },
        );
      });
      pdf.save("lot-layout.pdf");
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
