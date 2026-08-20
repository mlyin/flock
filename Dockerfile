# Flock — production image for a VPS.
#
# Vercel remains the primary deploy; this exists so the same commit can run on
# a box you control with no platform in the loop. Multi-stage: the runner
# carries the standalone server and nothing else.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild sharp

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time values for NEXT_PUBLIC_* — they are baked into the client bundle,
# so the image is built per environment, not once for all.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3737 HOSTNAME=0.0.0.0
RUN addgroup -S flock && adduser -S flock -G flock
COPY --from=build --chown=flock:flock /app/.next/standalone ./
COPY --from=build --chown=flock:flock /app/.next/static ./.next/static
COPY --from=build --chown=flock:flock /app/public ./public
USER flock
EXPOSE 3737
CMD ["node", "server.js"]
