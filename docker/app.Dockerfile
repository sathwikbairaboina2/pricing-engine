FROM node:24.19.0-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @pricing-engine/web build
ENV PRICING_DDB_ENDPOINT=http://dynamodb:8000 PRICING_TABLE=Pricing PRICING_GQL_URL=http://gql:4000/graphql
