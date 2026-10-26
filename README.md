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

# Primera apertura
