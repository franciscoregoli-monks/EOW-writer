/* Build a standalone pipeline slide for the Amazon EOW Reporter.
 * Install PptxGenJS before running: npm install pptxgenjs
 *
 * The slide uses native editable shapes so it can be copied into another deck.
 */

let PptxGenJS;
try {
  PptxGenJS = require("pptxgenjs");
} catch {
  PptxGenJS = require("/tmp/eow-slides/node_modules/pptxgenjs");
}

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Amazon EOW Reporter project";
pptx.company = "Monks";
pptx.subject = "Data pipeline across platforms";
pptx.title = "Amazon EOW Reporter - Pipeline";
pptx.lang = "es-AR";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "es-AR",
};

const C = {
  navy: "101820",
  ink: "202A35",
  teal: "006B68",
  mint: "C8F3DA",
  orange: "FF9900",
  cream: "F6F3ED",
  white: "FFFFFF",
  cloud: "E8EFEF",
  line: "CDD5D5",
  muted: "66717C",
  amber: "B7791F",
  paleOrange: "FCE8C5",
};

const ST = pptx.ShapeType;
const OUT = "presentations/amazon-eow-reporter-pipeline.pptx";

const CARD_W = 2.8;
const CARD_H = 1.95;
const GAP = 0.42;
const X0 = 0.44;
const ROW1_Y = 1.8;
const ROW2_Y = 4.35;
const WRAP_Y = 4.05;

function text(slide, value, x, y, w, h, opts = {}) {
  slide.addText(value, {
    x, y, w, h,
    fontFace: opts.fontFace || "Aptos",
    fontSize: opts.fontSize || 12,
    color: opts.color || C.ink,
    bold: opts.bold || false,
    margin: 0,
    valign: opts.valign || "mid",
    align: opts.align || "left",
    fit: "shrink",
    ...opts,
  });
}

function rect(slide, x, y, w, h, fill, radius = 0.1, line = null) {
  slide.addShape(radius ? ST.roundRect : ST.rect, {
    x, y, w, h,
    rectRadius: radius,
    fill: { color: fill },
    line: line ? { color: line, width: 1 } : { color: fill, transparency: 100 },
  });
}

function rule(slide, x, y, w, color = C.line, width = 1) {
  slide.addShape(ST.line, { x, y, w, h: 0, line: { color, width } });
}

function arrow(slide, x1, y1, x2, y2, color = C.teal, width = 1.75) {
  slide.addShape(ST.line, {
    x: x1, y: y1, w: x2 - x1, h: y2 - y1,
    line: { color, width, endArrowType: "triangle" },
  });
}

function tag(slide, label, x, y, w, fill, color = C.teal) {
  rect(slide, x, y, w, 0.26, fill, 0.12);
  text(slide, label.toUpperCase(), x + 0.06, y + 0.01, w - 0.12, 0.24, {
    fontSize: 7.5, bold: true, color, charSpacing: 1.0, align: "center",
  });
}

function stageCard(slide, index, stage) {
  const column = index % 4;
  const x = X0 + column * (CARD_W + GAP);
  const y = index < 4 ? ROW1_Y : ROW2_Y;
  const accent = stage.accent || C.teal;
  const highlight = Boolean(stage.highlight);

  rect(slide, x, y, CARD_W, CARD_H, highlight ? C.mint : C.white, 0.12,
    highlight ? C.mint : C.line);
  rect(slide, x, y, CARD_W, 0.055, accent, 0.02);

  tag(slide, stage.platform, x + 0.18, y + 0.2, 1.62,
    highlight ? C.white : C.cloud, highlight ? C.navy : C.teal);

  slide.addShape(ST.ellipse, {
    x: x + CARD_W - 0.53, y: y + 0.18, w: 0.3, h: 0.3,
    fill: { color: highlight ? C.navy : C.cloud },
    line: { color: highlight ? C.navy : C.cloud },
  });
  text(slide, String(index + 1), x + CARD_W - 0.53, y + 0.185, 0.3, 0.29, {
    fontSize: 8.5, bold: true, align: "center",
    color: highlight ? C.white : C.teal,
  });

  text(slide, stage.title, x + 0.18, y + 0.56, CARD_W - 0.36, 0.3, {
    fontSize: 13.5, bold: true, color: C.navy,
  });
  text(slide, stage.detail, x + 0.18, y + 0.92, CARD_W - 0.36, 0.56, {
    fontSize: 9, color: highlight ? C.ink : C.muted,
    valign: "top", breakLine: true,
  });

  rule(slide, x + 0.18, y + 1.52, CARD_W - 0.36, highlight ? "9FD9BC" : C.line);
  text(slide, "DATA", x + 0.18, y + 1.58, 0.42, 0.14, {
    fontSize: 6.5, bold: true, color: C.muted, charSpacing: 0.8,
  });
  text(slide, stage.data, x + 0.18, y + 1.7, CARD_W - 0.36, 0.2, {
    fontSize: 8.5, bold: true, color: highlight ? C.navy : C.teal,
  });

  if (column < 3) {
    arrow(slide, x + CARD_W + 0.07, y + CARD_H / 2, x + CARD_W + GAP - 0.07,
      y + CARD_H / 2);
  }
}

const STAGES = [
  {
    platform: "Google Sheets",
    title: "Cambia el Status",
    detail: "Trabajás normalmente en la pestaña Tasks y movés una tarea de estado.",
    data: "Fila editada en Tasks",
    accent: C.orange,
  },
  {
    platform: "Apps Script",
    title: "onEdit registra",
    detail: "Resuelve las columnas por nombre y agrega el evento sin tocar el maestro.",
    data: "Fila en Log de Cambios",
    accent: C.orange,
  },
  {
    platform: "GitHub Actions",
    title: "Arranca el run",
    detail: "Cron del jueves 16:00 ART, Run workflow manual o el checkbox Control B2.",
    data: "Runner con los secrets",
    accent: C.teal,
  },
  {
    platform: "Python main.py",
    title: "Arma la semana",
    detail: "Ventana sábado a viernes, último evento por tarea y join por título normalizado.",
    data: "Cambios normalizados",
    accent: C.teal,
  },
  {
    platform: "Gemini 3.6 Flash",
    title: "Redacta el EOW",
    detail: "Sólo ve los cambios de la semana y el EOW anterior. Hasta tres intentos.",
    data: "Markdown en inglés",
    accent: C.teal,
  },
  {
    platform: "validator.py",
    title: "Controla el formato",
    detail: "Header, workstreams, cuentas, status permitidos, guiones y CONFIRMAR.",
    data: "Aprobado o hard stop",
    accent: C.amber,
  },
  {
    platform: "Gmail SMTP",
    title: "Entrega el draft",
    detail: "Guarda y commitea history/last_eow.md, después envía por STARTTLS.",
    data: "Mail a tu casilla",
    accent: C.teal,
  },
  {
    platform: "Vos",
    title: "Editás y reenviás",
    detail: "Resolvés los CONFIRMAR y mandás el EOW final al equipo interno.",
    data: "EOW enviado al equipo",
    accent: C.navy,
    highlight: true,
  },
];

const slide = pptx.addSlide();
slide.background = { color: C.cream };

text(slide, "PIPELINE DE LA AUTOMATIZACIÓN", 0.44, 0.34, 5.0, 0.24, {
  fontSize: 8.5, bold: true, color: C.teal, charSpacing: 1.4,
});
text(slide, "Por dónde pasa la data, plataforma por plataforma", 0.44, 0.62, 12.2, 0.5, {
  fontFace: "Aptos Display", fontSize: 25, bold: true, color: C.navy,
});
text(slide,
  "Un único recorrido: del cambio de Status en el Sheet al borrador que revisás y reenviás.",
  0.44, 1.16, 12.2, 0.32, { fontSize: 11.5, color: C.muted });

STAGES.forEach((stage, index) => stageCard(slide, index, stage));

const wrapStartX = X0 + 3 * (CARD_W + GAP) + CARD_W / 2;
const wrapEndX = X0 + CARD_W / 2;
slide.addShape(ST.line, {
  x: wrapStartX, y: ROW1_Y + CARD_H + 0.05,
  w: 0, h: WRAP_Y - (ROW1_Y + CARD_H + 0.05),
  line: { color: C.teal, width: 1.75 },
});
rule(slide, wrapEndX, WRAP_Y, wrapStartX - wrapEndX, C.teal, 1.75);
arrow(slide, wrapEndX, WRAP_Y, wrapEndX, ROW2_Y - 0.05, C.teal, 1.75);

const bandY = 6.5;
rect(slide, X0, bandY, 6.1, 0.46, C.white, 0.1, C.line);
text(slide, "DISPARADORES", X0 + 0.16, bandY + 0.06, 1.4, 0.16, {
  fontSize: 7, bold: true, color: C.teal, charSpacing: 0.8,
});
text(slide, "Cron jueves 16:00 ART · Run workflow · Control B2 opcional",
  X0 + 0.16, bandY + 0.24, 5.78, 0.18, { fontSize: 9, color: C.ink });

rect(slide, X0 + 6.36, bandY, 6.1, 0.46, C.paleOrange, 0.1, C.paleOrange);
text(slide, "HARD STOPS", X0 + 6.52, bandY + 0.06, 1.4, 0.16, {
  fontSize: 7, bold: true, color: C.amber, charSpacing: 0.8,
});
text(slide, "Sin cambios válidos · headers distintos · títulos duplicados · Gemini · validador · SMTP",
  X0 + 6.52, bandY + 0.24, 5.78, 0.18, { fontSize: 9, color: C.ink });

rule(slide, 0.44, 7.03, 12.45, C.line, 0.7);
text(slide, "Amazon EOW Reporter · WWS + TCP Analytics", 0.44, 7.08, 6.5, 0.17, {
  fontSize: 7.5, color: C.muted,
});

pptx.writeFile({ fileName: OUT }).then(() => {
  console.log(`Wrote ${OUT}`);
});
