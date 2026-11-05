# Descarga de viviendas

Página para coordinar la descarga del camión con las piezas de 6 viviendas: el orden de las paradas, el recorrido en el mapa, qué piezas llegaron, cuáles vinieron dañadas o faltan, comentarios y fotos de cada casa.

**Abrir:** https://agustin1115.github.io/descarga-viviendas/

## Cómo se guardan los datos

- Lo que carga cada persona se guarda en `datos.json` y las fotos en `fotos/casa-N/`, dentro de este repo. Todos los que abren la página ven lo mismo.
- **El repo es público:** cualquiera con el link puede ver los nombres, las ubicaciones de las casas y las fotos, y quedan en el historial de git aunque después se borren.
- Cada celular también guarda una copia propia, así funciona sin señal. Los cambios se suben cuando vuelve la conexión.
- Si dos personas cambian cosas distintas al mismo tiempo, se combinan. Si cambian el mismo dato, queda el último.

## Clave para poder guardar

Sin clave la página se puede ver, pero no guarda en el repo. Para que un celular pueda guardar, hay que pegar una clave una sola vez en la pestaña **Informe**.

Para crear la clave (lo hace el dueño del repo):

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Expiración: hasta unos días después de la descarga.
3. Repository access: **Only select repositories** → `descarga-viviendas`.
4. Permissions → Repository permissions → **Contents: Read and write**.
5. Generar y pasarla al equipo por un canal privado. Esa clave solo puede escribir en este repo. Cuando termine la descarga, borrarla.
