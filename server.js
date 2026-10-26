require("dotenv").config();

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const express = require("express");
const qrcode = require("qrcode-terminal");
const Database = require("better-sqlite3");
const { google } = require("googleapis");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const PUBLIC_DIR = path.join(__dirname, "public");
const DB_FILE = path.join(__dirname, "asistencia.db");
const CERT_FILE = path.join(__dirname, "certs", "asistencia.pem");
const KEY_FILE = path.join(__dirname, "certs", "asistencia-key.pem");
const ROOT_CA_FILE = path.join(__dirname, "certs", "rootCA.pem");

const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "asistencia_now.log");

app.use(express.json({
		limit: "32kb"
	}));

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");

// Google Sheets configuration
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_KEY_FILE = path.resolve(
		__dirname,
		process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || "./certs/credentials.json");

const GOOGLE_SHEET_RANGE = "Asistencia!A:F";

let sheetsClient = null;

async function getSheetsClient() {
	if (!GOOGLE_SHEET_ID) {
		throw new Error("Falta GOOGLE_SHEET_ID en .env");
	}

	if (!sheetsClient) {
		const auth = new google.auth.GoogleAuth({
			keyFile: GOOGLE_KEY_FILE,
			scopes: ["https://www.googleapis.com/auth/spreadsheets"]
		});

		sheetsClient = google.sheets({
			version: "v4",
			auth
		});
	}

	return sheetsClient;
}

function normalizarDni(value) {
	const dni = String(value ?? "").trim().replace(/[.\s-]/g, "");
	if (!/^\d+$/.test(dni))
		return null;
	const numero = Number(dni);
	return Number.isSafeInteger(numero) ? numero : null;
}

function getLocalIPs() {
	const addresses = [];
	for (const list of Object.values(os.networkInterfaces())) {
		for (const item of list || []) {
			if (item.family === "IPv4" && !item.internal && !item.address.startsWith("169.254.")) {
				addresses.push(item.address);
			}
		}
	}
	return [...new Set(addresses)];
}

// Cálculo dinámico del ancho de columnas basado en el log y el ancho de la terminal
let maxName = 10;
let maxApellido = 15;

function formatTimestamp(date = new Date()) {
	const two = n => String(n).padStart(2, "0");

	return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ` +
`${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

let lastTimestamp = formatTimestamp();

function printAttendanceHeader() {
	console.log(
		"FECHA".padEnd(19) + " " +
		"DNI".padStart(8) + " " +
		"NOMBRE".padEnd(maxName) + " " +
		"APELLIDO".padEnd(maxApellido) + " " +
		"G STATUS");
}

function printAttendanceRow(record) {
	console.log(
		record.fecha.padEnd(19) + " " +
		record.dni.padStart(8) + " " +
		record.nombre.padEnd(maxName) + " " +
		record.apellido.padEnd(maxApellido) + " " +
		(record.grupo ?? "-") + " " +
		record.status);
}

// Cola serializada para escrituras de log sincronizadas
// Local queue: write to log, then print the CLI row.
let outputQueue = Promise.resolve();

function enqueueAttendanceOutput(record) {
	const localTask = outputQueue.then(async() => {
		maxName = Math.max(maxName, record.nombre.length);
		maxApellido = Math.max(maxApellido, record.apellido.length);
		lastTimestamp = record.fecha;

		const line = [
			record.fecha,
			record.dni,
			record.nombre,
			record.apellido,
			record.status
		].join("\t") + "\n";

		await fs.promises.appendFile(LOG_FILE, line, "utf8");

		printAttendanceRow(record);
	});

	// Keep the queue usable after an individual write fails.
	outputQueue = localTask.catch(error => {
		console.error("Error en la cola local de log/CLI:", error.message);
	});

	// Return the individual task so the Internet queue can wait for it.
	return localTask;
}

// Internet queue: append to Google Sheets after local processing is idle.
let internetQueue = Promise.resolve();

function enqueueGoogleSheets(record, localTask) {
	internetQueue = internetQueue
		.then(async() => {
			await outputQueue;
			await localTask;

			const sheets = await getSheetsClient();
			await sheets.spreadsheets.values.append({
				spreadsheetId: GOOGLE_SHEET_ID,
				range: GOOGLE_SHEET_RANGE,
				valueInputOption: "USER_ENTERED",
				insertDataOption: "INSERT_ROWS",
				requestBody: {
					values: [[
							record.fecha,
							record.dni,
							record.nombre,
							record.apellido,
							//record.grupo,
							record.status
						]]
				}
			});
		})
		.catch(error => {
			console.error(
`Error en la cola de Google Sheets (DNI ${record.dni}):`,
				error.message);
		});

	return internetQueue;
}

app.get("/", (req, res) => res.redirect("/app"));
app.use("/app", express.static(PUBLIC_DIR));
app.get("/certs/rootCA.pem", (req, res) => {
	res.download(ROOT_CA_FILE, "rootCA.pem");
});

app.post("/", (req, res) => {
	if (isShuttingDown) {
		return res.status(503).json({
			status: "ERROR",
			message: "El servidor se está cerrando."
		});
	}

	try {
		if (req.body?.dni === undefined || req.body.dni === null) {
			return res.status(400).json({
				status: "ERROR",
				message: "Falta un DNI válido."
			});
		}

		const dni = normalizarDni(req.body.dni);
		if (dni === null) {
			return res.status(400).json({
				status: "ERROR",
				message: "El DNI debe contener solo números."
			});
		}

		const persona = db.prepare(`
      SELECT dni, nombre, apellido, grupo
      FROM gente
      WHERE dni = ?
      LIMIT 1
    `).get(dni);

		const scannedDni = String(req.body.dni).trim().replace(/[.\s-]/g, "");

		const record = {
			fecha: formatTimestamp(),
			dni: scannedDni,
			nombre: req.body.nombre,
			apellido: req.body.apellido,
			grupo: persona?.grupo ?? "-",
			status: persona ? "OK" : "NO_ESTA"
		};

		const localTask = enqueueAttendanceOutput(record);
		enqueueGoogleSheets(record, localTask);
		if (!persona) {
			return res.json({
				status: "NO_ANOTADO",
				dni
			});
		}

		return res.json({
			status: "OK",
			dni: persona.dni,
			nombre: persona.nombre,
			apellido: persona.apellido,
			grupo: persona.grupo
		});
	} catch (error) {
		console.error("Error al consultar DNI:", error.message);
		return res.status(500).json({
			status: "ERROR",
			message: "No se pudo consultar el DNI."
		});
	}
});

let tableHeaderPrinted = false;

async function printQrPair(ip) {
	const certUrl = `https://${ip}:${PORT}/certs/rootCA.pem`;
	const appUrl = `https://${ip}:${PORT}/app`;

	const render = url => new Promise(resolve => {
		qrcode.generate(url, {
			small: true
		}, resolve);
	});

	const [cert, webapp] = await Promise.all([
				render(certUrl),
				render(appUrl)
			]);

	const left = cert.trimEnd().split(/\r?\n/);
	const right = webapp.trimEnd().split(/\r?\n/);
	const width = Math.max(...left.map(line => line.length));

	console.log("\n  CERTIFICATE".padEnd(width + 5) + "WEBAPP");

	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		console.log(
			"  " + (left[i] || "").padEnd(width) +
			"     " + (right[i] || ""));
	}

	console.log("\n  CERT: " + certUrl);
	console.log("  WEBAPP: " + appUrl + "\n");

	printAttendanceHeader();
	tableHeaderPrinted = true;
}

let server;
let isShuttingDown = false;

function start() {
	const columns = db.prepare("PRAGMA table_info(gente)").all();
	const required = ["dni", "nombre", "apellido", "grupo"];
	const existing = columns.map(column => column.name);
	const missing = required.filter(column => !existing.includes(column));

	if (missing.length) {
		throw new Error(`Missing database columns: ${missing.join(", ")}`);
	}

	const total = db.prepare("SELECT COUNT(*) AS total FROM gente").get().total;
	if (total === 0) {
		throw new Error("No people found in the database.");
	}

	for (const file of[CERT_FILE, KEY_FILE, ROOT_CA_FILE]) {
		if (!fs.existsSync(file)) {
			throw new Error(`File not found: ${file}`);
		}
	}

	if (!fs.existsSync(LOG_DIR)) {
		fs.mkdirSync(LOG_DIR, {
			recursive: true
		});
	}
	fs.writeFileSync(LOG_FILE, "", "utf8");

	server = https.createServer({
		cert: fs.readFileSync(CERT_FILE),
		key: fs.readFileSync(KEY_FILE)
	}, app);

	server.listen(PORT, "0.0.0.0", async() => {
		console.log(`\nAttendance server running on port ${PORT}`);
		console.log(`People loaded: ${total}`);
		console.log(`Active log file: ${LOG_FILE}`);

		const ips = getLocalIPs();
		console.log("\nScan the two QR codes below:\n");

		if (ips.length) {
			await printQrPair(ips[0]);
		} else {
			console.log("No local IPv4 address found.");
			printAttendanceHeader();
			tableHeaderPrinted = true;
		}
	});
}

async function finalizeLog() {
	await outputQueue;

	if (!fs.existsSync(LOG_FILE)) {
		console.log("No se encontró el log para renombrar.");
		return;
	}

	const timestamp = lastTimestamp
		.replace(" ", "_")
		.replace(/:/g, "-");

	let targetPath = path.join(LOG_DIR, `asistencia_${timestamp}.log`);
	let counter = 1;

	while (fs.existsSync(targetPath)) {
		targetPath = path.join(
				LOG_DIR,
`asistencia_${timestamp}_${counter++}.log`);
	}

	await fs.promises.rename(LOG_FILE, targetPath);
	console.log(`Log guardado como: logs/${path.basename(targetPath)}`);
}

function shutdown() {
	if (isShuttingDown)
		return;
	isShuttingDown = true;

	console.log("\nStopping server...");

	const finishShutdown = async() => {
		try {
			//await outputQueue;
			await outputQueue;
			await internetQueue;
			await finalizeLog();
		} catch (error) {
			console.error("Error al guardar el log:", error.message);
		}

		try {
			db.close();
		} catch (error) {
			console.error("Error al cerrar la base de datos:", error.message);
		}

		console.log("Cierre completado.");
		process.exit(0);
	};

	if (server) {
		server.close(error => {
			if (error) {
				console.error("Error al cerrar el servidor:", error.message);
			}
			finishShutdown();
		});
	} else {
		finishShutdown();
	}
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
	start();
} catch (error) {
	console.error("Startup error:", error.message);
	try {
		db.close();
	} catch (e) {}
	process.exitCode = 1;
}