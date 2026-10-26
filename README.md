# Acerca de
Servidor de asistencia para fácilmente con una computadora escanear DNI y ver si pertenecen a una hoja de cálculo de Google.

\+ AD MAIOREM DEI GLORIAM +

# Instalación
En una terminal, posicionados donde queremos almacenar los archivos corremos
```
git clone https://github.com/altnavi/asistencia-server.git &&
cd asistencia-server/ &&
npm.cmd install
```

## Repositorio
Luego de clonar debe agregar los siguientes archivos:
```
asistencia-server/
├-certs/
│  └-credentials.json
├-.env
└-gente.csv
```

El `.env` consta de:
```
PORT=3000
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./certs/credentials.json
```
donde hay que completar el ID de la hoja de cálculo.

## Credenciales
Para las credenciales necesitamos ir a la [Consola de Google Cloud](https://console.cloud.google.com/), creamos un proyecto nuevo; buscamos en [APIs y servicios](https://console.cloud.google.com/apis/) el nombre de la API que usaremos: _Google Sheets API_. Vamos [allí](https://console.cloud.google.com/apis/api/sheets.googleapis.com/) y la habilitamos.

Vamos a la pestaña [Cuentas de servicio](https://console.cloud.google.com/iam-admin/serviceaccounts) y creamos una cuenta de servicio. Vamos a la pestaña de credenciales, creamos una nueva llave y elegimos llave JSON. La descargamos y la renombramos a `credentials.json` ubicándola en `certs/`. Vamos a nuestra hoja de cálculo y al correo de la cuenta de servicio le damos acceso de edición.

## Llaves de privacidad
Necesitamos mkcert, así que lo instalamos. Puede ser con:
```
winget install -e --id FiloSottile.mkcert
```
Luego, corremos `gen-cert.bat`.

<br>

# Primera apertura
Habiendo descargado la lista de personas a admitir como un CSV con formato
| Nombre           | Apellido | DNI | ... |
|------------------|----------|-----|-----|
| Jon              | Doe      | 123 |     |

**...filas vacías...**

| Nombre           | Apellido | DNI | ... |
|------------------|----------|-----|-----|
| Jon              | Doe      | 123 |     |

donde los grupos están separados en subtablas. Habiéndolo llamado `gente.csv` y ubicádolo donde corresponde.

Y teniendo en nuestro Google Sheets una pestaña llamada "Asistencia" con forma 
| Fecha               | DNI | Nombre | Apellido | Status |
|---------------------|-----|--------|----------|--------|
| 01/01/1901 00:00:00 | 123 | Jon    | Doe      | 123    |

Corremos los comandos:
```
npm.cmd run import &&
npm.cmd run start
```

Que importan el archivo `gente.csv` en una base de datos, y luego abren el servidor.
Habrá un QR para los...

## Certificados

que se generaron y son para el celular (u otro dispositivo con navegador web). Debemos instalarlos, lo que este documento no incluirá... [**ayudín**.](https://www.google.com/search?q=instalar+rootCA.pem+en+mi+dispositivo)

# Listo
Ya puede escanear el PDF417 de los DNI y se informará si está presente en `gente.csv` o no y en qué grupo. En carpeta `logs/` se lleva un registro por si hay problemas al escribir el Sheets. Este se puede copiar y pegar (con `Ctrl+Shift+V`) manualmente.