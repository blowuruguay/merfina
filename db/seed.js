require('dotenv').config();
const pool = require('./pool');

async function seed() {
  try {
    // Categorías
    await pool.query(`
      INSERT INTO categories (slug, name, description, sort_order) VALUES
      ('cubre-botones', 'Cubre botones', 'Piezas para transformar los botones de tu camisa', 1),
      ('corbatas', 'Corbatas', 'Corbatas pensadas para quienes entienden el detalle', 2)
      ON CONFLICT (slug) DO NOTHING
    `);

    const { rows: cats } = await pool.query('SELECT id, slug FROM categories');
    const catId = (slug) => cats.find(c => c.slug === slug)?.id;

    // Productos de ejemplo
    const productos = [
      {
        slug: 'flor-azul-oro',
        category: 'cubre-botones',
        name: 'Flor Azul Oro',
        short: 'Cubre botón flor en tonos azules con detalle dorado.',
        description: 'Pieza artesanal con forma de flor, en esmalte azul profundo y bordes dorados. Se coloca sobre el botón y transforma la camisa al instante. Diámetro aproximado 2.5 cm.',
        price_cents: 89000,
        stock: 12,
        featured: true,
      },
      {
        slug: 'corazon-perla',
        category: 'cubre-botones',
        name: 'Corazón Perla',
        short: 'Cubre botón con forma de corazón y centro de perla.',
        description: 'Diseño romántico con base dorada y perla natural en el centro. Ideal para camisas blancas y looks clásicos.',
        price_cents: 79000,
        stock: 8,
        featured: true,
      },
      {
        slug: 'margarita-dorada',
        category: 'cubre-botones',
        name: 'Margarita Dorada',
        short: 'Margarita en esmalte blanco con centro dorado.',
        description: 'Flor pequeña, delicada, pensada para los puños y el cuello. Se vende en par.',
        price_cents: 69000,
        stock: 20,
        featured: false,
      },
      {
        slug: 'corbata-rosa-flor',
        category: 'corbatas',
        name: 'Corbata Rosa con Flor',
        short: 'Corbata rosada con joya floral en rosa y dorado.',
        description: 'Corbata en tela de calidad con pieza floral desmontable. Para los looks que buscan sofisticación con un giro.',
        price_cents: 185000,
        stock: 5,
        featured: true,
      },
      {
        slug: 'corbata-rayas-beige',
        category: 'corbatas',
        name: 'Corbata Rayas Beige',
        short: 'Corbata con rayas diagonales, joya floral incluida.',
        description: 'Clásica con un giro. Corbata en beige y crema con pieza floral de esmalte rosa y oro.',
        price_cents: 185000,
        stock: 4,
        featured: false,
      },
    ];

    for (const p of productos) {
      await pool.query(`
        INSERT INTO products (slug, category_id, name, short_description, description, price_cents, stock, images, active, featured)
        VALUES ($1, $2, $3, $4, $5, $6, $7, '[]'::jsonb, TRUE, $8)
        ON CONFLICT (slug) DO NOTHING
      `, [p.slug, catId(p.category), p.name, p.short, p.description, p.price_cents, p.stock, p.featured]);
    }

    console.log('✅ Seed completo');
  } catch (err) {
    console.error('❌ Error en seed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
