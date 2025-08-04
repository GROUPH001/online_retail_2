CREATE TABLE online_retail_data (
  invoice_no VARCHAR(20) NOT NULL,
  stock_code VARCHAR(20) NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL,
  invoice_date TIMESTAMP NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  customer_id VARCHAR(20),
  country VARCHAR(50)
);

CREATE INDEX idx_stock_code ON online_retail_data(stock_code);
CREATE INDEX idx_invoice_date ON online_retail_data(invoice_date);
CREATE INDEX idx_customer_id ON online_retail_data(customer_id);
