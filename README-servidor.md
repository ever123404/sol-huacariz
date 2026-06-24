# Servidor de Impresión — Sol de Huacariz

## Qué hace
Escucha Firebase en tiempo real. Cuando un mozo envía una comanda, 
automáticamente imprime:
- **Ticket Cocina** → impresora de cocina (platos y guarniciones)
- **Ticket Bar** → impresora de bar (bebidas)
- **Ticket Caja** → impresora de caja (todo con precios y total)

## Hardware requerido
- 3 impresoras térmicas WiFi 80mm (recomendado: Xprinter XP-Q200)
- Router WiFi que cubra cocina, bar y caja
- Si cocina está a 30m del bar: repetidor WiFi TP-Link (~S/ 70)

## Instalación

### 1. Configurar Firebase Admin
- Ve a Firebase Console → Configuración del proyecto → Cuentas de servicio
- Genera nueva clave privada → descarga el JSON
- Copia los valores al archivo .env

### 2. Crear archivo .env
```
FIREBASE_PROJECT_ID=sol-huacariz
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@sol-huacariz.iam.gserviceaccount.com
PRINTER_COCINA_IP=192.168.1.101
PRINTER_BAR_IP=192.168.1.102
PRINTER_CAJA_IP=192.168.1.103
PRINTER_PORT=9100
```

### 3. Despliegue gratuito en Railway
1. Sube print-server.js y package.json a un repo GitHub privado
2. Entra a railway.app → New Project → Deploy from GitHub
3. Agrega las variables de entorno
4. Deploy automático

## IPs de las impresoras
Cada impresora WiFi tiene una IP asignada por el router.
Para encontrarla: conecta la impresora al WiFi e imprime 
la página de configuración (mantén presionado el botón feed).
