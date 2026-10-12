# CV personal con React, Node.js, MySQL y Docker Compose

Aplicación web de currículum personal. React presenta los datos consultados por una API Node.js; la API obtiene y guarda la información en MySQL. Nginx sirve la aplicación y envía las solicitudes `/api` y las fotografías a los contenedores correspondientes.

## Funciones

- Mostrar nombre, apellido, ciudad, fotografía y formación académica almacenados en MySQL.
- Editar y guardar los datos personales.
- Subir fotografías JPEG, PNG o WebP de hasta 5 MB desde **Editar datos**.
- Agregar, editar y eliminar registros de formación académica.
- Mantener los registros de MySQL y las fotografías subidas en volúmenes Docker persistentes.
- Crear automáticamente las tablas y los registros iniciales al inicializar MySQL por primera vez.

## Arquitectura

| Servicio | Tecnología / imagen base | Puerto del host | Responsabilidad |
| --- | --- | --- | --- |
| `frontend` | React + `nginx:1.27-alpine` | 3000 | Interfaz web; proxy de `/api` y `/uploads` |
| `backend` | Node.js + `node:20-alpine` | 4000 | API REST, acceso a MySQL y almacenamiento de fotografías |
| `database` | `mysql:8.0` | 3306 | Datos personales y formación académica |

Todos los servicios se conectan mediante la red Docker `cv_network`.

Los nombres asignados a los contenedores son `Salinas-frontend` y `Salinas-backend`. El sufijo `:v1` corresponde al tag de imagen, no al nombre de un contenedor; las imágenes son `hjasman/salinas-frontend:v1` y `hjasman/salinas-backend:v1`.

## Requisitos

- Docker Desktop o Docker Engine en ejecución.
- Docker Compose v2 (`docker compose`).
- Cuenta de Docker Hub para publicar las imágenes.

## Configuración inicial

En PowerShell, desde la carpeta del proyecto, crea el archivo local de variables a partir de la plantilla:

```powershell
Copy-Item .env.example .env
```

Edita `.env` y establece:

```dotenv
DOCKERHUB_USER=tu_usuario_de_dockerhub
APELLIDO=tu_apellido
MYSQL_ROOT_PASSWORD=una_contrasena_propia
```

El apellido se utiliza en los nombres de las imágenes. Docker exige que los nombres de los repositorios estén en minúsculas, por lo que con la configuración actual las referencias son `hjasman/salinas-frontend:v1` y `hjasman/salinas-backend:v1`. No publiques ni compartas el archivo `.env`.

### Personalizar los datos iniciales

El archivo `database/init/01-init.sql` contiene los registros utilizados únicamente durante la primera inicialización de un volumen MySQL vacío. Personaliza allí los datos de inicio si todavía no existen. También puedes modificarlos desde la página web, una vez iniciada la aplicación.

Para subir la fotografía desde la página no hace falta modificar el SQL: abre **Editar datos**, selecciona el archivo y espera la confirmación de carga. Las fotografías admitidas son JPEG, PNG y WebP, con un tamaño máximo de 5 MB.

> **Persistencia:** cambiar el SQL no actualiza una base ya inicializada. El volumen `mysql_data` conserva los datos existentes. `docker compose down -v` borra permanentemente la base y las fotografías guardadas; úsalo solo si realmente quieres reiniciar ambos volúmenes.

## Iniciar la aplicación

Ejecuta desde la raíz del proyecto:

```powershell
docker compose up -d --build
```

Este comando construye las imágenes desde los Dockerfiles, inicia MySQL, espera a que la base esté saludable y levanta el backend y el frontend. Para iniciar posteriormente sin reconstruir:

```powershell
docker compose up -d
```

Abre la aplicación en [http://localhost:3000](http://localhost:3000).

### Revisar el estado

```powershell
docker compose ps
docker compose logs -f database backend frontend
```

El servicio `database` debe aparecer como `healthy`. La API permite comprobar la información en [http://localhost:4000/cv](http://localhost:4000/cv) y su disponibilidad en [http://localhost:4000/health](http://localhost:4000/health).

Para inspeccionar tablas y registros en MySQL:

```powershell
docker compose exec database mysql -uroot -p cv_db
```

Ingresa la contraseña definida en `.env`. En la consola de MySQL ejecuta:

```sql
SHOW TABLES;
SELECT * FROM persona;
SELECT * FROM formacion;
```

## Fotografías: archivo, URL y persistencia

La API guarda las fotografías subidas en `/app/uploads`, dentro del contenedor backend. Esa carpeta está conectada al volumen Docker `uploaded_photos`, por lo que los archivos persisten al recrear los contenedores. No se guardan dentro de la imagen ni se pierden al ejecutar `docker compose down` sin `-v`.

En MySQL, `persona.foto` contiene la ruta pública del archivo, por ejemplo:

```text
/uploads/550e8400-e29b-41d4-a716-446655440000.jpg
```

Nginx envía las solicitudes a `/uploads/` al backend, que sirve el archivo almacenado en el volumen.

## API

Las solicitudes siguientes están disponibles en el backend por el puerto `4000`. Desde el navegador, el frontend usa la ruta equivalente con el prefijo `/api`.

| Método | Ruta | Acción |
| --- | --- | --- |
| `GET` | `/health` | Estado de la API |
| `GET` | `/cv` | Devuelve `{ persona, formacion }` |
| `PUT` | `/cv/persona/:id` | Actualiza nombre, apellido, ciudad y ruta de foto |
| `POST` | `/cv/persona/:id/foto` | Recibe la fotografía como multipart en el campo `foto` |
| `POST` | `/cv/persona/:id/formacion` | Agrega una formación vinculada a la persona |
| `PUT` | `/cv/formacion/:id` | Actualiza título, institución y año |
| `DELETE` | `/cv/formacion/:id` | Elimina una formación |

La carga de fotos acepta solo JPEG, PNG y WebP, y limita cada archivo a 5 MB. Las rutas de escritura validan los campos obligatorios antes de guardar.

## Imágenes Docker Hub

Las imágenes se construyen desde `frontend/Dockerfile` y `backend/Dockerfile`. Después de configurar `DOCKERHUB_USER` y `APELLIDO` en `.env`, publica los tags requeridos:

```powershell
docker login
docker compose build
docker compose push
```

Los nombres resultantes tienen este formato:

```text
DOCKERHUB_USER/APELLIDO-frontend:v1
DOCKERHUB_USER/APELLIDO-backend:v1
```

Las imágenes configuradas en este proyecto son `hjasman/salinas-frontend:v1` y `hjasman/salinas-backend:v1`. Si cambias el usuario o apellido en `.env`, Compose genera las referencias con ese usuario y el nombre del repositorio en minúsculas.

En otra máquina que tenga `.env` configurado con las mismas referencias de imágenes, se pueden descargar y ejecutar así:

```powershell
docker compose pull
docker compose up -d --no-build
```

## Dockerfiles y volúmenes

- `frontend/Dockerfile`: compila React y sirve el resultado con Nginx 1.27 Alpine.
- `backend/Dockerfile`: instala las dependencias bloqueadas y ejecuta la API en Node.js 20 Alpine.
- `database/init/01-init.sql`: crea `persona` y `formacion` e inserta datos iniciales.
- `mysql_data`: conserva la base MySQL.
- `uploaded_photos`: conserva los archivos de fotografías.

## Solución de problemas

- **Un puerto ya está ocupado:** cierra el otro servicio que lo utiliza y vuelve a ejecutar `docker compose up -d`.
- **No aparecen cambios hechos al SQL:** el script de inicio se ejecuta solo con un volumen de base vacío. Modifica los datos desde la aplicación o, si deseas borrar toda la información, confirma primero que quieres perder los datos y ejecuta `docker compose down -v`.
- **MySQL no está saludable:** consulta `docker compose logs database` y verifica `MYSQL_ROOT_PASSWORD` en `.env`.
- **La aplicación no carga datos:** consulta `docker compose logs backend` y `docker compose logs frontend`.
- **La imagen no se muestra:** confirma que la ruta de `persona.foto` comienza con `/uploads/` y que el volumen `uploaded_photos` sigue presente.

## Entrega de la práctica

Completa el PDF con:

1. La URL real del repositorio de GitHub.
2. Los nombres de las imágenes publicadas en Docker Hub.
3. Capturas de `docker compose build`, `docker compose push` y `docker compose ps`.
4. Una captura de los logs de MySQL mostrando la ejecución de `01-init.sql`, y otra de las tablas y registros.
5. Una captura del navegador en `http://localhost:3000` con el CV visible.
6. Las instrucciones de ejecución y el comando `docker compose up -d`.

El repositorio, las imágenes y las capturas de publicación deben corresponder a las cuentas reales del estudiante; este README no inventa esas URL ni esas evidencias.
