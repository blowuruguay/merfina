-- ============================================================
-- MERFINA — esquema Postgres para Railway
-- ============================================================
-- Cómo correrlo:
--   Lo corre services/arranque.js automáticamente al levantar el
--   servidor, si las tablas no existen. Es idempotente.
--
-- Sin RLS ni auth externo: el control de acceso lo hace Express
-- con JWT.
-- ============================================================

-- ---------- CATEGORÍAS ----------
create table categorias (
  id          text primary key,              -- 'cubre-botones'
  nombre      text not null,
  descripcion text,
  imagen      text,                          -- URL (R2 o /img/)
  orden       int  not null default 0,
  activa      bool not null default true,
  creado_en   timestamptz not null default now()
);

-- ---------- PRODUCTOS ----------
-- Cada joya suele ser única o venir en pocas unidades. No hay
-- variantes complejas al inicio: lo necesario es nombre, precio,
-- stock, descripción y hasta 4 imágenes.
create table productos (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,        -- 'camelias-azules'
  nombre         text not null,
  categoria_id   text references categorias(id) on delete set null,
  precio         int  not null,               -- pesos enteros
  precio_antes   int,                          -- tachado en ofertas
  descripcion    text,
  materiales     text,                        -- "latón bañado en oro, esmalte"
  medidas        text,                        -- "2.5 cm diámetro"
  stock          int  not null default 0,
  destacado      bool not null default false,
  activo         bool not null default true,
  meta_titulo    text,
  meta_desc      text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index idx_productos_cat on productos (categoria_id);
create index idx_productos_vitrina on productos (activo, destacado);
create extension if not exists unaccent;
create index idx_productos_busqueda on productos
  using gin (to_tsvector('spanish', nombre || ' ' || coalesce(descripcion,'')));

-- ---------- IMÁGENES ----------
create table producto_imagenes (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references productos(id) on delete cascade,
  url          text not null,
  alt          text,
  orden        int  not null default 0
);
create index idx_imagenes_prod on producto_imagenes (producto_id, orden);

-- ---------- AJUSTES ----------
create table ajustes (
  clave text primary key,
  valor jsonb not null
);

-- ---------- PEDIDOS ----------
-- Al inicio la compra se cierra por WhatsApp. Igual guardamos los
-- pedidos para llevar historial y poder migrar a MercadoPago después
-- sin cambiar el modelo.
create type estado_pedido as enum
  ('consulta','confirmado','pagado','enviado','entregado','cancelado');

create table pedidos (
  id             uuid primary key default gen_random_uuid(),
  numero         serial unique,
  estado         estado_pedido not null default 'consulta',

  nombre         text not null,
  apellido       text,
  email          text,
  telefono       text not null,
  documento      text,

  envio_tipo     text,                        -- 'retiro' | 'montevideo' | 'interior'
  direccion      jsonb,                       -- {calle, apto, barrio, cp, agencia}
  nota           text,

  subtotal       int not null default 0,
  envio_costo    int not null default 0,
  total          int not null default 0,

  canal          text not null default 'web', -- web | whatsapp | instagram | presencial
  notas_internas text,

  creado_en      timestamptz not null default now(),
  confirmado_en  timestamptz,
  pagado_en      timestamptz,
  enviado_en     timestamptz
);
create index idx_pedidos_panel on pedidos (estado, creado_en desc);
create index idx_pedidos_mail on pedidos (email);

-- Se guardan nombre y precio como texto/int, NO por referencia:
-- si mañana borrás o encarecés un producto, el pedido viejo no se
-- altera.
create table pedido_items (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references pedidos(id) on delete cascade,
  producto_id  uuid references productos(id) on delete set null,
  nombre       text not null,
  precio_unit  int  not null,
  cantidad     int  not null,
  imagen       text
);
create index idx_items_pedido on pedido_items (pedido_id);

-- ---------- CONTACTOS ----------
-- Los mensajes del formulario de contacto.
create table contactos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  email      text not null,
  telefono   text,
  asunto     text,
  mensaje    text not null,
  leido      bool not null default false,
  creado_en  timestamptz not null default now()
);
create index idx_contactos_panel on contactos (leido, creado_en desc);

-- ---------- NEWSLETTER ----------
create table newsletter (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,
  activo       bool not null default true,
  origen       text,                          -- 'home' | 'checkout' | 'manual'
  creado_en    timestamptz not null default now(),
  baja_en      timestamptz
);

-- ---------- USUARIOS DEL ADMIN ----------
create table usuarios (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  password    text not null,                  -- hash bcrypt
  nombre      text,
  rol         text not null default 'operador', -- dueño | operador
  activo      bool not null default true,
  ultimo_ingreso timestamptz,
  creado_en   timestamptz not null default now()
);

-- ---------- ACTUALIZADO_EN AUTOMÁTICO ----------
create or replace function tocar_actualizado() returns trigger as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$ language plpgsql;

create trigger t_productos_upd before update on productos
  for each row execute function tocar_actualizado();

-- ============================================================
-- DATOS INICIALES
-- ============================================================
insert into categorias (id, nombre, descripcion, orden) values
  ('cubre-botones','Cubre botones','Piezas que transforman cualquier camisa o blusa.',1),
  ('corbatas','Corbatas joya','Alternativa elegante a la corbata tradicional.',2),
  ('otros','Otras piezas','Broches, prendedores y ediciones especiales.',3);

insert into ajustes (clave, valor) values
  ('whatsapp','"https://wa.me/59899000000"'),
  ('telefono','"099 000 000"'),
  ('email','"hola@merfina.uy"'),
  ('instagram','"https://instagram.com/merfinajoyas"'),
  ('envio_montevideo','190'),
  ('envio_interior','290'),
  ('envio_gratis_desde','4500');
