# Booxnet auf einem eigenen Server (Coolify, Docker, was auch immer).
#
# Der Sinn der Uebung: Weder die App noch der Build braucht zur Laufzeit
# eine fremde Quelle. Die Sprachmodelle liegen gestueckelt im Repository
# (models/supertonic/), der Build setzt sie zusammen und prueft dabei
# jede SHA-256-Summe. Was hier herauskommt, laeuft ohne Hugging Face,
# ohne CDN und ohne fremden Hoster.
#
# Zwei Stufen, damit im Ergebnis kein node_modules landet: Das fertige
# Abbild enthaelt nur nginx und dist/.

FROM node:22-alpine AS build
WORKDIR /app

# Erst die Abhaengigkeiten - diese Schicht bleibt im Cache, solange sich
# package-lock.json nicht aendert. Ohne die Trennung wuerde jede
# Quelltext-Aenderung ein volles npm ci ausloesen.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Setzt models/supertonic/ nach public/supertonic/ zusammen (prebuild)
# und baut. Fehlt das Sprachpaket, bricht der Build hier ab - ein Abbild
# ohne Modelle koennte kein Buch vorlesen.
RUN npm run build

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Coolify prueft damit, ob der Dienst lebt.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
