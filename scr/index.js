/**
 * Online Retail API
 * -----------------
 * BCS 4103 Advanced Database Systems
 * Task 2 & 3: CRUD API with PostgreSQL + Swagger Documentation
 */

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();

app.use(cors()); // ✅ Allow all origi
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// PostgreSQL Connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'online_retail_db',
  password: process.env.DB_PASSWORD || 'password_here',
  port: process.env.DB_PORT || 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Validation middleware
const validateProduct = (req, res, next) => {
  const { stock_code, description, unit_price } = req.body;

  if (!stock_code || !description) {
    return res.status(400).json({ error: 'Missing required fields: stock_code and description' });
  }

  if (unit_price !== undefined && (isNaN(unit_price) || unit_price <= 0)) {
    return res.status(400).json({ error: 'unit_price must be a positive number' });
  }

  next();
};

// Centralized DB error handler
const handleDatabaseError = (error, res) => {
  console.error('Database error:', error);
  switch (error.code) {
    case '23505': return res.status(409).json({ error: 'Duplicate entry detected' });
    case '23503': return res.status(400).json({ error: 'Invalid foreign key reference' });
    case '23514': return res.status(400).json({ error: 'Check constraint violation' });
    default: return res.status(500).json({ error: 'Internal server error' });
  }
};


app.use(cors({ origin: '*' })); // Allow all origins for testing

// 🔹 CRUD API Endpoints

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     description: Returns all products with pagination, search, and sorting.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: sort_by
 *         schema: { type: string, default: stock_code }
 *       - in: query
 *         name: sort_order
 *         schema: { type: string, default: ASC }
 *     responses:
 *       200:
 *         description: List of products
 */
app.get('/api/products', async (req, res) => {
  const client = await pool.connect();
  try {
    const { page = 1, limit = 10, search = '', sort_by = 'stock_code', sort_order = 'ASC' } = req.query;
    const offset = (page - 1) * limit;

    const validSort = ['product_id', 'stock_code', 'description', 'unit_price'];
    const sortColumn = validSort.includes(sort_by) ? sort_by : 'stock_code';
    const order = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let whereClause = '';
    let params = [];
    if (search) {
      whereClause = 'WHERE stock_code ILIKE $1 OR description ILIKE $1';
      params.push(`%${search}%`);
    }

    const query = `
      SELECT * FROM products
      ${whereClause}
      ORDER BY ${sortColumn} ${order}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    const result = await client.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    handleDatabaseError(error, res);
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get a product by ID or stock_code
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200: { description: Product found }
 *       404: { description: Product not found }
 */
app.get('/api/products/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const isNumeric = !isNaN(id);
    const searchField = isNumeric ? 'product_id' : 'stock_code';

    const result = await client.query(
      `SELECT * FROM products WHERE ${searchField} = $1`,
      [isNumeric ? parseInt(id) : id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleDatabaseError(error, res);
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Add a new product
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stock_code, description, unit_price]
 *             properties:
 *               stock_code: { type: string }
 *               description: { type: string }
 *               unit_price: { type: number }
 *     responses:
 *       201: { description: Product created }
 */
app.post('/api/products', validateProduct, async (req, res) => {
  const client = await pool.connect();
  try {
    const { stock_code, description, unit_price } = req.body;
    const result = await client.query(
      `INSERT INTO products (stock_code, description, unit_price) VALUES ($1, $2, $3) RETURNING *`,
      [stock_code, description, unit_price]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleDatabaseError(error, res);
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Update an existing product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema: { type: string }
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stock_code: { type: string }
 *               description: { type: string }
 *               unit_price: { type: number }
 *     responses:
 *       200: { description: Product updated }
 *       404: { description: Product not found }
 */
app.put('/api/products/:id', validateProduct, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { stock_code, description, unit_price } = req.body;

    const result = await client.query(
      `UPDATE products 
       SET stock_code=$1, description=$2, unit_price=$3, updated_at=CURRENT_TIMESTAMP 
       WHERE product_id=$4 RETURNING *`,
      [stock_code, description, unit_price, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleDatabaseError(error, res);
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Delete a product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200: { description: Product deleted }
 *       404: { description: Product not found }
 */
app.delete('/api/products/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const result = await client.query('DELETE FROM products WHERE product_id=$1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, message: 'Product deleted', data: result.rows[0] });
  } catch (error) {
    handleDatabaseError(error, res);
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/products/analytics/summary:
 *   get:
 *     summary: Get summary analytics of products
 *     tags: [Products]
 *     responses:
 *       200: { description: Analytics summary }
 */
app.get('/api/products/analytics/summary', async (req, res) => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_products,
        AVG(unit_price) as avg_price,
        SUM(stock_quantity) as total_stock
      FROM products
    `;
    const result = await client.query(query);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleDatabaseError(error, res);
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/products/low-stock:
 *   get:
 *     summary: Get products with low stock levels
 *     tags: [Products]
 *     responses:
 *       200: { description: List of low stock products }
 */
app.get('/api/products/low-stock', async (req, res) => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT product_id, stock_code, description, stock_quantity, reorder_level
      FROM products
      WHERE stock_quantity <= reorder_level
      ORDER BY stock_quantity ASC
    `;
    const result = await client.query(query);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    handleDatabaseError(error, res);
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Products]
 *     responses:
 *       200: { description: API and DB are healthy }
 */
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');
    res.json({ success: true, status: 'healthy', timestamp: result.rows[0].current_time });
  } catch (error) {
    res.status(500).json({ success: false, status: 'unhealthy', error: error.message });
  }
});

// Swagger setup
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Online Retail API',
      version: '1.0.0',
      description: 'API for managing products in Online Retail Database'
    },
    servers: [
      {
        url: 'http://localhost:3000',  // ✅ Make sure this matches your running server
        description: 'Local Server'
      }
    ]
  },
  apis: ['./index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📖 Swagger docs: http://localhost:${PORT}/api-docs`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
