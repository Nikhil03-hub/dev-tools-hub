export const SAMPLE_JSON = {
  id: "ord_9f2c1a",
  status: "shipped",
  total: 128.5,
  discountCode: null,
  customer: {
    name: "Asha Verma",
    email: "asha@example.com",
    vip: true,
  },
  items: [
    { sku: "TSHIRT-BLK-M", qty: 2, price: 19.99 },
    { sku: "MUG-STEEL", qty: 1, price: 14.5, giftWrap: true },
    { sku: "CAP-NAVY", qty: 1, price: 12.0 },
  ],
  tags: ["priority", "web"],
  history: [
    { at: "2026-09-20T10:12:00Z", event: "placed" },
    { at: "2026-09-21T08:03:00Z", event: "packed" },
    { at: "2026-09-22T14:45:00Z", event: "shipped" },
  ],
};

export const SAMPLE_JSON_MODIFIED = {
  id: "ord_9f2c1a",
  status: "delivered",
  total: 132.5,
  discountCode: "WELCOME10",
  customer: {
    name: "Asha Verma",
    email: "asha@example.com",
    vip: true,
  },
  items: [
    { sku: "TSHIRT-BLK-M", qty: 2, price: 19.99 },
    { sku: "MUG-STEEL", qty: 1, price: 14.5, giftWrap: true },
    { sku: "CAP-NAVY", qty: 2, price: 12.0 },
  ],
  tags: ["priority", "web", "repeat-customer"],
  history: [
    { at: "2026-09-20T10:12:00Z", event: "placed" },
    { at: "2026-09-21T08:03:00Z", event: "packed" },
    { at: "2026-09-22T14:45:00Z", event: "shipped" },
    { at: "2026-09-24T09:30:00Z", event: "delivered" },
  ],
};

export const SAMPLE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["id", "status", "total", "customer", "items"],
  properties: {
    id: { type: "string" },
    status: { type: "string", enum: ["placed", "packed", "shipped", "delivered", "cancelled"] },
    total: { type: "number", minimum: 0 },
    discountCode: { type: ["string", "null"] },
    customer: {
      type: "object",
      required: ["name", "email"],
      properties: {
        name: { type: "string" },
        email: { type: "string", format: "email" },
        vip: { type: "boolean" },
      },
    },
    items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["sku", "qty", "price"],
        properties: {
          sku: { type: "string" },
          qty: { type: "integer", minimum: 1 },
          price: { type: "number", minimum: 0 },
          giftWrap: { type: "boolean" },
        },
      },
    },
    tags: { type: "array", items: { type: "string" } },
  },
};
