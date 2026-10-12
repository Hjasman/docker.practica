const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const mysql = require("mysql2/promise");
const multer = require("multer");

const app = express();
const port = Number(process.env.PORT || 4000);
const uploadDirectory = process.env.UPLOAD_DIRECTORY || path.join(__dirname, "..", "uploads");
const allowedImageTypes = {
  "image/jpeg": { extension: ".jpg", signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  "image/png": { extension: ".png", signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { extension: ".webp", signature: (buffer) => buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" },
};

fs.mkdirSync(uploadDirectory, { recursive: true });
app.use(express.json({ limit: "10kb" }));
app.use("/uploads", express.static(uploadDirectory, { fallthrough: false, immutable: true, maxAge: "1y" }));

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_request, file, callback) => {
      const imageType = allowedImageTypes[file.mimetype];
      callback(null, `${randomUUID()}${imageType.extension}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!allowedImageTypes[file.mimetype]) {
      const formatError = new Error("Formato no válido. Sube una imagen JPEG, PNG o WebP.");
      formatError.status = 400;
      callback(formatError);
      return;
    }
    callback(null, true);
  },
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "cv_db",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: 10,
});

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/cv", async (_request, response, next) => {
  try {
    const [people] = await pool.query(
      "SELECT id, nombre, apellido, ciudad, foto FROM persona ORDER BY id LIMIT 1",
    );

    if (people.length === 0) {
      response.status(404).json({ error: "No hay datos personales cargados." });
      return;
    }

    const persona = people[0];
    const [formacion] = await pool.execute(
      `SELECT id, titulo, institucion, anio
       FROM formacion
       WHERE persona_id = ?
       ORDER BY anio DESC, id`,
      [persona.id],
    );

    response.json({ persona, formacion });
  } catch (error) {
    next(error);
  }
});

app.put("/cv/persona/:id", async (request, response, next) => {
  const id = Number(request.params.id);
  const { nombre, apellido, ciudad, foto } = request.body || {};
  const fields = { nombre, apellido, ciudad, foto };
  const limits = { nombre: 100, apellido: 100, ciudad: 150, foto: 255 };

  if (!Number.isInteger(id) || id < 1) {
    response.status(400).json({ error: "El identificador de la persona no es válido." });
    return;
  }

  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > limits[field]) {
      response.status(400).json({ error: `El campo ${field} es obligatorio y no debe superar ${limits[field]} caracteres.` });
      return;
    }
  }

  try {
    const [result] = await pool.execute(
      "UPDATE persona SET nombre = ?, apellido = ?, ciudad = ?, foto = ? WHERE id = ?",
      [nombre.trim(), apellido.trim(), ciudad.trim(), foto.trim(), id],
    );

    if (result.affectedRows === 0) {
      const [existing] = await pool.execute("SELECT id FROM persona WHERE id = ?", [id]);
      if (existing.length === 0) {
        response.status(404).json({ error: "No se encontró la persona solicitada." });
        return;
      }
    }

    response.json({
      id,
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      ciudad: ciudad.trim(),
      foto: foto.trim(),
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/cv/persona/:id/foto",
  (request, response, next) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id < 1) {
      response.status(400).json({ error: "El identificador de la persona no es válido." });
      return;
    }
    next();
  },
  upload.single("foto"),
  async (request, response, next) => {
    if (!request.file) {
      response.status(400).json({ error: "Selecciona una fotografía para subir." });
      return;
    }

    const imageType = allowedImageTypes[request.file.mimetype];
    try {
      const file = await fs.promises.open(request.file.path, "r");
      const signature = Buffer.alloc(12);
      const { bytesRead } = await file.read(signature, 0, signature.length, 0);
      await file.close();

      if (!imageType.signature(signature.subarray(0, bytesRead))) {
        const imageError = new Error("El contenido del archivo no coincide con su formato de imagen.");
        imageError.status = 400;
        throw imageError;
      }

      const [people] = await pool.execute("SELECT foto FROM persona WHERE id = ?", [request.params.id]);
      if (people.length === 0) {
        const notFoundError = new Error("No se encontró la persona solicitada.");
        notFoundError.status = 404;
        throw notFoundError;
      }

      const foto = `/uploads/${request.file.filename}`;
      await pool.execute("UPDATE persona SET foto = ? WHERE id = ?", [foto, request.params.id]);
      response.json({ foto });

      const previousFoto = people[0].foto;
      if (previousFoto.startsWith("/uploads/") && path.basename(previousFoto) === previousFoto.slice("/uploads/".length)) {
        fs.promises.unlink(path.join(uploadDirectory, path.basename(previousFoto))).catch((error) => {
          if (error.code !== "ENOENT") {
            console.error("No se pudo eliminar la fotografía anterior:", error);
          }
        });
      }
    } catch (error) {
      await fs.promises.unlink(request.file.path).catch((cleanupError) => {
        if (cleanupError.code !== "ENOENT") {
          console.error("No se pudo limpiar la fotografía rechazada:", cleanupError);
        }
      });
      next(error);
    }
  },
);

app.post("/cv/persona/:id/formacion", async (request, response, next) => {
  const personaId = Number(request.params.id);
  const { titulo, institucion, anio } = request.body || {};
  const fields = { titulo, institucion, anio };
  const limits = { titulo: 200, institucion: 200, anio: 20 };

  if (!Number.isInteger(personaId) || personaId < 1) {
    response.status(400).json({ error: "El identificador de la persona no es válido." });
    return;
  }

  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > limits[field]) {
      response.status(400).json({ error: `El campo ${field} es obligatorio y no debe superar ${limits[field]} caracteres.` });
      return;
    }
  }

  try {
    const [people] = await pool.execute("SELECT id FROM persona WHERE id = ?", [personaId]);
    if (people.length === 0) {
      response.status(404).json({ error: "No se encontró la persona solicitada." });
      return;
    }

    const [result] = await pool.execute(
      "INSERT INTO formacion (titulo, institucion, anio, persona_id) VALUES (?, ?, ?, ?)",
      [titulo.trim(), institucion.trim(), anio.trim(), personaId],
    );

    response.status(201).json({
      id: result.insertId,
      titulo: titulo.trim(),
      institucion: institucion.trim(),
      anio: anio.trim(),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/cv/formacion/:id", async (request, response, next) => {
  const id = Number(request.params.id);
  const { titulo, institucion, anio } = request.body || {};
  const fields = { titulo, institucion, anio };
  const limits = { titulo: 200, institucion: 200, anio: 20 };

  if (!Number.isInteger(id) || id < 1) {
    response.status(400).json({ error: "El identificador de la formación no es válido." });
    return;
  }

  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > limits[field]) {
      response.status(400).json({ error: `El campo ${field} es obligatorio y no debe superar ${limits[field]} caracteres.` });
      return;
    }
  }

  try {
    const [result] = await pool.execute(
      "UPDATE formacion SET titulo = ?, institucion = ?, anio = ? WHERE id = ?",
      [titulo.trim(), institucion.trim(), anio.trim(), id],
    );

    if (result.affectedRows === 0) {
      const [existing] = await pool.execute("SELECT id FROM formacion WHERE id = ?", [id]);
      if (existing.length === 0) {
        response.status(404).json({ error: "No se encontró la formación solicitada." });
        return;
      }
    }

    response.json({ id, titulo: titulo.trim(), institucion: institucion.trim(), anio: anio.trim() });
  } catch (error) {
    next(error);
  }
});

app.delete("/cv/formacion/:id", async (request, response, next) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id < 1) {
    response.status(400).json({ error: "El identificador de la formación no es válido." });
    return;
  }

  try {
    const [result] = await pool.execute("DELETE FROM formacion WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      response.status(404).json({ error: "No se encontró la formación solicitada." });
      return;
    }

    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error("Error al consultar el CV:", error);
  const status = error.status || (error instanceof multer.MulterError
    ? error.code === "LIMIT_FILE_SIZE" ? 413 : 400
    : 500);
  response.status(status).json({
    error: status === 500 ? "No se pudo procesar la solicitud." : error.message,
  });
});

const server = app.listen(port, () => {
  console.log(`API escuchando en el puerto ${port}`);
});

async function shutdown() {
  server.close(async (error) => {
    if (error) {
      console.error("Error al detener el servidor:", error);
      process.exitCode = 1;
    }

    try {
      await pool.end();
    } catch (poolError) {
      console.error("Error al cerrar el pool de MySQL:", poolError);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
