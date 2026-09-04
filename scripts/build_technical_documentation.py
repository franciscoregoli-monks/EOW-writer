"""Build the technical documentation and append the live source files."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "amazon-eow-reporter-technical.md"

SOURCE_FILES = (
    ("Python orchestration", "main.py", "python"),
    ("Output validator", "validator.py", "python"),
    ("Google Sheets event capture", "apps-script/Code.gs", "javascript"),
    (
        "GitHub Actions workflow",
        ".github/workflows/eow_automation.yml",
        "yaml",
    ),
    ("Python dependencies", "requirements.txt", "text"),
)

BODY = """# Amazon EOW Reporter

## Documentación técnica y operativa

**Estado:** Implementado y probado  
**Última actualización:** 2026-09-04  
**Audiencia:** usuarios del tracker, responsables de Analytics y personas que
mantienen la automatización

---

## 1. Qué resuelve

Amazon EOW Reporter transforma los cambios semanales del tracker de WWS y TCP
en un borrador profesional de End of Week.

La persona usuaria sigue trabajando en Google Sheets. La automatización detecta
los cambios de estado, recupera el contexto de cada tarea, redacta un resumen en
inglés con Gemini, controla que el formato sea correcto, guarda una copia en
GitHub y envía el borrador a una casilla personal.

El último paso sigue siendo humano: revisar, editar y reenviar el correo al
equipo interno.

## 2. Experiencia desde el punto de vista del usuario

1. Durante la semana se actualiza la columna `Status` de las tareas.
2. Apps Script registra cada cambio en `Log de Cambios`.
3. El jueves a las 16:00 ART GitHub Actions inicia el proceso automáticamente.
4. Gemini redacta el EOW con los cambios válidos de esa semana.
5. El validador detiene el proceso si el texto no cumple las reglas.
6. El borrador llega a la dirección personal configurada en `EMAIL_TO`.
7. La persona revisa el mensaje, hace los ajustes necesarios y lo reenvía.

También se puede usar **Run workflow** en GitHub Actions para solicitar un
borrador inmediatamente. Ese botón envía un correo real.

## 3. Plataformas y responsabilidades

| Plataforma | Qué ve la persona usuaria | Responsabilidad técnica |
| --- | --- | --- |
| Google Sheets | Tracker de tareas y checkbox opcional | Fuente maestra y registro de cambios |
| Apps Script | Funciona al editar `Status` | Captura timestamp, tarea, estado anterior y nuevo |
| GitHub | Repositorio, historial y botón Run workflow | Aloja código, secretos y reportes |
| GitHub Actions | Run verde o rojo | Ejecuta Python los jueves a las 16:00 ART |
| Gemini API | No requiere interacción directa | Redacta el EOW con datos delimitados |
| Gmail SMTP | Borrador recibido en la casilla personal | Entrega el correo autenticado |
| Revisión humana | Editar y reenviar | Control editorial y decisión final |

## 4. Arquitectura

```mermaid
flowchart LR
    user["Usuario actualiza Status"] --> tasks["Sheet: Tasks"]
    tasks --> script["Apps Script onEdit"]
    script --> log["Sheet: Log de Cambios"]
    cron["Jueves 16:00 ART"] --> action["GitHub Actions"]
    manual["Run workflow"] --> action
    checkbox["Control B2 opcional"] --> dispatch["repository_dispatch"]
    dispatch --> action
    action --> reader["Python: join semanal"]
    log --> reader
    tasks --> reader
    history["last_eow.md anterior"] --> gemini["Gemini 3.6 Flash"]
    reader --> gemini
    gemini --> validator["validator.py"]
    validator -->|"válido"| report["history/last_eow.md"]
    validator -->|"inválido"| stop["Hard stop"]
    report --> smtp["Gmail SMTP"]
    smtp --> inbox["Casilla personal"]
    inbox --> review["Revisión y reenvío humano"]
```

## 5. Modelo de datos en Google Sheets

### 5.1 `Tasks`

Es la fuente maestra. Los encabezados deben coincidir exactamente:

1. `Titulo de Tarea`
2. `Mes`
3. `Fecha`
4. `Propiedad`
5. `Status`
6. `Owner`
7. `Reporter`
8. `LOEE (hs)`
9. `Categoria`
10. `Deadline Estimado`
11. `Link Jira`
12. `Referencias/Links y Comentarios`

Campos que utiliza el reporte:

- `Titulo de Tarea`: clave para unir con el log.
- `Propiedad`: determina WWS, TCP o Both.
- `Categoria`: se usa como workstream.
- `Referencias/Links y Comentarios`: aporta contexto y blockers.

La unión normaliza mayúsculas, minúsculas y espacios. Si existen dos títulos
equivalentes, las filas se combinan: los campos que coinciden se conservan y
los que conflictúan se envían como `[CONFIRMAR]`. El run deja un warning.

### 5.2 `Log de Cambios`

Apps Script agrega una fila cada vez que cambia `Status`:

1. `Fecha`
2. `Titulo de Tarea`
3. `Status Anterior`
4. `Status Nuevo`

El lector toma la ventana sábado-viernes y conserva toda la cadena de cambios
de cada tarea. El estado reportado es el último válido. Además se envían
`status_at_week_start`, `status_progression` y `changes_this_week` para que
Gemini describa la evolución, por ejemplo backlog a in progress a done.

### 5.3 `Control`

`Control!B2` es un disparador opcional para pedir un borrador inmediato mediante
Apps Script. El cron del jueves y el botón manual de GitHub no dependen de B2.
Después de una entrega correcta, Python lo devuelve a `FALSE` si estaba marcado.

## 6. Normalización y selección

### Accounts

| Valor en Sheet | Valor enviado a Gemini |
| --- | --- |
| WWS | WWS |
| TCP | TCP |
| Both, Ambas, Ambos | Both |
| vacío o desconocido | `[CONFIRMAR]` |

### Status

| Valor en Sheet | Estado de salida |
| --- | --- |
| Done | DONE |
| En progreso, In progress | IN PROGRESS |
| Bloqueado, Bloqueada, Blocked, Blocker | BLOCKER |
| Backlog, To do y equivalentes | No son estado reportado; sí entran en la evolución |
| Otro valor (cuenta, basura) | Se ignora con warning |

Si una tarea sólo se movió entre estados de contexto (Backlog, To do), no entra
al reporte. Si no queda ningún cambio válido en la semana, no se llama a Gemini
ni se envía un correo vacío.

## 7. Redacción con Gemini

Modelo: `gemini-3.6-flash`.

El prompt recibe dos contextos delimitados:

- Cambios semanales normalizados.
- `history/last_eow.md` de la ejecución anterior.

Reglas principales:

- Inglés exclusivamente.
- Secciones por workstream.
- Separación WWS / TCP.
- Cada bullet usa `- description - STATUS -`. No abre con un tag de equipo
  como `[Analytics]`; la palabra Analytics sí puede aparecer en el texto.
- Cada bullet termina con un estado permitido.
- Si la tarea cambió más de una vez en la semana, el texto describe esa
  evolución y el STATUS del bullet es el estado final.
- No se permiten em dashes ni en dashes.
- No se inventan datos.
- Toda ambigüedad se marca `[CONFIRMAR]`.
- Los temas de la semana anterior se identifican como carry-forward.
- El reporte termina con `Needs confirmation`.

La llamada se intenta hasta tres veces. Se reintenta tanto ante errores de API
como ante una respuesta que no pasa la validación.

## 8. Validación y hard stops

`validator.py` verifica el contrato antes de cualquier correo:

- Header con fecha `EOW Report - Week Ending YYYY-MM-DD`.
- Al menos un workstream y un bullet.
- Bullet `- description - STATUS -` sin tag de equipo al inicio.
- Status final válido.
- Uso exclusivo de guion corto.
- Una única sección `Needs confirmation`.
- Cuenta permitida: `WWS:`, `TCP:`, `WWS / TCP:` o `Account [CONFIRMAR]:`.
- Si el cuerpo tiene `[CONFIRMAR]`, el listado final no puede estar vacío ni
  tener más entradas que tags en el cuerpo. Un tag repetido, como una cuenta
  desconocida, se lista una sola vez.

Hard stops:

| Condición | Resultado |
| --- | --- |
| Secret faltante o inválido | Run rojo; no email |
| Header de Sheet modificado | Run rojo; no Gemini |
| Títulos duplicados | No detiene el run; campos en conflicto como `[CONFIRMAR]` |
| Sin cambios de Status válidos | Run rojo; no email vacío |
| Gemini falla tres veces | Run rojo; no email |
| Markdown inválido tres veces | Run rojo; no email |
| SMTP falla | Run rojo; reporte no se commitea |
| Reset de B2 falla luego del email | Se registra el error; el email sigue entregado |

## 9. Envío a la casilla personal

Python crea un mensaje MIME de texto plano:

- Subject: `EOW Report - Week Ending YYYY-MM-DD`.
- From: secret `EMAIL_USER`.
- To: secret `EMAIL_TO`.
- Autenticación: App Password almacenada en `EMAIL_PASSWORD`. Los espacios
  internos se eliminan antes del login, porque Google muestra la clave en
  grupos de cuatro caracteres.
- Transporte: `smtp.gmail.com:587` con STARTTLS.

El sistema no envía directamente al equipo. La revisión y el reenvío son un
hard stop humano deliberado.

## 10. Scheduler y ejecuciones manuales

El workflow usa `cron: "0 19 * * 4"`.

GitHub interpreta cron en UTC:

- 19:00 UTC del jueves.
- 16:00 ART del jueves.

Otros triggers:

- `workflow_dispatch`: botón **Run workflow**.
- `repository_dispatch`: llamado opcional desde `Control!B2`.

`concurrency` evita dos ejecuciones simultáneas, pero no impide que una ejecución
manual posterior genere un segundo correo. Run workflow siempre debe tratarse
como un envío real.

## 11. Secretos y permisos

| Secret | Uso |
| --- | --- |
| `GCP_SA_KEY_BASE64` | Service Account para Sheets |
| `SPREADSHEET_ID` | Identificador del tracker |
| `GEMINI_API_KEY` | Gemini API |
| `EMAIL_USER` | Remitente |
| `EMAIL_PASSWORD` | Gmail App Password |
| `EMAIL_TO` | Casilla personal de revisión |

Permisos mínimos:

- Google Sheets API y Google Drive API habilitadas.
- Sheet compartida como Editor con el Service Account.
- GitHub Actions con `contents: write`.
- Gmail con 2-Step Verification y App Password.
- PAT en Apps Script solamente si se habilita el trigger inmediato de B2.

Los valores secretos no aparecen en el código ni en los logs.

## 12. Runbook operativo

### Operación semanal

1. Actualizar `Status` en `Tasks`.
2. Confirmar que `Log de Cambios` recibió la fila.
3. El jueves después de las 16:00 revisar la casilla personal.
4. Revisar los `[CONFIRMAR]`.
5. Editar tono o detalle si hace falta.
6. Reenviar al equipo interno.

### Ejecución inmediata

1. Confirmar que existe al menos un cambio válido de esta semana.
2. En GitHub: Actions > EOW automation > Run workflow.
3. Recordar que el botón envía un correo real.

### Diagnóstico

1. Abrir el run rojo en GitHub Actions.
2. Expandir `Generate and email personal draft`.
3. Leer la última excepción.
4. Corregir la fuente o el permiso; no editar el reporte generado para ocultar
   un problema de datos.

## 13. Evolución del diseño

1. **Idea inicial:** una pestaña semanal nueva y dos fases, generación el jueves
   y envío automático el viernes.
2. **Alineación con la realidad:** se mantuvo el tracker existente y se usó
   `Log de Cambios` como fuente temporal.
3. **Corrección del logger:** Apps Script dejó de depender de una letra fija y
   ahora busca `Status` por nombre.
4. **Protección de datos:** los registros históricos con Both o WWS dentro del
   campo Status se ignoran.
5. **Modelo actualizado:** Gemini 2.0 Flash fue retirado; se migró a Gemini 3.6
   Flash.
6. **Validación real:** se comprobó lectura de B2, generación, archivo histórico
   y manejo de fallos.
7. **Simplificación final:** se eliminó el envío autónomo del viernes. El jueves
   llega un borrador personal y la persona conserva la decisión editorial.
8. **Prefijo de bullet:** se dejó de exigir `[Analytics]` al inicio de cada
   línea; el validador rechaza un tag de equipo entre corchetes al abrir el
   bullet, no la palabra Analytics.
9. **Evolución semanal:** el join dejó de quedarse sólo con el último evento y
   ahora envía la cadena completa de estados de la semana.
10. **Títulos repetidos:** dejaron de ser un hard stop; se combinan o se marcan
    `[CONFIRMAR]` si hay conflicto.

## 14. Limitaciones conocidas

- SMTP no ofrece idempotency key; una interrupción inmediatamente después de
  aceptar el correo podría producir un duplicado al reintentar.
- Cambiar sustancialmente el título rompe el join histórico.
- `Backlog` y `To do` no pueden ser el STATUS del bullet, pero sí aparecen en
  la evolución de la semana.
- El reporte refleja cambios de Status, no todas las ediciones de comentarios.
- GitHub schedule puede comenzar algunos minutos después de la hora exacta.

---

# Apéndice: código implementado

Los bloques siguientes se generan directamente desde los archivos activos del
repositorio para evitar diferencias entre la documentación y el código.
"""


def build() -> None:
    sections = [BODY.rstrip()]
    for title, relative_path, language in SOURCE_FILES:
        source = (ROOT / relative_path).read_text(encoding="utf-8").rstrip()
        sections.extend(
            (
                "",
                f"## {title}: `{relative_path}`",
                "",
                f"```{language}",
                source,
                "```",
            )
        )
    OUTPUT.write_text("\n".join(sections) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
