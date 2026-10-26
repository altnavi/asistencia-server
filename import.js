const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { parse } = require("csv-parse/sync");

const csvPath = path.join(__dirname, "gente.csv");
const dbPath = path.join(__dirname, "asistencia.db");

function limpiarTexto(valor) {
  return String(valor ?? "").trim();
}

function normalizarEncabezado(valor) {
  return limpiarTexto(valor)
    .replace(/^[|]+|[|]+$/g, "")
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function normalizarDni(valor) {
  const dni = limpiarTexto(valor).replace(/[.\s-]/g, "");

  if (!/^\d+$/.test(dni)) return null;

  const numero = Number(dni);
  return Number.isSafeInteger(numero) ? numero : null;
}

function obtenerColumnas(fila) {
  const encabezados = fila.map(normalizarEncabezado);

  const nombre = encabezados.indexOf("nombre");
  const apellido = encabezados.indexOf("apellido");
  const dni = encabezados.indexOf("dni");

  if (nombre === -1 || apellido === -1 || dni === -1) {
    return null;
  }

  return { nombre, apellido, dni };
}

function main() {
  if (!fs.existsSync(csvPath)) {
    throw new Error("No se encontró gente.csv");
  }

  const contenido = fs.readFileSync(csvPath, "utf8");

  const filas = parse(contenido, {
    bom: true,
    skip_empty_lines: false,
    relax_column_count: true,
    relax_quotes: true
  });

  const personas = [];
  const dniVistos = new Set();

  let grupoActual = 0;
  let columnasActuales = null;
  let invalidos = 0;
  let duplicados = 0;

  for (const fila of filas) {
    const columnas = obtenerColumnas(fila);

    // Cada encabezado nuevo inicia un grupo.
    if (columnas) {
      grupoActual++;
      columnasActuales = columnas;
      continue;
    }

    if (grupoActual === 0 || !columnasActuales) continue;

    if (fila.every(valor => limpiarTexto(valor) === "")) {
      continue;
    }

    const nombre = limpiarTexto(fila[columnasActuales.nombre]);
    const apellido = limpiarTexto(fila[columnasActuales.apellido]);
    const dni = normalizarDni(fila[columnasActuales.dni]);

    if (!nombre || !apellido || dni === null) {
      invalidos++;
      continue;
    }

    if (dniVistos.has(dni)) {
      duplicados++;
      console.warn(
        `DNI duplicado omitido: ${dni} (grupo ${grupoActual})`
      );
      continue;
    }

    dniVistos.add(dni);
    personas.push({ dni, nombre, apellido, grupo: grupoActual });
  }

  if (grupoActual === 0) {
    throw new Error(
      "No se encontraron encabezados con Nombre, Apellido y DNI."
    );
  }

  if (personas.length === 0) {
    throw new Error(
      "No se encontraron personas válidas. No se modificó la base de datos."
    );
  }

  const db = new Database(dbPath);

  try {
    const importar = db.transaction(() => {
      db.exec("DROP TABLE IF EXISTS gente");

      db.exec(`
        CREATE TABLE gente (
          dni INTEGER PRIMARY KEY,
          nombre TEXT NOT NULL,
          apellido TEXT NOT NULL,
          grupo INTEGER NOT NULL
        );
      `);

      const insertar = db.prepare(`
        INSERT INTO gente (dni, nombre, apellido, grupo)
        VALUES (@dni, @nombre, @apellido, @grupo)
      `);

      for (const persona of personas) {
        insertar.run(persona);
      }
    });

    importar();

    console.log("\nImportación terminada.");
    console.log(`Grupos detectados: ${grupoActual}`);
    console.log(`Personas importadas: ${personas.length}`);
    console.log(`Filas inválidas omitidas: ${invalidos}`);
    console.log(`DNI duplicados omitidos: ${duplicados}`);

    console.log("\nPersonas por grupo:");
    console.table(db.prepare(`
      SELECT grupo, COUNT(*) AS personas
      FROM gente
      GROUP BY grupo
      ORDER BY grupo
    `).all());

    console.log("\nPrimeras personas importadas:");
    console.table(db.prepare(`
      SELECT dni, nombre, apellido, grupo
      FROM gente
      ORDER BY grupo, apellido, nombre
      LIMIT 10
    `).all());
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error("Error al importar:", error.message);
  process.exitCode = 1;
}