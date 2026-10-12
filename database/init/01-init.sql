USE cv_db;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS persona (
    id INT NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    ciudad VARCHAR(150) NOT NULL,
    foto VARCHAR(255) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS formacion (
    id INT NOT NULL AUTO_INCREMENT,
    titulo VARCHAR(200) NOT NULL,
    institucion VARCHAR(200) NOT NULL,
    anio VARCHAR(20) NOT NULL,
    persona_id INT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_formacion_persona
        FOREIGN KEY (persona_id) REFERENCES persona (id)
        ON DELETE CASCADE
);

INSERT INTO persona (id, nombre, apellido, ciudad, foto)
VALUES (1, 'Rodrigo Hjasman', 'Salinas Ardaya', 'La Paz', '/foto2.jpg')
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    apellido = VALUES(apellido),
    ciudad = VALUES(ciudad),
    foto = VALUES(foto);

INSERT INTO formacion (id, titulo, institucion, anio, persona_id)
VALUES
    (1, 'Licenciado en Ingeniería de Sistemas', 'Universidad Salesiana de Bolivia ', '2025', 1),
    (2, 'Tecnico Superior Analista de sistemas Informáticos', 'Tecnologico "Puerto de Mejillones"', '2004', 1)
ON DUPLICATE KEY UPDATE
    titulo = VALUES(titulo),
    institucion = VALUES(institucion),
    anio = VALUES(anio),
    persona_id = VALUES(persona_id);
