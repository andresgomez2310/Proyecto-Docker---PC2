FROM node:18

# Crear carpeta de trabajo en el contenedor
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias + nodemon
RUN npm install && npm install -g nodemon

# Copiar el resto del código
COPY . .

# Exponer el puerto 4000 para catálogo)
EXPOSE 4000

# Comando por defecto
CMD ["npm", "run", "dev"]
