# Merfina — Pendientes

## Sistema de correos transaccionales
Pendiente de implementar. Los correos que hay que mandar:

1. **Pedido confirmado** (al crear pedido):
   - MercadoPago: cuando el webhook devuelve `approved`
   - Transferencia: cuando el admin pasa el pedido a estado `pagado`
   - Contenido: # de pedido, items, total, datos de envío, estimación

2. **Pedido en preparación** (al pasar a estado `preparando` desde el admin)

3. **Pedido enviado / en camino** (al pasar a estado `enviado`):
   - Incluir número de seguimiento (DAC) o detalles del delivery
   - Fecha estimada de entrega
   - CTA a WhatsApp para consultas

4. **Pedido entregado** (al pasar a estado `entregado`):
   - Agradecimiento, pedir que suba foto a Instagram etiquetando @merfinajoyas
   - Link a reseña / testimonio

5. **Mail interno** (al crear pedido):
   - Avisar a MAIL_INTERNO con resumen del pedido para que el admin lo
     empiece a preparar sin tener que entrar al panel.

## Mecánica
- Agregar columna `tracking` (ya existe en el schema) y poder editarla
  desde el panel.
- Cada cambio de estado en /api/admin/pedidos/:id dispara el mail
  correspondiente, usando services/mail.js (que ya soporta Resend).
- Las plantillas HTML con la estética Merfina: cream + gold + Cormorant.
- Variables de entorno necesarias: RESEND_API_KEY, MAIL_DESDE, MAIL_INTERNO.
