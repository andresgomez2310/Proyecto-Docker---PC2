// Credenciales admin ya vienen de variables de entorno.
// Helper: crear colección con validación (idempotente)
function ensureCollection(db, name, validator = {}, indexes = []) {
  const names = db.getCollectionNames();
  if (!names.includes(name)) {
    db.createCollection(name, Object.keys(validator).length ? { validator: { $jsonSchema: validator } } : {});
  }
  const coll = db.getCollection(name);
  indexes.forEach(ix => coll.createIndex(ix.keys, ix.options || {}));
  return coll;
}

// ============================
// library_catalog (catálogo)
// ============================
let dbCat = db.getSiblingDB("library_catalog");

// autores
ensureCollection(dbCat, "authors", {
  bsonType: "object",
  required: ["name"],
  properties: {
    _id: { bsonType: "objectId" },
    name: { bsonType: "string" },
    country: { bsonType: ["string", "null"] },
    birthYear: { bsonType: ["int", "null"] }
  }
}, [
  { keys: { name: 1 }, options: { unique: false } }
]);

// editoriales
ensureCollection(dbCat, "publishers", {
  bsonType: "object",
  required: ["name"],
  properties: {
    _id: { bsonType: "objectId" },
    name: { bsonType: "string" }
  }
}, [{ keys: { name: 1 }, options: { unique: true } }]);

// libros
ensureCollection(dbCat, "books", {
  bsonType: "object",
  required: ["title", "isbn", "authors", "categories"],
  properties: {
    _id: { bsonType: "objectId" },
    title: { bsonType: "string" },
    subtitle: { bsonType: ["string", "null"] },
    isbn: { bsonType: "string" },
    authors: { bsonType: "array", items: { bsonType: "objectId" } }, // refs a authors
    publisherId: { bsonType: ["objectId", "null"] },
    year: { bsonType: ["int", "null"] },
    language: { bsonType: ["string", "null"] },
    categories: { bsonType: "array", items: { bsonType: "string" } },
    // metadatos libres
    tags: { bsonType: "array", items: { bsonType: "string" } }
  }
}, [
  { keys: { isbn: 1 }, options: { unique: true } },
  { keys: { title: "text", tags: "text" } },
  { keys: { "categories": 1 } },
  { keys: { "authors": 1 } }
]);

// copias (inventario por sede)
ensureCollection(dbCat, "copies", {
  bsonType: "object",
  required: ["bookId", "location", "status"],
  properties: {
    _id: { bsonType: "objectId" },
    bookId: { bsonType: "objectId" }, // ref a books
    location: { bsonType: "string" }, // e.g. "Sede Norte - Estante B3"
    status: { enum: ["available", "loaned", "reserved", "maintenance"] },
    barcode: { bsonType: ["string", "null"] } // opcional
  }
}, [
  { keys: { bookId: 1 } },
  { keys: { status: 1 } },
  { keys: { barcode: 1 }, options: { unique: true, sparse: true } }
]);

// Datos de ejemplo mínimos
if (dbCat.authors.countDocuments() === 0) {
  const gabriel = dbCat.authors.insertOne({ name: "Gabriel García Márquez", country: "Colombia", birthYear: 1927 }).insertedId;
  const sudamericana = dbCat.publishers.insertOne({ name: "Sudamericana" }).insertedId;
  const bookId = dbCat.books.insertOne({
    title: "Cien años de soledad",
    isbn: "978-3-16-148410-0",
    authors: [gabriel],
    publisherId: sudamericana,
    year: 1967,
    language: "es",
    categories: ["Realismo mágico", "Novela"],
    tags: ["clásico", "latinoamericano"]
  }).insertedId;
  dbCat.copies.insertMany([
    { bookId, location: "Biblioteca Central - A1", status: "available", barcode: "BC0001" },
    { bookId, location: "Sede Norte - B3", status: "available", barcode: "BC0002" }
  ]);
}

// ============================
// library_loans (préstamos)
// ============================
let dbLoans = db.getSiblingDB("library_loans");

ensureCollection(dbLoans, "loans", {
  bsonType: "object",
  required: ["copyId", "robleUserId", "loanDate", "dueDate", "status"],
  properties: {
    _id: { bsonType: "objectId" },
    copyId: { bsonType: "objectId" }, // ref a catalog.copies
    robleUserId: { bsonType: "string" }, // viene de Roble SSO
    loanDate: { bsonType: "date" },
    dueDate: { bsonType: "date" },
    returnDate: { bsonType: ["date", "null"] },
    status: { enum: ["active", "returned", "late"] },
    fines: { bsonType: ["double", "int", "null"] }
  }
}, [
  { keys: { robleUserId: 1, status: 1 } },
  { keys: { copyId: 1, status: 1 }, options: { unique: false } },
  { keys: { dueDate: 1 } }
]);

// ============================
// library_reservations (reservas)
// ============================
let dbRes = db.getSiblingDB("library_reservations");

ensureCollection(dbRes, "reservations", {
  bsonType: "object",
  required: ["bookId", "robleUserId", "status", "createdAt"],
  properties: {
    _id: { bsonType: "objectId" },
    bookId: { bsonType: "objectId" }, // reservar por título/libro
    robleUserId: { bsonType: "string" },
    status: { enum: ["queued", "notified", "fulfilled", "cancelled", "expired"] },
    createdAt: { bsonType: "date" },
    notifiedAt: { bsonType: ["date", "null"] },
    expiresAt: { bsonType: ["date", "null"] }
  }
}, [
  { keys: { bookId: 1, status: 1 } },
  { keys: { robleUserId: 1, status: 1 } },
  { keys: { createdAt: 1 } }
]);

// ============================
// library_reco (recomendaciones)
// ============================
let dbReco = db.getSiblingDB("library_reco");

// eventos para análisis (simple, flexible)
ensureCollection(dbReco, "events", {
  bsonType: "object",
  required: ["type", "robleUserId", "bookId", "createdAt"],
  properties: {
    _id: { bsonType: "objectId" },
    type: { enum: ["view", "loan", "return", "reserve"] },
    robleUserId: { bsonType: "string" },
    bookId: { bsonType: "objectId" },
    createdAt: { bsonType: "date" }
  }
}, [
  { keys: { robleUserId: 1, createdAt: -1 } },
  { keys: { bookId: 1 } },
  { keys: { type: 1, createdAt: -1 } }
]);

// materialización de recomendaciones (opcional)
ensureCollection(dbReco, "recommendations", {
  bsonType: "object",
  required: ["robleUserId", "items", "updatedAt"],
  properties: {
    _id: { bsonType: "objectId" },
    robleUserId: { bsonType: "string" },
    items: {
      bsonType: "array",
      items: {
        bsonType: "object",
        required: ["bookId", "score"],
        properties: {
          bookId: { bsonType: "objectId" },
          score: { bsonType: ["double", "int"] }
        }
      }
    },
    updatedAt: { bsonType: "date" }
  }
}, [
  { keys: { robleUserId: 1 }, options: { unique: true } }
]);

// ============================
// library_admin (dashboard/config)
// ============================
let dbAdm = db.getSiblingDB("library_admin");

ensureCollection(dbAdm, "categories", {
  bsonType: "object",
  required: ["name", "slug"],
  properties: {
    _id: { bsonType: "objectId" },
    name: { bsonType: "string" },
    slug: { bsonType: "string" }
  }
}, [{ keys: { slug: 1 }, options: { unique: true } }]);

ensureCollection(dbAdm, "feature_toggles", {
  bsonType: "object",
  required: ["key", "enabled"],
  properties: {
    _id: { bsonType: "objectId" },
    key: { bsonType: "string" },
    enabled: { bsonType: "bool" },
    updatedAt: { bsonType: "date" }
  }
}, [{ keys: { key: 1 }, options: { unique: true } }]);

// Seed mínimo
if (dbAdm.feature_toggles.countDocuments() === 0) {
  dbAdm.feature_toggles.insertMany([
    { key: "reservations", enabled: true, updatedAt: new Date() },
    { key: "recommendations", enabled: true, updatedAt: new Date() }
  ]);
}
