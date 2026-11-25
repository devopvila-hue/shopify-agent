# shopify-agent

Una **tienda online con panel de administración** y, encima, una **API de
tools** para que cualquier agente de IA pueda manejarla.

No hay chat. No hay modelo dentro. El servidor ejecuta órdenes: las del
dueño desde el panel, las de una IA desde MCP o desde REST.

```
┌────────────────┐   MCP · REST · OpenAI functions   ┌────────────────┐   GraphQL   ┌─────────┐
│  agente de IA  │ ────────────────────────────────▶ │ shopify-agent  │ ──────────▶ │ Shopify │
└────────────────┘                                   └────────────────┘             └─────────┘
┌────────────────┐
│  panel /admin  │ ───── la misma API de tools ──────▶
└────────────────┘
```

- **Cero dependencias de runtime.** El `http` y el `fetch` de Node. Sin SDK,
  sin `zod`, sin `graphql-request`, sin build.
- **Funciona sin credenciales.** Arranca contra una tienda mock sembrada.
- **Cuatro idiomas**: inglés, español, rumano y húngaro.
- **IVA por país**, con precios mostrados con el impuesto incluido (norma UE).
- **30 plantillas de diseño**, una por industria, con selector en el panel.
- **Stripe** para el pago con tarjeta, sin SDK y con webhook firmado.
- **Todo en software libre.** Shopify cobra por cada módulo; esto no cobra
  por categorías, ni por idiomas, ni por plantillas, ni por panel.

---

## Arranque rápido

```bash
git clone https://github.com/devopvila-hue/shopify-agent.git
cd shopify-agent
npm start
```

Sin `npm install`: no hay dependencias que instalar.

| | |
| --- | --- |
| Tienda | <http://127.0.0.1:8788/> |
| Panel del dueño | <http://127.0.0.1:8788/admin> |
| Catálogo de tools | <http://127.0.0.1:8788/tools.html> |
| API de tools | <http://127.0.0.1:8788/tools> |

Para hablar con una tienda real, copia `.env.example` a `.env`, rellena las
credenciales y `npm start` otra vez. El resto de la API es idéntica.

```bash
npm test          # 83 tests, sin red
npm run smoke     # arranca el server y prueba los tres transportes
npm run build     # exporta el catálogo estático y genera dist/
```

---

## La tienda

- Portada con hero, catálogo por categorías, ficha de producto con variantes
  y stock, carrito lateral y checkout.
- Idiomas: inglés, español, rumano y húngaro. El idioma se detecta por
  `Accept-Language`, se puede forzar con `?lang=ro` y se recuerda en el
  navegador.
- Precios netos guardados, mostrados con IVA según el país de la tienda.
  El IVA se desglosa en el carrito.
- Imágenes reales de producto (subidas desde el panel o por URL). Cuando no
  hay imagen, la tienda dibuja una ilustración determinista a partir del id,
  así que no depende de ninguna CDN.
- Ilustración del hero y de los productos generadas en SVG: cero ficheros de
  imagen, cero peticiones extra.

## El panel de administración (`/admin`)

Cinco secciones, en los cuatro idiomas:

| Sección | Qué haces |
| --- | --- |
| **Panel** | Ingresos, pedidos, productos, stock bajo y últimos pedidos. |
| **Productos** | Editar título, descripción, marca, categoría, precio, IVA, estado e imágenes. Subir ficheros o pegar URLs. Ver variantes y su stock. |
| **Categorías** | Crear, renombrar y borrar categorías, con su propio tipo de IVA. |
| **Pedidos** | Ver el detalle, marcar como pagado y marcar como enviado con seguimiento. |
| **Ajustes** | Nombre, moneda, país de impuestos, IVA incluido, envío, idioma por defecto y estado de Stripe. |
| **Diseño** | Las 30 plantillas: eliges una y se aplica a la tienda. |

El panel es otro cliente de la misma API de tools: **todo lo que haces desde
el panel es una tool que un agente también puede ejecutar**.

El panel es local por defecto. Si expones el servidor a internet, ponle
`ADMIN_PASSWORD` y el panel pide contraseña.

---

## Las 30 plantillas de diseño

Una por industria: moda, cerámica, plantas, deportes, electrónica, belleza,
joyería, panadería, café, vino, cerveza, orgánica, bricolage, outdoor,
ciclismo, mascotas, infantil, juguetes, papelería, fotografía, música, motor,
jardín, viajes, skincare, relojes, zapatillas, miel y senderismo.

Cada plantilla es un conjunto de tokens (paleta, tipografías, radio, densidad)
más tres conmutadores estructurales: tipo de portada, estilo de tarjeta y
forma de los botones. El CSS no tiene mil reglas: lee variables CSS y un
handful de atributos `data-*` en `<html>`. Cambiar de plantilla es cambiar
tokens, y por eso son treinta de verdad y no treinta forks del CSS.

```bash
# ver la tienda con otra plantilla
open "http://127.0.0.1:8788/?theme=brasa"
```

El selector de la cabecera y la galería del panel escriben el mismo ajuste
(`defaultTheme`), así que la plantilla elegida se aplica a todo el mundo.

---

## IVA

Los precios se guardan **netos**, como en Shopify. En la UE el precio que ve
el consumidor lleva el IVA incluido, así que la tienda convierte de neto a
bruto y lo desglosa en el carrito.

Tipos estándar vigentes en 2026 (Your Europe / Tax Foundation). El país se
configura en Ajustes y también puede fijarse por categoría o por producto:

| | | | |
| --- | --- | --- | --- |
| HU 27% | FI 25.5% | DK/SE/HR 25% | EE 24% |
| GR 24% | PL/PT/SK 23% | IE 23% | IT/SI 22% |
| BE/CZ/LT/LV/NL 21% | ES/RO 21% | FR 20% | AT/BG 20% |
| GB 20% | DE 19% | CY 19% | MT 18% |
| LU 17% | NO 25% | CH 8.1% | |

`list_tax_rates` devuelve la tabla completa.

---

## Stripe

Sin SDK: la API de Stripe se habla con `fetch` y el cuerpo en
`application/x-www-form-urlencoded`, y el webhook se verifica firmando el
payload con HMAC-SHA256 como manda Stripe.

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Sin `STRIPE_SECRET_KEY` la tienda funciona igual con pago simulado y el
botón de tarjeta no aparece. Con la clave puesta, el checkout crea una
Checkout Session alojada por Stripe; el webhook `POST /webhooks/stripe` marca
el pedido como pagado.

---

## La API de tools

Treinta tools desde un único catálogo, con tres transportes:

| Transporte | Endpoint | Para qué |
| --- | --- | --- |
| MCP Streamable HTTP | `POST /mcp` | Claude Desktop/Code, Cursor, Zed |
| REST | `POST /tools/{tool}` | Cualquier bucle propio de function-calling |
| Lote | `POST /commands` | Varias órdenes en una llamada |
| OpenAI | `GET /tools/openai` | Definiciones de función listas para tu `tools` |

### Conectar un cliente MCP

```json
{
  "mcpServers": {
    "shopify": {
      "type": "http",
      "url": "http://127.0.0.1:8788/mcp"
    }
  }
}
```

Si el cliente solo habla stdio:

```bash
npx @modelcontextprotocol/server-proxy --url http://127.0.0.1:8788/mcp
```

### Bucle de function-calling

```js
const res = await fetch('http://127.0.0.1:8788/tools/' + name, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body: JSON.stringify(args),
});
const { ok, data, error } = await res.json();
if (!ok) return modelFeedback(error.message);
return modelFeedback(data);
```

### Un lote de órdenes

```bash
curl -X POST http://127.0.0.1:8788/commands \
  -H 'Content-Type: application/json' \
  -d '{"commands":[{"tool":"search_products","arguments":{"query":"mug"}},
                   {"tool":"list_locations","arguments":{}}]}'
```

Un fallo en un comando no para los demás: cada resultado lleva su propio
`ok`.

### Catálogo

- Productos: buscar, leer, crear, actualizar, borrar, variantes, opciones.
- Inventario: ajuste absoluto o relativo por ubicación.
- Pedidos: crear, buscar, leer, actualizar, enviar.
- Clientes: buscar, leer, actualizar.
- Administración: categorías, imágenes, subida de ficheros, estadísticas,
  ajustes, tabla de IVA, sesión de checkout de Stripe.

Las tools de lectura se marcan como `readOnly`, las destructivas piden
`confirm: true`, y las de escritura llevan `idempotent` cuando lo son.

---

## Configuración

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `SHOPIFY_MODE` | `auto` | `mock`, `shopify` o `auto`. |
| `SHOPIFY_STORE_DOMAIN` | — | `tu-tienda.myshopify.com`. |
| `SHOPIFY_ACCESS_TOKEN` | — | Token estático `shpat_…` (apps antiguas). |
| `SHOPIFY_CLIENT_ID` / `_SECRET` | — | Client credentials (apps del Dev Dashboard). |
| `SHOPIFY_API_VERSION` | `2026-10` | Versión de la Admin API. |
| `HOST` / `PORT` | `127.0.0.1` / `8788` | Dirección de escucha. |
| `AGENT_API_KEY` | — | Si se pone, la API de tools pide `Bearer <key>`. |
| `ADMIN_PASSWORD` | — | Contraseña del panel. |
| `SHOP_DATA_FILE` | `./data/shop.json` | Dónde viven categorías, imágenes y ajustes. |
| `STRIPE_SECRET_KEY` | — | Pago con tarjeta. |
| `STRIPE_WEBHOOK_SECRET` | — | Verificación del webhook. |
| `PUBLIC_BASE_URL` | — | URLs de vuelta de Stripe. |

La autenticación contra Shopify usa el flujo de **client credentials** cuando
puede: Shopify dejó de emitir tokens estáticos en su interfaz en enero de
2026. El servidor los cambia por uno de vida corta y lo refresca solo.

---

## Estructura

```
src/
  index.js            config → backend → server
  config.js           entorno y .env
  server.js           rutas, auth, error envelope, estáticos, webhook
  mcp.js              MCP Streamable HTTP (JSON-RPC 2.0)
  registry.js         el catálogo de tools y sus tres serializaciones
  validate.js         validador de JSON Schema
  errors.js           el contrato de error
  i18n.js             los cuatro idiomas
  tax.js              IVA por país, neto/bruto, desglose del carrito
  themes.js           las 30 plantillas
  store.js            categorías, imágenes y ajustes en JSON
  stripe.js           Stripe sin SDK
  uploads.js          subida de imágenes
  tools/              un fichero por dominio
  backends/
    mock.js           offline, sembrado
    shopify.js        Admin GraphQL en vivo
public/
  index.html          la tienda
  admin/              el panel del dueño
  tools.html          el catálogo de tools
  assets/             estilos, script, catálogo e i18n
test/                 83 tests
scripts/              export de catálogo, build del sitio, smoke
```

Los dos backends implementan la misma API de dominio, así que una tool nunca
sabe con cuál está hablando y el mock sirve de contrato del live.

---

## Qué se simplificó

Punto de partida: el paquete publicado `shopify-mcp` (v1.0.8), analizado con
REA sobre el artefacto real. Tenía 14 tools, solo stdio, 6 dependencias de
runtime, un cliente mutable a nivel de módulo, paginación por `limit` y ni
inventario ni fulfillment.

| | `shopify-mcp` 1.0.8 | aquí |
| --- | --- | --- |
| Transportes | stdio | MCP HTTP, REST, lote, OpenAI |
| Dependencias de runtime | 6 | 0 |
| Estado | singleton mutable | backend inyectado por petición |
| Errores | excepciones GraphQL crudas | `{ code, message }` uniforme |
| Paginación | `limit` | cursor opaco |
| Inventario | no existía | `update_inventory` |
| Fulfillment | no existía | `fulfill_order` |
| Metafields | dentro de `productUpdate` (Shopify los ignora) | `metafieldsSet` |
| Tiendas de una tienda | no | tiendan con variantes e IVA |
| Idiomas | no | 4 |
| IVA | no | por país, por categoría y por producto |
| Pago | no | Stripe con webhook firmado |
| Panel de administración | no | `/admin` |
| Plantillas | no | 30 por industria |
| Arranque sin tienda | no | sí, con mock |
| Tests | ninguno | 83 |

El backend live está escrito contra los docs actuales de la Admin GraphQL
(`2026-10`, la última estable), con la directiva `@idempotent` y
`changeFromQuantity` de los ajustes de inventario, y con las mutaciones de
opciones correctas (`productOptionUpdate` en singular, `productOptionsDelete`
con `options` y `strategy`). **Sin credenciales no se ha podido ejecutar
contra una tienda real**: el camino verificado de punta a punta es el mock.

---

## License

MIT.
