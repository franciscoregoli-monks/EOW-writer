/* Build the Amazon EOW Reporter presentation.
 * Install PptxGenJS before running: npm install pptxgenjs
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
pptx.subject = "Human-oriented overview of the automated EOW workflow";
pptx.title = "Amazon EOW Reporter";
pptx.lang = "es-AR";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "es-AR",
};
pptx.defineSlideMaster({
  title: "BASE",
  background: { color: "F6F3ED" },
  objects: [],
  slideNumber: { x: 12.55, y: 7.08, w: 0.35, h: 0.18, color: "6B7280", fontSize: 8 },
});

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
  green: "16875B",
  red: "B42318",
  amber: "B7791F",
  paleOrange: "FCE8C5",
  paleRed: "FCE8E6",
};

const ST = pptx.ShapeType;
const OUT = "presentations/amazon-eow-reporter-workflow.pptx";

function text(slide, value, x, y, w, h, opts = {}) {
  slide.addText(value, {
    x, y, w, h,
    fontFace: opts.fontFace || "Aptos",
    fontSize: opts.fontSize || 14,
    color: opts.color || C.ink,
    bold: opts.bold || false,
    breakLine: false,
    margin: opts.margin === undefined ? 0 : opts.margin,
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
  slide.addShape(ST.line, {
    x, y, w, h: 0,
    line: { color, width },
  });
}

function arrow(slide, x1, y1, x2, y2, color = C.teal, width = 2) {
  slide.addShape(ST.line, {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line: { color, width, endArrowType: "triangle" },
  });
}

function circleLabel(slide, label, x, y, fill, color = C.white, size = 0.52) {
  slide.addShape(ST.ellipse, {
    x, y, w: size, h: size,
    fill: { color: fill },
    line: { color: fill },
  });
  text(slide, label, x, y + 0.005, size, size - 0.01, {
    fontSize: 10,
    bold: true,
    color,
    align: "center",
  });
}

function tag(slide, label, x, y, w, fill, color = C.ink) {
  rect(slide, x, y, w, 0.28, fill, 0.12);
  text(slide, label.toUpperCase(), x + 0.08, y + 0.01, w - 0.16, 0.24, {
    fontSize: 8,
    bold: true,
    color,
    charSpacing: 1.1,
    align: "center",
  });
}

function header(slide, kicker, titleValue, subtitle, options = {}) {
  const dark = options.dark || false;
  const titleColor = dark ? C.white : C.navy;
  const subColor = dark ? "D6E0E0" : C.muted;
  text(slide, kicker.toUpperCase(), 0.55, 0.36, 4.4, 0.25, {
    fontSize: 9,
    bold: true,
    color: options.kickerColor || C.teal,
    charSpacing: 1.4,
  });
  text(slide, titleValue, 0.55, 0.7, 12.0, 0.55, {
    fontFace: "Aptos Display",
    fontSize: 27,
    bold: true,
    color: titleColor,
  });
  if (subtitle) {
    text(slide, subtitle, 0.55, 1.28, 11.9, 0.38, {
      fontSize: 12,
      color: subColor,
    });
  }
}

function footer(slide, label, dark = false) {
  rule(slide, 0.55, 7.03, 11.9, dark ? "42505A" : C.line, 0.7);
  text(slide, label, 0.55, 7.08, 6.5, 0.17, {
    fontSize: 7.5,
    color: dark ? "AEB9BE" : C.muted,
  });
}

function card(slide, x, y, w, h, titleValue, body, opts = {}) {
  rect(slide, x, y, w, h, opts.fill || C.white, 0.12, opts.line || C.line);
  if (opts.label) {
    tag(slide, opts.label, x + 0.18, y + 0.18, opts.labelWidth || 1.18,
      opts.labelFill || C.cloud, opts.labelColor || C.teal);
  }
  text(slide, titleValue, x + 0.2, y + (opts.label ? 0.56 : 0.22), w - 0.4, 0.36, {
    fontSize: opts.titleSize || 16,
    bold: true,
    color: opts.titleColor || C.navy,
  });
  text(slide, body, x + 0.2, y + (opts.label ? 0.97 : 0.68), w - 0.4, h - (opts.label ? 1.1 : 0.82), {
    fontSize: opts.bodySize || 10.5,
    color: opts.bodyColor || C.muted,
    valign: "top",
    breakLine: true,
    bullet: opts.bullet,
  });
}

// Slide 1: cover
{
  const slide = pptx.addSlide("BASE");
  slide.background = { color: C.navy };
  text(slide, "AMAZON EOW REPORTER", 0.7, 0.58, 4.2, 0.28, {
    fontSize: 10, bold: true, color: C.orange, charSpacing: 1.8,
  });
  text(slide, "De cambios en tareas\na un borrador listo\npara revisar.", 0.7, 1.22, 6.2, 2.25, {
    fontFace: "Aptos Display", fontSize: 35, bold: true, color: C.white,
    valign: "top", breakLine: true,
  });
  text(slide,
    "Un workflow semanal que automatiza la recolección, redacción y control de calidad — sin automatizar la decisión final.",
    0.72, 3.8, 5.65, 0.92,
    { fontSize: 15, color: "D7E0E2", valign: "top", breakLine: true }
  );
  tag(slide, "Jueves · 16:00 ART", 0.72, 5.2, 2.15, C.teal, C.white);
  tag(slide, "Human in the loop", 3.0, 5.2, 1.98, C.mint, C.navy);

  rect(slide, 7.35, 0.75, 5.2, 5.95, "17242D", 0.2, "3A4851");
  const stages = [
    ["01", "Track", "Status cambia en Sheets", C.orange],
    ["02", "Think", "Gemini escribe el EOW", C.teal],
    ["03", "Trust", "El validador controla", C.green],
    ["04", "Review", "Vos editás y reenviás", C.mint],
  ];
  stages.forEach((s, i) => {
    const y = 1.25 + i * 1.22;
    circleLabel(slide, s[0], 7.85, y, s[3], s[3] === C.mint ? C.navy : C.white, 0.62);
    text(slide, s[1], 8.72, y - 0.01, 1.05, 0.28, {
      fontSize: 11, bold: true, color: C.white,
    });
    text(slide, s[2], 8.72, y + 0.29, 3.25, 0.34, {
      fontSize: 10.5, color: "BBC6CA",
    });
    if (i < stages.length - 1) {
      arrow(slide, 8.16, y + 0.69, 8.16, y + 1.08, "52616A", 1.2);
    }
  });
  text(slide, "Internal workflow concept · WWS + TCP Analytics", 0.72, 6.93, 5.3, 0.2, {
    fontSize: 8, color: "88969D",
  });
}

// Slide 2: problem and outcome
{
  const slide = pptx.addSlide("BASE");
  header(slide, "01 · El punto de partida", "El EOW era una cadena manual de memoria y formato",
    "El problema no era escribir: era reconstruir qué cambió, separar cuentas y no perder contexto.");

  text(slide, "ANTES", 0.65, 1.93, 1.0, 0.24, {
    fontSize: 9, bold: true, color: C.red, charSpacing: 1.3,
  });
  const before = [
    ["1", "Recordar", "Qué pasó durante la semana"],
    ["2", "Buscar", "Tareas, estados y comentarios"],
    ["3", "Traducir", "El tracker al formato EOW"],
    ["4", "Controlar", "WWS / TCP, tono y status"],
  ];
  before.forEach((item, i) => {
    const y = 2.35 + i * 0.83;
    circleLabel(slide, item[0], 0.7, y, C.paleRed, C.red, 0.42);
    text(slide, item[1], 1.27, y - 0.02, 1.18, 0.25, {
      fontSize: 12, bold: true, color: C.navy,
    });
    text(slide, item[2], 2.45, y - 0.02, 3.0, 0.3, {
      fontSize: 10.5, color: C.muted,
    });
  });

  rect(slide, 6.35, 1.9, 6.25, 4.35, C.navy, 0.18);
  tag(slide, "Ahora", 6.72, 2.28, 1.0, C.orange, C.navy);
  text(slide, "La máquina prepara.\nLa persona decide.", 6.72, 2.78, 5.25, 1.18, {
    fontFace: "Aptos Display", fontSize: 28, bold: true, color: C.white,
    valign: "top", breakLine: true,
  });
  text(slide,
    "El sistema convierte señales operativas en un borrador controlado. La revisión humana permanece justo antes de compartirlo.",
    6.72, 4.25, 4.95, 0.82,
    { fontSize: 13, color: "D4DEE1", valign: "top", breakLine: true }
  );
  rule(slide, 6.72, 5.34, 4.9, "3D4A53");
  text(slide, "Diseño central", 6.72, 5.55, 1.2, 0.2, {
    fontSize: 8, bold: true, color: C.orange, charSpacing: 1.1,
  });
  text(slide, "Automatizar el trabajo repetible, no el criterio editorial.", 8.0, 5.46, 3.8, 0.42, {
    fontSize: 11, bold: true, color: C.white,
  });
  footer(slide, "Amazon EOW Reporter · Narrative", false);
}

// Slide 3: user journey
{
  const slide = pptx.addSlide("BASE");
  header(slide, "02 · User journey", "Desde tu punto de vista son cuatro momentos",
    "No hay nuevas herramientas que aprender para la operación semanal.");

  const steps = [
    { n: "1", t: "Actualizás", b: "Cambias Status en la pestaña Tasks.", human: true },
    { n: "2", t: "Te olvidás", b: "Apps Script y GitHub trabajan en segundo plano.", human: false },
    { n: "3", t: "Recibís", b: "El jueves 16:00 llega el draft a tu casilla.", human: false },
    { n: "4", t: "Revisás", b: "Editás y reenviás al equipo en Gmail.", human: true },
  ];
  steps.forEach((s, i) => {
    const x = 0.62 + i * 3.15;
    rect(slide, x, 2.05, 2.72, 3.62, s.human ? C.white : C.cloud, 0.16, s.human ? C.orange : C.line);
    circleLabel(slide, s.n, x + 0.22, 2.29, s.human ? C.orange : C.teal,
      s.human ? C.navy : C.white, 0.55);
    tag(slide, s.human ? "Human" : "Automated", x + 1.22, 2.39, 1.18,
      s.human ? C.paleOrange : C.mint, C.navy);
    text(slide, s.t, x + 0.22, 3.18, 2.24, 0.42, {
      fontSize: 19, bold: true, color: C.navy,
    });
    text(slide, s.b, x + 0.22, 3.82, 2.22, 0.92, {
      fontSize: 12, color: C.muted, valign: "top", breakLine: true,
    });
    if (i < steps.length - 1) {
      arrow(slide, x + 2.74, 3.82, x + 3.06, 3.82, C.teal, 1.6);
    }
  });
  rect(slide, 0.62, 6.05, 11.92, 0.58, C.navy, 0.12);
  text(slide, "Tu esfuerzo semanal", 0.85, 6.19, 1.6, 0.25, {
    fontSize: 10, bold: true, color: C.orange,
  });
  text(slide, "Actualizar tareas + revisar un correo.", 2.5, 6.15, 4.1, 0.3, {
    fontSize: 12, bold: true, color: C.white,
  });
  text(slide, "Todo lo demás queda automatizado.", 8.15, 6.15, 3.9, 0.3, {
    fontSize: 12, color: "CFD9DC", align: "right",
  });
  footer(slide, "Amazon EOW Reporter · User experience", false);
}

// Slide 4: platforms
{
  const slide = pptx.addSlide("BASE");
  header(slide, "03 · Plataformas", "Cada herramienta hace una sola cosa — y la hace bien",
    "La integración conecta sistemas conocidos, sin crear una aplicación nueva.");
  const tools = [
    ["GS", "Google Sheets", "Trabajar", "Fuente maestra de tareas y estados", C.green],
    ["AS", "Apps Script", "Observar", "Registra cada cambio de Status", C.teal],
    ["GH", "GitHub Actions", "Orquestar", "Agenda, secretos y ejecución", C.navy],
    ["AI", "Gemini", "Redactar", "Transforma cambios en narrativa EOW", C.orange],
    ["GM", "Gmail", "Entregar", "Draft personal listo para editar", C.red],
  ];
  tools.forEach((t, i) => {
    const y = 1.95 + i * 0.9;
    circleLabel(slide, t[0], 0.7, y, t[4], C.white, 0.58);
    text(slide, t[1], 1.55, y - 0.01, 2.0, 0.28, {
      fontSize: 14, bold: true, color: C.navy,
    });
    tag(slide, t[2], 3.75, y + 0.02, 1.12, C.cloud, C.teal);
    text(slide, t[3], 5.28, y - 0.02, 4.95, 0.34, {
      fontSize: 11.5, color: C.muted,
    });
    text(slide, i < 2 ? "USER SPACE" : "AUTOMATION SPACE", 10.65, y + 0.02, 1.42, 0.24, {
      fontSize: 8, bold: true, color: i < 2 ? C.green : C.teal, align: "right", charSpacing: 0.8,
    });
    if (i < tools.length - 1) rule(slide, 1.55, y + 0.68, 10.45, C.line, 0.7);
  });
  footer(slide, "Amazon EOW Reporter · Platform map", false);
}

// Slide 5: Sheet architecture
{
  const slide = pptx.addSlide("BASE");
  header(slide, "04 · La fuente de verdad", "Tres pestañas. Tres responsabilidades claras.",
    "El diseño se adaptó al tracker existente; no obliga a mantener una cuarta tabla semanal.");

  card(slide, 0.65, 2.0, 3.55, 3.75, "Tasks", "Maestro deduplicado\n\n• Título de tarea\n• Account / Propiedad\n• Status\n• Categoria\n• Comentarios", {
    label: "Source", labelFill: C.mint, titleSize: 22, bodySize: 11.5,
  });
  arrow(slide, 4.28, 3.65, 4.74, 3.65, C.teal, 2);
  card(slide, 4.82, 2.0, 3.55, 3.75, "Log de Cambios", "Registro append-only\n\n• Fecha y hora\n• Título\n• Estado anterior\n• Estado nuevo", {
    label: "Events", labelFill: C.cloud, titleSize: 22, bodySize: 11.5,
  });
  arrow(slide, 8.45, 3.65, 8.91, 3.65, C.teal, 2);
  card(slide, 8.98, 2.0, 3.55, 3.75, "Control", "Trigger opcional\n\nB2 = TRUE solicita un draft inmediato.\n\nEl cron de las 16:00 no depende del checkbox.", {
    label: "Control", labelFill: C.paleOrange, titleSize: 22, bodySize: 11.5,
  });

  rect(slide, 0.65, 6.14, 11.88, 0.52, C.navy, 0.1);
  text(slide, "Cambio clave", 0.88, 6.27, 1.15, 0.2, {
    fontSize: 9, bold: true, color: C.orange,
  });
  text(slide, "El tiempo vive en el Log; el contexto vive en Tasks.", 2.15, 6.23, 5.6, 0.28, {
    fontSize: 12, bold: true, color: C.white,
  });
  text(slide, "Join por título normalizado", 9.25, 6.25, 2.78, 0.24, {
    fontSize: 9.5, color: "C9D4D7", align: "right",
  });
  footer(slide, "Amazon EOW Reporter · Data model", false);
}

// Slide 6: automated pipeline
{
  const slide = pptx.addSlide("BASE");
  slide.background = { color: C.navy };
  header(slide, "05 · Pipeline", "Qué ocurre automáticamente el jueves", 
    "Una secuencia observable, con gates explícitos y sin saltarse controles.", { dark: true, kickerColor: C.orange });

  const nodes = [
    ["01", "Schedule", "16:00 ART"],
    ["02", "Read", "Tasks + Log"],
    ["03", "Select", "Último cambio"],
    ["04", "Draft", "Gemini 3.6"],
    ["05", "Validate", "Contrato EOW"],
    ["06", "Save", "last_eow.md"],
    ["07", "Deliver", "Gmail SMTP"],
  ];
  nodes.forEach((n, i) => {
    const x = 0.52 + i * 1.8;
    rect(slide, x, 2.25, 1.5, 1.7, i === 4 ? "1B4D49" : "182630", 0.14, i === 4 ? C.mint : "384750");
    circleLabel(slide, n[0], x + 0.15, 2.45, i === 4 ? C.mint : C.teal,
      i === 4 ? C.navy : C.white, 0.44);
    text(slide, n[1], x + 0.15, 3.02, 1.2, 0.3, {
      fontSize: 11.5, bold: true, color: C.white,
    });
    text(slide, n[2], x + 0.15, 3.38, 1.18, 0.3, {
      fontSize: 9, color: "B8C5C9",
    });
    if (i < nodes.length - 1) {
      arrow(slide, x + 1.52, 3.1, x + 1.76, 3.1, C.orange, 1.3);
    }
  });

  text(slide, "AUTOMATED ZONE", 0.55, 4.45, 2.2, 0.25, {
    fontSize: 9, bold: true, color: C.orange, charSpacing: 1.4,
  });
  rule(slide, 2.55, 4.57, 9.95, "3C4B54", 1);
  rect(slide, 0.55, 5.0, 7.7, 1.15, "17242D", 0.13, "3D4B53");
  text(slide, "Hard stops", 0.82, 5.2, 1.2, 0.25, {
    fontSize: 10, bold: true, color: C.orange,
  });
  text(slide, "Sin cambios válidos · headers distintos · duplicados · Gemini inválido · SMTP falla",
    2.05, 5.15, 5.82, 0.38, { fontSize: 10.5, color: C.white, bold: true });
  text(slide, "Un error frena el envío — no produce un EOW silenciosamente incorrecto.",
    2.05, 5.57, 5.82, 0.29, { fontSize: 9.5, color: "B9C5C9" });

  rect(slide, 8.55, 5.0, 3.95, 1.15, C.mint, 0.13);
  text(slide, "Human review", 8.82, 5.18, 1.3, 0.25, {
    fontSize: 10, bold: true, color: C.teal,
  });
  text(slide, "Editar + reenviar", 8.82, 5.52, 2.9, 0.32, {
    fontSize: 16, bold: true, color: C.navy,
  });
  footer(slide, "Amazon EOW Reporter · Automation boundary", true);
}

// Slide 7: AI contract
{
  const slide = pptx.addSlide("BASE");
  header(slide, "06 · Trust layer", "Gemini propone. El código acepta o rechaza.",
    "El prompt define el comportamiento; validator.py hace cumplir la sintaxis.");
  rect(slide, 0.65, 1.95, 5.72, 4.58, C.navy, 0.18);
  tag(slide, "System prompt", 0.95, 2.25, 1.55, C.orange, C.navy);
  const rules = [
    "English only",
    "Secciones por workstream",
    "Separación WWS / TCP",
    "Cada bullet: [Analytics]",
    "Status permitido al final",
    "No inventar: [CONFIRMAR]",
    "Carry-forward vs. last EOW",
  ];
  rules.forEach((r, i) => {
    circleLabel(slide, String(i + 1), 0.98, 2.84 + i * 0.45, C.teal, C.white, 0.3);
    text(slide, r, 1.43, 2.81 + i * 0.45, 4.22, 0.28, {
      fontSize: 10.5, color: C.white, bold: i === 5,
    });
  });
  text(slide, "Output: markdown profesional", 0.98, 6.02, 4.45, 0.25, {
    fontSize: 10, bold: true, color: C.mint,
  });

  text(slide, "validator.py", 7.0, 1.98, 2.0, 0.35, {
    fontSize: 18, bold: true, color: C.navy,
  });
  const checks = [
    ["Header", "Fecha exacta"],
    ["Bullets", "Prefijo + status"],
    ["Typography", "Sin em dash"],
    ["Sections", "No vacías"],
    ["Confirmations", "Conteo 1:1"],
  ];
  checks.forEach((c, i) => {
    const y = 2.55 + i * 0.66;
    rect(slide, 7.0, y, 5.05, 0.52, i === 4 ? C.mint : C.white, 0.1, C.line);
    text(slide, c[0], 7.22, y + 0.11, 1.3, 0.22, {
      fontSize: 10.5, bold: true, color: C.teal,
    });
    text(slide, c[1], 8.65, y + 0.11, 2.82, 0.22, {
      fontSize: 10.5, color: C.muted,
    });
  });
  rect(slide, 7.0, 6.0, 5.05, 0.5, C.paleRed, 0.1);
  text(slide, "Si falla → retry x3 → hard stop", 7.23, 6.11, 4.48, 0.24, {
    fontSize: 11, bold: true, color: C.red,
  });
  footer(slide, "Amazon EOW Reporter · AI governance", false);
}

// Slide 8: inbox output
{
  const slide = pptx.addSlide("BASE");
  header(slide, "07 · El resultado", "Un draft visible, editable y listo para reenviar",
    "El correo llega a tu casilla personal. Nunca sale directo al equipo.");

  rect(slide, 0.68, 1.88, 7.45, 4.85, C.white, 0.16, C.line);
  rect(slide, 0.68, 1.88, 7.45, 0.58, C.cloud, 0.16, C.line);
  circleLabel(slide, "E", 0.95, 2.0, C.orange, C.navy, 0.34);
  text(slide, "EOW Report - Week Ending 2026-08-28", 1.46, 1.99, 5.88, 0.28, {
    fontSize: 12, bold: true, color: C.navy,
  });
  text(slide, "To: tu casilla personal", 0.98, 2.7, 4.8, 0.24, {
    fontSize: 9, color: C.muted,
  });
  rule(slide, 0.98, 3.07, 6.72, C.line);
  text(slide, "Consultancy", 0.98, 3.3, 3.0, 0.35, {
    fontSize: 17, bold: true, color: C.navy,
  });
  text(slide, "WWS", 0.98, 3.78, 0.8, 0.25, {
    fontSize: 10, bold: true, color: C.teal,
  });
  text(slide, "[Analytics] AI Conversational Marketing Channel [CONFIRMAR] - DONE -",
    1.02, 4.15, 6.34, 0.62, { fontSize: 11.5, color: C.ink, valign: "top", breakLine: true });
  rect(slide, 0.98, 5.05, 6.7, 1.05, C.paleOrange, 0.1);
  text(slide, "Needs confirmation", 1.2, 5.2, 2.1, 0.24, {
    fontSize: 10, bold: true, color: C.amber,
  });
  text(slide, "1. [CONFIRMAR] Revisar notas y blockers antes del reenvío.",
    1.2, 5.55, 5.85, 0.26, { fontSize: 10, color: C.ink });

  text(slide, "Tu hard stop", 8.75, 2.05, 2.5, 0.3, {
    fontSize: 10, bold: true, color: C.orange, charSpacing: 1.2,
  });
  text(slide, "Leer.\nEditar.\nReenviar.", 8.75, 2.62, 3.35, 1.85, {
    fontFace: "Aptos Display", fontSize: 29, bold: true, color: C.navy,
    valign: "top", breakLine: true,
  });
  text(slide, "La automatización termina al entregar el draft. La responsabilidad editorial permanece humana.",
    8.78, 5.03, 3.35, 0.92, { fontSize: 12, color: C.muted, valign: "top", breakLine: true });
  tag(slide, "No auto-send al equipo", 8.78, 6.13, 2.55, C.mint, C.navy);
  footer(slide, "Amazon EOW Reporter · Review-ready output", false);
}

// Slide 9: hard stops
{
  const slide = pptx.addSlide("BASE");
  header(slide, "08 · Control de riesgo", "El sistema falla de forma visible y segura",
    "Rojo significa que algo necesita atención. No significa que se envió un reporte incorrecto.");

  const stops = [
    ["Datos", "Headers distintos o títulos duplicados", "Antes de Gemini"],
    ["Señal", "Sin cambios de Status válidos", "Sin email vacío"],
    ["AI", "Error de API o formato inválido", "Retry hasta 3"],
    ["Entrega", "SMTP no autentica o no responde", "Run rojo"],
    ["Humano", "Hay [CONFIRMAR] pendientes", "Editar antes de forward"],
  ];
  stops.forEach((s, i) => {
    const y = 1.95 + i * 0.88;
    circleLabel(slide, "!", 0.72, y + 0.02, i === 4 ? C.orange : C.red, C.white, 0.46);
    text(slide, s[0], 1.42, y, 1.15, 0.27, {
      fontSize: 11.5, bold: true, color: C.navy,
    });
    text(slide, s[1], 2.72, y, 5.15, 0.3, {
      fontSize: 11, color: C.ink,
    });
    tag(slide, s[2], 9.15, y + 0.01, 2.35, i === 4 ? C.paleOrange : C.paleRed,
      i === 4 ? C.amber : C.red);
    if (i < stops.length - 1) rule(slide, 1.42, y + 0.6, 10.08, C.line, 0.7);
  });

  rect(slide, 0.72, 6.35, 10.78, 0.5, C.navy, 0.1);
  text(slide, "Principio", 0.95, 6.47, 0.9, 0.2, {
    fontSize: 9, bold: true, color: C.orange,
  });
  text(slide, "Ante la duda, detener y mostrar — nunca completar con una suposición.",
    1.9, 6.42, 8.95, 0.28, { fontSize: 11, bold: true, color: C.white });
  footer(slide, "Amazon EOW Reporter · Failure behavior", false);
}

// Slide 10: security
{
  const slide = pptx.addSlide("BASE");
  header(slide, "09 · Seguridad", "Las llaves viven en GitHub — no en el código",
    "Cada integración recibe únicamente el permiso que necesita.");

  rect(slide, 0.72, 1.95, 3.35, 4.65, C.navy, 0.18);
  text(slide, "GitHub Secrets", 1.0, 2.25, 2.6, 0.38, {
    fontSize: 20, bold: true, color: C.white,
  });
  text(slide, "Vault cifrado", 1.0, 2.73, 1.6, 0.22, {
    fontSize: 9, bold: true, color: C.orange, charSpacing: 1,
  });
  const secrets = ["GCP_SA_KEY_BASE64", "SPREADSHEET_ID", "GEMINI_API_KEY", "EMAIL_USER", "EMAIL_PASSWORD", "EMAIL_TO"];
  secrets.forEach((s, i) => {
    rect(slide, 0.98, 3.18 + i * 0.47, 2.75, 0.31, "1B2A34", 0.08, "3E4C55");
    text(slide, s, 1.12, 3.22 + i * 0.47, 2.42, 0.2, {
      fontFace: "Courier New", fontSize: 8.5, color: "D6E0E2",
    });
  });

  const perms = [
    ["Google", "Service Account", "Editor de una Sheet"],
    ["Gemini", "API key", "Generative Language"],
    ["Gmail", "App Password", "SMTP del remitente"],
    ["GitHub", "contents: write", "Solo history/"],
  ];
  perms.forEach((p, i) => {
    const y = 2.05 + i * 1.02;
    circleLabel(slide, String(i + 1), 4.72, y, C.teal, C.white, 0.48);
    text(slide, p[0], 5.46, y - 0.02, 1.18, 0.25, {
      fontSize: 11.5, bold: true, color: C.navy,
    });
    text(slide, p[1], 6.78, y - 0.02, 2.0, 0.25, {
      fontSize: 11, color: C.ink,
    });
    text(slide, p[2], 9.1, y - 0.02, 2.65, 0.25, {
      fontSize: 10.5, color: C.muted,
    });
    if (i < perms.length - 1) rule(slide, 5.46, y + 0.56, 6.28, C.line, 0.7);
  });

  rect(slide, 4.72, 6.08, 7.03, 0.52, C.mint, 0.1);
  text(slide, "No secrets in code · No secrets in logs · No direct team send",
    4.95, 6.19, 6.58, 0.26, { fontSize: 10.5, bold: true, color: C.navy, align: "center" });
  footer(slide, "Amazon EOW Reporter · Least privilege", false);
}

// Slide 11: evolution
{
  const slide = pptx.addSlide("BASE");
  header(slide, "10 · La historia del build", "El diseño mejoró cada vez que tocó la realidad",
    "No fue una línea recta: cada prueba eliminó una suposición.");

  const milestones = [
    ["01", "Blueprint", "2 fases +\nweekly tab"],
    ["02", "Reality", "Tasks + Log\nya existían"],
    ["03", "Join", "Log temporal +\nmaestro"],
    ["04", "Logger fix", "Status por\nheader"],
    ["05", "Safety", "Datos corruptos\nse ignoran"],
    ["06", "Model", "2.0 retirado →\n3.6 Flash"],
    ["07", "Simplify", "Draft jueves +\nreview humano"],
  ];
  rule(slide, 0.92, 3.31, 11.1, C.teal, 2);
  milestones.forEach((m, i) => {
    const x = 0.72 + i * 1.72;
    circleLabel(slide, m[0], x, 3.03, i === milestones.length - 1 ? C.orange : C.teal,
      i === milestones.length - 1 ? C.navy : C.white, 0.56);
    text(slide, m[1], x - 0.32, 2.28, 1.2, 0.28, {
      fontSize: 10.5, bold: true, color: C.navy, align: "center",
    });
    text(slide, m[2], x - 0.43, 3.83, 1.42, 0.62, {
      fontSize: 9.5, color: C.muted, align: "center", valign: "top", breakLine: true,
    });
  });

  rect(slide, 0.72, 5.28, 11.45, 1.12, C.navy, 0.14);
  text(slide, "Resultado final", 1.0, 5.52, 1.3, 0.24, {
    fontSize: 9, bold: true, color: C.orange, charSpacing: 1,
  });
  text(slide, "Menos estructura artificial. Más señal real. Un punto humano claro.",
    2.4, 5.42, 8.95, 0.42, { fontSize: 16, bold: true, color: C.white, align: "center" });
  footer(slide, "Amazon EOW Reporter · Design evolution", false);
}

// Slide 12: operating guide
{
  const slide = pptx.addSlide("BASE");
  slide.background = { color: C.navy };
  header(slide, "11 · Operating guide", "Qué hacés vos. Qué hace el sistema.",
    "Un ritual semanal pequeño y repetible.", { dark: true, kickerColor: C.orange });

  rect(slide, 0.7, 1.95, 5.5, 4.45, C.white, 0.18);
  tag(slide, "Vos", 1.02, 2.25, 0.82, C.orange, C.navy);
  const humanSteps = [
    ["1", "Durante la semana", "Actualizá Status en Tasks."],
    ["2", "Jueves después de 16:00", "Abrí el draft en tu inbox."],
    ["3", "Antes de compartir", "Resolvé [CONFIRMAR], editá y reenviá."],
  ];
  humanSteps.forEach((s, i) => {
    const y = 2.87 + i * 0.96;
    circleLabel(slide, s[0], 1.04, y, C.orange, C.navy, 0.42);
    text(slide, s[1], 1.65, y - 0.02, 2.12, 0.25, {
      fontSize: 10.5, bold: true, color: C.navy,
    });
    text(slide, s[2], 1.65, y + 0.29, 3.82, 0.31, {
      fontSize: 10.5, color: C.muted,
    });
  });

  rect(slide, 6.55, 1.95, 6.05, 4.45, "172630", 0.18, "394851");
  tag(slide, "Sistema", 6.88, 2.25, 1.1, C.teal, C.white);
  const sysSteps = [
    "Registra cambios",
    "Selecciona la semana",
    "Une contexto",
    "Redacta",
    "Valida",
    "Guarda",
    "Envía",
  ];
  sysSteps.forEach((s, i) => {
    const col = i < 4 ? 0 : 1;
    const row = col === 0 ? i : i - 4;
    const x = 6.92 + col * 2.65;
    const y = 2.95 + row * 0.72;
    circleLabel(slide, "✓", x, y, C.mint, C.navy, 0.35);
    text(slide, s, x + 0.52, y + 0.01, 1.9, 0.24, {
      fontSize: 10.5, bold: true, color: C.white,
    });
  });
  text(slide, "Si algo no cierra, se detiene.", 6.92, 5.97, 4.85, 0.27, {
    fontSize: 11, bold: true, color: C.orange,
  });
  footer(slide, "Amazon EOW Reporter · Thursday 16:00 ART", true);
}

// Slide 13: closing
{
  const slide = pptx.addSlide("BASE");
  slide.background = { color: C.teal };
  text(slide, "AMAZON EOW REPORTER", 0.72, 0.72, 3.5, 0.26, {
    fontSize: 9, bold: true, color: C.mint, charSpacing: 1.5,
  });
  text(slide, "Predictable.\nAuditable.\nHuman-controlled.", 0.72, 1.48, 7.0, 2.45, {
    fontFace: "Aptos Display", fontSize: 39, bold: true, color: C.white,
    valign: "top", breakLine: true,
  });
  text(slide,
    "El jueves llega un primer draft. La automatización hace el trabajo repetible. Vos conservás la última palabra.",
    0.75, 4.43, 6.0, 0.88,
    { fontSize: 15, color: "D6F1E3", valign: "top", breakLine: true }
  );

  rect(slide, 8.2, 1.3, 3.9, 4.65, C.navy, 0.2);
  text(slide, "THE BOUNDARY", 8.6, 1.75, 2.8, 0.25, {
    fontSize: 9, bold: true, color: C.orange, charSpacing: 1.2, align: "center",
  });
  circleLabel(slide, "AI", 9.63, 2.45, C.orange, C.navy, 1.0);
  text(slide, "Draft", 8.62, 3.68, 2.9, 0.35, {
    fontSize: 18, bold: true, color: C.white, align: "center",
  });
  arrow(slide, 10.13, 4.23, 10.13, 4.63, C.mint, 2);
  text(slide, "HUMAN REVIEW", 8.62, 4.85, 2.9, 0.27, {
    fontSize: 10, bold: true, color: C.mint, charSpacing: 1.1, align: "center",
  });
  text(slide, "Send", 8.62, 5.26, 2.9, 0.32, {
    fontSize: 18, bold: true, color: C.white, align: "center",
  });
  text(slide, "WWS + TCP Analytics · Monks", 0.75, 6.9, 4.0, 0.2, {
    fontSize: 8, color: "BFE4D1",
  });
}

pptx.writeFile({ fileName: OUT });
